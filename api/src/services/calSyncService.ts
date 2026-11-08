/**
 * Cal statement sync on the API server.
 *
 * Headless Chromium, with the same two signals the old Render sync used:
 * a normal Mac Chrome user-agent, and AutomationControlled turned off
 * so navigator.webdriver stays down. Username and password come from the
 * environment (CAL_USERNAME, CAL_PASSWORD), never from the request.
 */
import { randomUUID } from "crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, basename } from "path";
import { chromium, type Frame, type Page } from "playwright";
import { warmAnalyzerDetailed } from "./analyzerClient.js";
import { ingestStatementBuffer } from "./statementUpload.js";

const LOGIN_URL = "https://digital-web.cal-online.co.il/login";
const DIGITAL_URL = "https://digital-web.cal-online.co.il/";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const DASHBOARD_SELECTORS =
  ".cardDebitsTransactions-main, .last4digits, app-card-in-debits-transactions, .cardInDeatailsTransactions";
const TRANSACTIONS_VIEW_SELECTORS =
  ".cardInDeatailsTransactions, app-card-in-deatails-transactions, .transactions-table, .export, button[aria-label*='אקסל'], button[aria-label*='ייצוא'], button[aria-label*='יצוא']";

type CalSyncStatus = "queued" | "waking" | "starting" | "logging_in" | "exporting" | "uploading" | "done" | "error";
export type CalSyncTarget = "render" | "server";

export type CalSyncJobPublic = {
  jobId: string;
  target: CalSyncTarget;
  status: CalSyncStatus;
  message: string;
  error?: string;
  result?: { key?: string; provisional?: boolean; skipped?: boolean };
};

type Job = CalSyncJobPublic;

const jobs = new Map<string, Job>();
let activeJobId: string | null = null;
let serverJobId: string | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const WAKE_HTTP_ATTEMPTS = Number(process.env.ANALYZER_WAKE_HTTP_ATTEMPTS || 3);
const WAKE_DEADLINE_MS = 4 * 60_000;
const WAKE_RETRY_MS = 10_000;

/**
 * Same order as the Mac sync, before Chrome starts:
 * 1. GET /health?deep=1 — short ping, starts a sleeping analyzer.
 * 2. GET /api/ingest/wake — 200 ready, or 503 still waking.
 * 3. On 503, wait 10 seconds and repeat, for up to 4 minutes.
 * Called in-process (this job is already inside the API). Cal is not opened if this throws.
 */
async function wakeAnalyzerFirst(job: Job): Promise<void> {
  patch(job, { status: "waking", message: "Waking analyzer…" });
  const deadline = Date.now() + WAKE_DEADLINE_MS;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    await warmAnalyzerDetailed({ maxAttempts: 2 }).catch(() => null);
    const wake = await warmAnalyzerDetailed({ maxAttempts: WAKE_HTTP_ATTEMPTS });
    if (wake.ready) return;
    patch(job, {
      status: "waking",
      message: `Analyzer still waking (try ${attempt}). Waiting 10 seconds…`,
    });
    await sleep(WAKE_RETRY_MS);
  }
  throw new Error("Analyzer did not wake within 4 minutes. Cal was not opened.");
}

/** Playwright's default headless binary is chrome-headless-shell, which Cal rejects. Use full Chrome. */
function fullChromeExecutable(): string {
  const shell = chromium.executablePath();
  const full = shell.replaceAll("chromium_headless_shell", "chromium").replaceAll("chrome-headless-shell", "chrome");
  if (full !== shell && existsSync(full)) return full;
  if (existsSync(shell) && !shell.includes("headless")) return shell;
  throw new Error("Full Chrome is not installed in this image");
}

function credentials(): { username: string; password: string; cardLast4: string } {
  const username = process.env.CAL_USERNAME?.trim() || "";
  const password = process.env.CAL_PASSWORD?.trim() || "";
  const cardLast4 = process.env.CAL_CARD_LAST4?.trim() || "";
  if (!username || !password) {
    throw new Error("Set CAL_USERNAME and CAL_PASSWORD on the API server");
  }
  return { username, password, cardLast4 };
}

function publicJob(job: Job): CalSyncJobPublic {
  return {
    jobId: job.jobId,
    target: job.target,
    status: job.status,
    message: job.message,
    error: job.error,
    result: job.result,
  };
}

