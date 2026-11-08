#!/usr/bin/env node
/**
 * Cal → Finance, on the Mac.
 *
 * Opens your installed Google Chrome as a normal visible window (Cal rejects cloud servers and
 * headless browsers), signs in, downloads the card's Excel export and uploads it to the
 * Finance API as a partial (mid-cycle) statement.
 *
 * Sign-in:
 *   - "password" (default): Cal username + fixed password (the "כניסה עם שם משתמש" tab).
 *   - "sms": ID number + last 4 card digits, then an SMS code.
 *   If Cal asks for an SMS code in either mode, the script waits for it at the Finance API,
 *   where an iPhone Shortcut forwards Cal's SMS (POST /api/ingest/otp).
 *
 * Secrets live in the macOS Keychain (service "finance-cal-sync"), never in files:
 *   cal-username, cal-password   (password mode)
 *   cal-id                        (sms mode)
 *   ingest-key                    (the API's INGEST_SECRET)
 * Settings (not secret): ~/.config/finance-cal-sync/config.json
 *   { "apiBase": "https://….onrender.com", "cardLast4": "1234", "loginMode": "password" }
 *
 * Usage:
 *   node cal-sync.mjs            full run
 *   node cal-sync.mjs --check    open Cal's login page and check the form is there; no sign-in
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, rmSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, basename } from "node:path";
import { chromium } from "playwright-core";

const LOGIN_URL = "https://digital-web.cal-online.co.il/login";
const DIGITAL_URL = "https://digital-web.cal-online.co.il/";
const KEYCHAIN_SERVICE = "finance-cal-sync";
const CONFIG_PATH = join(homedir(), ".config", "finance-cal-sync", "config.json");
const LOG_PATH = join(homedir(), "Library", "Logs", "finance-cal-sync.log");
const DASHBOARD_SELECTORS =
  ".cardDebitsTransactions-main, .last4digits, app-card-in-debits-transactions, .cardInDeatailsTransactions";
const TRANSACTIONS_VIEW_SELECTORS =
  ".cardInDeatailsTransactions, app-card-in-deatails-transactions, .transactions-table, .export, button[aria-label*='אקסל'], button[aria-label*='ייצוא'], button[aria-label*='יצוא']";
const OTP_WAIT_MS = 4 * 60_000;

const CHECK_ONLY = process.argv.includes("--check");

// ---------- small helpers ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(message) {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(line);
  try {
    mkdirSync(join(homedir(), "Library", "Logs"), { recursive: true });
    appendFileSync(LOG_PATH, `${line}\n`);
  } catch {
    /* logging is best effort */
  }
}

function notify(title, message) {
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  try {
    execFileSync("osascript", ["-e", `display notification "${esc(message)}" with title "${esc(title)}"`]);
  } catch {
    /* notifications are best effort */
  }
}

function keychain(account, { required = true } = {}) {
  try {
    return execFileSync("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    if (required) throw new Error(`Keychain item "${account}" (service ${KEYCHAIN_SERVICE}) is missing. See README.`);
    return "";
  }
}

function readConfig() {
  let cfg = {};
  try {
    cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    if (!CHECK_ONLY) throw new Error(`Missing ${CONFIG_PATH}. See README.`);
  }
  return {
    apiBase: String(cfg.apiBase || "").replace(/\/+$/, ""),
    cardLast4: String(cfg.cardLast4 || ""),
    loginMode: cfg.loginMode === "sms" ? "sms" : "password",
    statementType: cfg.statementType === "final" ? "final" : "partial",
  };
}

/** Find the page or a frame (Cal's login lives in a "connect" iframe) that has a selector. */
async function findContext(page, selector) {
  for (const ctx of [page.mainFrame(), ...page.frames()]) {
    try {
      if (await ctx.$(selector)) return ctx;
    } catch {
      /* detached frame */
    }
  }
  return null;
}

async function waitForContext(page, selector, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ctx = await findContext(page, selector);
    if (ctx) return ctx;
    await sleep(500);
  }
  throw new Error(`${what} did not appear (${page.url()})`);
}

async function isRejected(page) {
  try {
    const title = await page.title();
    return /request rejected|access denied/i.test(title);
  } catch {
    return false;
  }
}

// ---------- Finance API ----------

