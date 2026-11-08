#!/usr/bin/env node
/**
 * Same Cal sync as Render, running on Totoshka.
 * Pulls a job from the Finance API, wakes the analyzer, opens full Chrome, uploads the Excel.
 *
 * Reads ~/.config/totoshka/finance.env when started by tools/cal-worker/start.sh:
 *   FINANCE_API_URL, CAL_WORKER_SECRET, CAL_USERNAME, CAL_PASSWORD
 *   CAL_CARD_LAST4 is optional
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { chromium } from "playwright";

const API = String(process.env.FINANCE_API_URL || "").replace(/\/+$/, "");
const WORKER = String(process.env.CAL_WORKER_SECRET || "").trim();
const USERNAME = String(process.env.CAL_USERNAME || "").trim();
const PASSWORD = String(process.env.CAL_PASSWORD || "").trim();
const CARD = String(process.env.CAL_CARD_LAST4 || "").trim();

const LOGIN_URL = "https://digital-web.cal-online.co.il/login";
const DIGITAL_URL = "https://digital-web.cal-online.co.il/";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const DASHBOARD =
  ".cardDebitsTransactions-main, .last4digits, app-card-in-debits-transactions, .cardInDeatailsTransactions";
const TRANSACTIONS =
  ".cardInDeatailsTransactions, app-card-in-deatails-transactions, .transactions-table, .export, button[aria-label*='אקסל'], button[aria-label*='ייצוא'], button[aria-label*='יצוא']";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function requireEnv() {
  const missing = ["FINANCE_API_URL", "CAL_WORKER_SECRET", "CAL_USERNAME", "CAL_PASSWORD"].filter((name) => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Missing ${missing.join(", ")} in the environment`);
}

function fullChromeExecutable() {
  const shell = chromium.executablePath();
  const full = shell.replaceAll("chromium_headless_shell", "chromium").replaceAll("chrome-headless-shell", "chrome");
  if (full !== shell && existsSync(full)) return full;
  if (existsSync(shell) && !shell.includes("headless")) return shell;
  throw new Error("Full Chrome is not installed. Run: npx playwright install chromium");
}

async function report(jobId, body) {
  const res = await fetch(`${API}/api/cal/worker/jobs/${jobId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Cal-Worker-Key": WORKER },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Could not report status (${res.status})`);
}

async function wakeAnalyzer(jobId) {
  const deadline = Date.now() + 4 * 60_000;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    await fetch(`${API}/health?deep=1`).catch(() => null);
    const res = await fetch(`${API}/api/cal/worker/wake`, { headers: { "X-Cal-Worker-Key": WORKER } }).catch(() => null);
    if (res?.ok) return;
    if (res?.status === 401) throw new Error("CAL_WORKER_SECRET was rejected.");
    await report(jobId, { status: "waking", message: `Analyzer still waking (try ${attempt}). Waiting 10 seconds…` }).catch(() => null);
    await sleep(10_000);
  }
  throw new Error("Analyzer did not wake within 4 minutes. Cal was not opened.");
}

async function findContext(page, selector) {
  for (const ctx of [page, ...page.frames()]) {
    try {
      if (await ctx.$(selector)) return ctx;
    } catch {
      /* detached */
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

async function openLogin(page) {
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const title = await page.title().catch(() => "");
  if (/request rejected|access denied/i.test(title)) {
    throw new Error("Cal rejected this browser (Request Rejected / Access Denied)");
  }
  await waitForContext(page, '[formcontrolname="id"], #regular-login, [formcontrolname="userName"]', 60_000, "Cal login form");
}

async function signIn(page) {
  const tab = await waitForContext(page, "#regular-login", 30_000, "Username login tab");
  await tab.click("#regular-login");
  const ctx = await waitForContext(page, '[formcontrolname="userName"]', 20_000, "Username field");
  await ctx.fill('[formcontrolname="userName"]', USERNAME);
  await ctx.fill('[formcontrolname="password"]', PASSWORD);
  await ctx.click('button[type="submit"]');
}

async function finishLogin(page) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await findContext(page, DASHBOARD)) return;
    if (/change-password/i.test(page.url())) {
      throw new Error("Cal asks to change the password. Change it in the Cal app, then update CAL_PASSWORD.");
    }
    const otp = await findContext(page, '[formcontrolname="otp"]');
    const id = await findContext(page, '[formcontrolname="id"]');
    if (otp && !id) throw new Error("Cal asked for an SMS code. Username sign-in did not finish.");
    const errCtx = await findContext(page, "div.general-error, .err-desc, .error-message");
    if (errCtx) {
      const err = await errCtx.innerText("div.general-error, .err-desc, .error-message").catch(() => "");
      if (err.trim()) throw new Error(`Cal sign-in error: ${err.trim().slice(0, 160)}`);
    }
    if (!/login|connect/i.test(page.url()) && !/digital-web/i.test(page.url())) {
      await page.goto(DIGITAL_URL, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => null);
    }
    await sleep(1500);
  }
  throw new Error(`Cal dashboard did not load after sign-in (${page.url()})`);
}