function patch(job: Job, patch: Partial<Pick<Job, "status" | "message" | "error" | "result">>): void {
  Object.assign(job, patch);
  console.log(`Cal sync ${job.jobId}: ${job.status} — ${job.message}`);
}

function scrub(message: string, password: string): string {
  const cleaned = password ? message.split(password).join("••••") : message;
  return cleaned.slice(0, 300);
}

async function findContext(page: Page, selector: string): Promise<Page | Frame | null> {
  for (const ctx of [page, ...page.frames()]) {
    try {
      if (await ctx.$(selector)) return ctx;
    } catch {
      /* detached frame */
    }
  }
  return null;
}

async function waitForContext(page: Page, selector: string, timeoutMs: number, what: string): Promise<Page | Frame> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ctx = await findContext(page, selector);
    if (ctx) return ctx;
    await sleep(500);
  }
  throw new Error(`${what} did not appear (${page.url()})`);
}

async function isRejected(page: Page): Promise<boolean> {
  try {
    return /request rejected|access denied/i.test(await page.title());
  } catch {
    return false;
  }
}

async function openLogin(page: Page): Promise<void> {
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (await isRejected(page)) throw new Error("Cal rejected this browser (Request Rejected / Access Denied)");
  await waitForContext(page, '[formcontrolname="id"], #regular-login, [formcontrolname="userName"]', 60_000, "Cal login form");
}

async function signInWithPassword(page: Page, username: string, password: string): Promise<void> {
  const tabCtx = await waitForContext(page, "#regular-login", 30_000, "Username login tab");
  await tabCtx.click("#regular-login");
  const ctx = await waitForContext(page, '[formcontrolname="userName"]', 20_000, "Username field");
  await ctx.fill('[formcontrolname="userName"]', username);
  await ctx.fill('[formcontrolname="password"]', password);
  await ctx.click('button[type="submit"]');
}

async function hasOtpField(page: Page): Promise<boolean> {
  return Boolean((await findContext(page, '[formcontrolname="otp"]')) && !(await findContext(page, '[formcontrolname="id"]')));
}

async function errorText(page: Page): Promise<string> {
  const ctx = await findContext(page, "div.general-error, .err-desc, .error-message");
  if (!ctx) return "";
  try {
    return (await ctx.innerText("div.general-error, .err-desc, .error-message")).trim().slice(0, 160);
  } catch {
    return "";
  }
}

async function finishLogin(page: Page): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await findContext(page, DASHBOARD_SELECTORS)) return;
    if (/change-password/i.test(page.url())) {
      throw new Error("Cal asks to change the password. Change it in the Cal app, then update CAL_PASSWORD.");
    }
    if (await hasOtpField(page)) {
      throw new Error("Cal asked for an SMS code. Username sign-in did not finish.");
    }
    const err = await errorText(page);
    if (err) throw new Error(`Cal sign-in error: ${err}`);
    if (!/login|connect/i.test(page.url()) && !/digital-web/i.test(page.url())) {
      await page.goto(DIGITAL_URL, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => null);
    }
    await sleep(1500);
  }
  throw new Error(`Cal dashboard did not load after sign-in (${page.url()})`);
}