async function api(cfg, key, path, init = {}) {
  const res = await fetch(`${cfg.apiBase}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), "X-Ingest-Key": key },
  });
  return res;
}

/** Free-tier Render sleeps; wake it before Cal can send an SMS code to it. */
async function wakeApi(cfg, key) {
  log("Waking the Finance API…");
  const deadline = Date.now() + 4 * 60_000;
  while (Date.now() < deadline) {
    try {
      await fetch(`${cfg.apiBase}/health?deep=1`).catch(() => null);
      const res = await api(cfg, key, "/api/ingest/wake");
      if (res.ok) {
        log("Finance API is awake");
        return;
      }
      if (res.status === 401) throw new Error("Finance API rejected the ingest key (401). Check the ingest-key Keychain item.");
    } catch (e) {
      if (/401/.test(String(e))) throw e;
    }
    await sleep(10_000);
  }
  throw new Error("Finance API did not wake up within 4 minutes");
}

async function waitForSmsCode(cfg, key, sinceMs) {
  log("Cal asked for an SMS code; waiting for the iPhone Shortcut to forward it…");
  notify("Cal sync", "Cal sent an SMS code. Waiting for the iPhone Shortcut to forward it.");
  const deadline = Date.now() + OTP_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await api(cfg, key, `/api/ingest/otp?since=${sinceMs}`);
      if (res.status === 200) {
        const { code } = await res.json();
        if (code) {
          log("SMS code received");
          return code;
        }
      }
    } catch {
      /* keep polling */
    }
    await sleep(3000);
  }
  throw new Error("No SMS code arrived within 4 minutes. Check the iPhone Shortcut.");
}

async function uploadStatement(cfg, key, filePath, statementType) {
  log(`Uploading ${basename(filePath)} as ${statementType}…`);
  const form = new FormData();
  form.append("file", new Blob([readFileSync(filePath)]), basename(filePath));
  form.append("statement_type", statementType);
  const res = await api(cfg, key, "/api/ingest", { method: "POST", body: form });
  const text = await res.text();
  if (!res.ok) throw new Error(`Upload failed (${res.status}): ${text.slice(0, 200)}`);
  return text;
}

// ---------- Cal steps ----------

async function openLogin(page) {
  log("Opening Cal login…");
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (await isRejected(page)) throw new Error("Cal rejected this browser (Request Rejected / Access Denied)");
  await waitForContext(page, '[formcontrolname="id"], #regular-login, [formcontrolname="userName"]', 60_000, "Cal login form");
}

async function signInWithPassword(page, username, password) {
  const tabCtx = await waitForContext(page, "#regular-login", 30_000, "Username login tab");
  await tabCtx.click("#regular-login");
  const ctx = await waitForContext(page, '[formcontrolname="userName"]', 20_000, "Username field");
  await ctx.fill('[formcontrolname="userName"]', username);
  await ctx.fill('[formcontrolname="password"]', password);
  await ctx.click('button[type="submit"]');
  log("Signed in with username and password; waiting…");
}

async function signInWithSms(page, nationalId, cardLast4) {
  const ctx = await waitForContext(page, '[formcontrolname="id"]', 30_000, "ID field");
  await ctx.fill('[formcontrolname="id"]', nationalId);
  await ctx.fill('[formcontrolname="secondOtpParam"]', cardLast4);
  const sms = ctx.getByText("שלחו לי סיסמה").first();
  if (await sms.count()) await sms.click();
  else await ctx.click('button[type="submit"]');
  log("Requested an SMS code…");
}

async function hasOtpField(page) {
  return Boolean((await findContext(page, '[formcontrolname="otp"]')) && !(await findContext(page, '[formcontrolname="id"]')));
}

async function fillOtp(page, code) {
  const ctx = await waitForContext(page, '[formcontrolname="otp"]', 20_000, "SMS code field");
  await ctx.fill('[formcontrolname="otp"]', code);
  const confirm = ctx.locator("button").filter({ hasText: /אישור|כניסה|המשך|אימות/ }).first();
  if (await confirm.count()) await confirm.click();
  else await ctx.click('button[type="submit"]');
  log("SMS code entered");
}

async function errorText(page) {
  const ctx = await findContext(page, "div.general-error, .err-desc, .error-message");
  if (!ctx) return "";
  try {
    return (await ctx.innerText("div.general-error, .err-desc, .error-message")).trim().slice(0, 160);
  } catch {
    return "";
  }
}

/** After submitting: handle an SMS code if Cal asks, then wait for the dashboard. */
async function finishLogin(page, cfg, key, sinceMs) {
  const deadline = Date.now() + OTP_WAIT_MS + 120_000;
  let otpDone = false;
  while (Date.now() < deadline) {
    if (await findContext(page, DASHBOARD_SELECTORS)) return;
    if (/change-password/i.test(page.url())) throw new Error("Cal asks to change the password. Do it once in the Cal app, then update the Keychain.");
    const err = await errorText(page);
    if (err && !otpDone) throw new Error(`Cal sign-in error: ${err}`);
    if (!otpDone && (await hasOtpField(page))) {
      const code = await waitForSmsCode(cfg, key, sinceMs);
      await fillOtp(page, code);
      otpDone = true;
    }
    if (!/login|connect/i.test(page.url()) && !/digital-web/i.test(page.url())) {
      await page.goto(DIGITAL_URL, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => null);
    }
    await sleep(1500);
  }
  throw new Error(`Cal dashboard did not load after sign-in (${page.url()})`);
}

async function openCardTransactions(page, cardLast4) {
  const ctx = await waitForContext(page, ".cardDebitsTransactions-main", 60_000, "Card list");
  const cards = ctx.locator(".cardDebitsTransactions-main");
  const target = cardLast4 ? cards.filter({ hasText: cardLast4 }).first() : cards.first();
  await ((await target.count()) ? target : cards.first()).click();
  await waitForContext(page, TRANSACTIONS_VIEW_SELECTORS, 60_000, "Card transactions view");
  log("Card transactions open");
}

async function clickExport(page) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    for (const ctx of page.frames()) {
      try {
        const excel = ctx
          .locator("button, a, [role='button']")
          .filter({ hasText: /י{1,2}צוא.*אקסל|אקסל|excel/i })
          .first();
        if (await excel.count()) {
          await excel.click();
          return;
        }
        const exportBtn = ctx.locator("button, a, [role='button']").filter({ hasText: /^\s*י{1,2}צוא\s*$/ }).first();
        if (await exportBtn.count()) {
          await exportBtn.click();
          await sleep(800);
          const menuItem = ctx.locator("button, a, [role='button'], li").filter({ hasText: /אקסל|excel/i }).first();
          if (await menuItem.count()) {
            await menuItem.click();
            return;
          }
        }
        const byLabel = ctx.locator("[aria-label*='אקסל'], [aria-label*='ייצוא'], [aria-label*='יצוא']").first();
        if (await byLabel.count()) {
          await byLabel.click();
          return;
        }
      } catch {
        /* detached frame; retry */
      }
    }
    await sleep(700);
  }
  throw new Error("Export button (יצוא / ייצוא לאקסל) not found");
}

async function exportExcel(page, cardLast4) {
  await openCardTransactions(page, cardLast4);
  const downloadPromise = page.waitForEvent("download", { timeout: 90_000 });
  await clickExport(page);
  const download = await downloadPromise;
  const dir = mkdtempSync(join(tmpdir(), "cal-sync-"));
  const filePath = join(dir, download.suggestedFilename() || "cal-export.xlsx");
  await download.saveAs(filePath);
  log(`Downloaded ${basename(filePath)}`);
  return { filePath, dir };
}

// ---------- main ----------

async function main() {
  const cfg = readConfig();
  const browser = await chromium.launch({ channel: "chrome", headless: false });
  const context = await browser.newContext({ acceptDownloads: true, locale: "he-IL", viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  let tmpDir = null;
  try {
    if (CHECK_ONLY) {
      await openLogin(page);
      const hasPassword = Boolean(await findContext(page, "#regular-login"));
      const hasSms = Boolean(await findContext(page, '[formcontrolname="id"]'));
      log(`Check OK: login page loaded (username tab: ${hasPassword}, SMS tab: ${hasSms})`);
      return;
    }
    if (!cfg.apiBase) throw new Error(`apiBase is missing in ${CONFIG_PATH}`);
    const key = keychain("ingest-key");
    await wakeApi(cfg, key);

    await openLogin(page);
    const sinceMs = Date.now();
    if (cfg.loginMode === "sms") {
      if (!cfg.cardLast4) throw new Error("cardLast4 is needed in config.json for SMS sign-in");
      await signInWithSms(page, keychain("cal-id"), cfg.cardLast4);
    } else {
      await signInWithPassword(page, keychain("cal-username"), keychain("cal-password"));
    }
    await finishLogin(page, cfg, key, sinceMs);
    log("Cal dashboard loaded");

    const { filePath, dir } = await exportExcel(page, cfg.cardLast4);
    tmpDir = dir;
    await uploadStatement(cfg, key, filePath, cfg.statementType);
    log("Done: statement uploaded");
    notify("Cal sync", "Statement downloaded and uploaded to Finance.");
  } finally {
    await browser.close().catch(() => null);
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  log(`FAILED: ${message}`);
  notify("Cal sync failed", message);
  process.exitCode = 1;
});