async function dismissPopups(page) {
  for (let round = 0; round < 4; round++) {
    let found = false;
    for (const ctx of page.frames()) {
      try {
        const dialog = ctx.locator(".rc-popup-wrapper.show, [role='dialog'][aria-modal='true']").first();
        if (!(await dialog.count()) || !(await dialog.isVisible())) continue;
        found = true;
        const close = dialog
          .locator("button[aria-label*='סגור'], button[aria-label*='סגירה'], button[aria-label*='close' i], .close, .btn-close, button[class*='close'], [class*='close-btn']")
          .first();
        if ((await close.count()) && (await close.isVisible())) await close.click({ timeout: 5000 });
        else {
          const later = dialog.locator("button").filter({ hasText: /סגור|סגירה|לא עכשיו|אחר כך|הבנתי|המשך|דלג/ }).first();
          if (await later.count()) await later.click({ timeout: 5000 });
          else await page.keyboard.press("Escape");
        }
        await sleep(800);
      } catch {
        await page.keyboard.press("Escape").catch(() => null);
        await sleep(500);
      }
    }
    if (!found) return;
  }
}

async function clickExport(page) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    for (const ctx of page.frames()) {
      try {
        const excel = ctx.locator("button, a, [role='button']").filter({ hasText: /י{1,2}צוא.*אקסל|אקסל|excel/i }).first();
        if (await excel.count()) {
          await excel.click();
          return;
        }
        const exportBtn = ctx.locator("button, a, [role='button']").filter({ hasText: /^\s*י{1,2}צוא\s*$/ }).first();
        if (await exportBtn.count()) {
          await exportBtn.click();
          await sleep(800);
          const item = ctx.locator("button, a, [role='button'], li").filter({ hasText: /אקסל|excel/i }).first();
          if (await item.count()) {
            await item.click();
            return;
          }
        }
        const byLabel = ctx.locator("[aria-label*='אקסל'], [aria-label*='ייצוא'], [aria-label*='יצוא']").first();
        if (await byLabel.count()) {
          await byLabel.click();
          return;
        }
      } catch {
        /* detached */
      }
    }
    await sleep(700);
  }
  throw new Error("Export button (יצוא / ייצוא לאקסל) not found");
}

async function exportExcel(page) {
  const ctx = await waitForContext(page, ".cardDebitsTransactions-main", 60_000, "Card list");
  await sleep(1500);
  await dismissPopups(page);
  const cards = ctx.locator(".cardDebitsTransactions-main");
  const target = CARD ? cards.filter({ hasText: CARD }).first() : cards.first();
  await ((await target.count()) ? target : cards.first()).click();
  await waitForContext(page, TRANSACTIONS, 60_000, "Card transactions view");
  await dismissPopups(page);
  const downloadPromise = page.waitForEvent("download", { timeout: 90_000 });
  await clickExport(page);
  const download = await downloadPromise;
  const dir = mkdtempSync(join(tmpdir(), "cal-sync-"));
  const filePath = join(dir, download.suggestedFilename() || "cal-export.xlsx");
  await download.saveAs(filePath);
  return { filePath, dir };
}

async function upload(jobId, filePath) {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(filePath)]), basename(filePath));
  const res = await fetch(`${API}/api/cal/worker/jobs/${jobId}/file`, {
    method: "POST",
    headers: { "X-Cal-Worker-Key": WORKER },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed (${res.status}): ${text.slice(0, 180)}`);
  }
}

async function runJob(jobId) {
  let browser = null;
  let tmpDir = null;
  try {
    await report(jobId, { status: "waking", message: "Waking analyzer…" });
    await wakeAnalyzer(jobId);
    await report(jobId, { status: "logging_in", message: "Signing in to Cal…" });
    browser = await chromium.launch({
      headless: true,
      executablePath: fullChromeExecutable(),
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled", "--lang=he-IL"],
    });
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      locale: "he-IL",
      viewport: { width: 1280, height: 900 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    const client = await context.newCDPSession(page);
    await client.send("Network.setUserAgentOverride", {
      userAgent: USER_AGENT,
      acceptLanguage: "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
      platform: "MacIntel",
      userAgentMetadata: {
        brands: [
          { brand: "Chromium", version: "142" },
          { brand: "Google Chrome", version: "142" },
          { brand: "Not_A Brand", version: "24" },
        ],
        fullVersionList: [
          { brand: "Chromium", version: "142.0.0.0" },
          { brand: "Google Chrome", version: "142.0.0.0" },
          { brand: "Not_A Brand", version: "24.0.0.0" },
        ],
        fullVersion: "142.0.0.0",
        platform: "macOS",
        platformVersion: "10.15.7",
        architecture: "x86",
        model: "",
        mobile: false,
        bitness: "64",
        wow64: false,
      },
    });
    await openLogin(page);
    await signIn(page);
    await finishLogin(page);
    await report(jobId, { status: "exporting", message: "Downloading the statement…" });
    const exported = await exportExcel(page);
    tmpDir = exported.dir;
    await report(jobId, { status: "uploading", message: "Saving the statement…" });
    await upload(jobId, exported.filePath);
  } catch (e) {
    let message = e instanceof Error ? e.message : String(e);
    if (PASSWORD) message = message.split(PASSWORD).join("••••");
    message = message.slice(0, 300);
    await report(jobId, { status: "error", message, error: message }).catch(() => null);
  } finally {
    await browser?.close().catch(() => null);
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function claim() {
  const res = await fetch(`${API}/api/cal/worker/claim`, { method: "POST", headers: { "X-Cal-Worker-Key": WORKER } });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`Claim failed (${res.status})`);
  return res.json();
}

async function main() {
  requireEnv();
  console.log(`Cal worker polling ${API}`);
  for (;;) {
    try {
      const job = await claim();
      if (job?.jobId) {
        console.log(`Running ${job.jobId}`);
        await runJob(job.jobId);
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
    }
    await sleep(5_000);
  }
}

main();