async function dismissPopups(page: Page): Promise<void> {
  for (let round = 0; round < 4; round++) {
    let found = false;
    for (const ctx of page.frames()) {
      try {
        const dialog = ctx.locator(".rc-popup-wrapper.show, [role='dialog'][aria-modal='true']").first();
        if (!(await dialog.count()) || !(await dialog.isVisible())) continue;
        found = true;
        const close = dialog
          .locator(
            "button[aria-label*='סגור'], button[aria-label*='סגירה'], button[aria-label*='close' i], .close, .btn-close, button[class*='close'], [class*='close-btn']",
          )
          .first();
        if ((await close.count()) && (await close.isVisible())) {
          await close.click({ timeout: 5000 });
        } else {
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

async function openCardTransactions(page: Page, cardLast4: string): Promise<void> {
  const ctx = await waitForContext(page, ".cardDebitsTransactions-main", 60_000, "Card list");
  await sleep(1500);
  await dismissPopups(page);
  const cards = ctx.locator(".cardDebitsTransactions-main");
  const target = cardLast4 ? cards.filter({ hasText: cardLast4 }).first() : cards.first();
  await ((await target.count()) ? target : cards.first()).click();
  await waitForContext(page, TRANSACTIONS_VIEW_SELECTORS, 60_000, "Card transactions view");
}

async function clickExport(page: Page): Promise<void> {
  const deadline = Date.now() + 120_000;
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
        /* detached frame */
      }
    }
    await sleep(700);
  }
  throw new Error("Export button (יצוא / ייצוא לאקסל) not found");
}

async function exportExcel(page: Page, cardLast4: string): Promise<{ filePath: string; dir: string }> {
  await openCardTransactions(page, cardLast4);
  await dismissPopups(page);
  const downloadPromise = page.waitForEvent("download", { timeout: 90_000 });
  await clickExport(page);
  const download = await downloadPromise;
  const dir = mkdtempSync(join(tmpdir(), "cal-sync-"));
  const filePath = join(dir, download.suggestedFilename() || "cal-export.xlsx");
  await download.saveAs(filePath);
  return { filePath, dir };
}

async function run(job: Job, password: string): Promise<void> {
  let tmpDir: string | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    const { username, cardLast4 } = credentials();
    await wakeAnalyzerFirst(job);
    browser = await chromium.launch({
      headless: true,
      executablePath: fullChromeExecutable(),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--lang=he-IL",
      ],
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
    patch(job, { status: "logging_in", message: "Signing in to Cal…" });
    await openLogin(page);
    await signInWithPassword(page, username, password);
    await finishLogin(page);
    patch(job, { status: "exporting", message: "Downloading the statement…" });
    const exported = await exportExcel(page, cardLast4);
    tmpDir = exported.dir;
    patch(job, { status: "uploading", message: "Saving the statement…" });
    const result = await ingestStatementBuffer(readFileSync(exported.filePath), basename(exported.filePath), "partial", true);
    if ("skipped" in result) {
      patch(job, { status: "done", message: "Statement unchanged", result: { skipped: true } });
      return;
    }
    patch(job, {
      status: "done",
      message: "Statement saved",
      result: { key: result.key, provisional: result.provisional },
    });
  } catch (e) {
    const message = scrub(e instanceof Error ? e.message : String(e), password);
    patch(job, { status: "error", message, error: message });
  } finally {
    if (activeJobId === job.jobId) activeJobId = null;
    await browser?.close().catch(() => null);
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  }
}

export function getCalSyncJob(jobId: string): CalSyncJobPublic | null {
  const job = jobs.get(jobId);
  return job ? publicJob(job) : null;
}

function runningJob(jobId: string | null): Job | null {
  if (!jobId) return null;
  const job = jobs.get(jobId);
  if (!job || job.status === "done" || job.status === "error") return null;
  return job;
}

/** Totoshka pulls this. The phone never calls that machine directly. */
export function claimServerJob(): CalSyncJobPublic | null {
  const job = runningJob(serverJobId);
  if (!job || job.status !== "queued") return null;
  patch(job, { status: "waking", message: "Server picked up the sync. Waking analyzer…" });
  return publicJob(job);
}

export function updateServerJob(
  jobId: string,
  update: Partial<Pick<Job, "status" | "message" | "error" | "result">>,
): CalSyncJobPublic | null {
  const job = jobs.get(jobId);
  if (!job || job.target !== "server") return null;
  patch(job, update);
  if (job.status === "done" || job.status === "error") {
    if (serverJobId === job.jobId) serverJobId = null;
  }
  return publicJob(job);
}

function startServerJob(): CalSyncJobPublic {
  if (!process.env.CAL_WORKER_SECRET?.trim()) {
    throw new Error("Set CAL_WORKER_SECRET on the API server and on Totoshka");
  }
  const running = runningJob(serverJobId);
  if (running) return publicJob(running);
  const job: Job = {
    jobId: randomUUID(),
    target: "server",
    status: "queued",
    message: "Waiting for the server…",
  };
  jobs.set(job.jobId, job);
  serverJobId = job.jobId;
  console.log(`Cal sync ${job.jobId}: queued for the server`);
  return publicJob(job);
}

/** Start a background sync, or return the one already running on that machine. */
export function startCalSync(target: CalSyncTarget = "render"): CalSyncJobPublic {
  if (target === "server") return startServerJob();
  if (activeJobId) {
    const running = jobs.get(activeJobId);
    if (running && running.status !== "done" && running.status !== "error") return publicJob(running);
  }
  const { password } = credentials();
  const job: Job = {
    jobId: randomUUID(),
    target: "render",
    status: "waking",
    message: "Waking analyzer…",
  };
  jobs.set(job.jobId, job);
  activeJobId = job.jobId;
  void run(job, password);
  return publicJob(job);
}
