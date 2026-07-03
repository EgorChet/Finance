import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import puppeteer, { type Browser, type Frame, type Page } from "puppeteer";
import type { CalCredentialsData } from "../storage/calCredentials.js";
import { persistCalSyncExport } from "./calSyncPersist.js";

const LOGIN_URL = "https://www.cal-online.co.il/";
const DIGITAL_URL = "https://digital-web.cal-online.co.il/";

const JOB_IDLE_TTL_MS = 10 * 60 * 1000;
const JOB_MAX_AGE_MS = 20 * 60 * 1000;
const OTP_WAIT_MS = 3 * 60 * 1000;
const PHASE_TIMEOUT_MS = 180_000;
const DASHBOARD_TIMEOUT_MS = 150_000;
const MAX_LOG_LINES = 80;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

export type CalJobStatus =
  | "starting"
  | "otp_required"
  | "scraping"
  | "saving"
  | "done"
  | "error"
  | "cancelled";

export interface CalSyncLogEntry {
  at: string;
  message: string;
}

export interface CalSyncJob {
  id: string;
  status: CalJobStatus;
  message?: string;
  logs: CalSyncLogEntry[];
  error?: string;
  xlsxBuffer?: Buffer;
  xlsxFilename?: string;
  savedStatementKey?: string;
  createdAt: number;
  updatedAt: number;
  browser?: Browser;
  page?: Page;
  otpPromise?: Promise<string>;
  otpResolve?: (code: string) => void;
  otpReject?: (err: Error) => void;
  pipelineDone?: Promise<void>;
}

const jobs = new Map<string, CalSyncJob>();

function resolveChromiumPath(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH?.trim()) {
    return process.env.PUPPETEER_EXECUTABLE_PATH.trim();
  }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/ms-playwright";
  try {
    const dirs = readdirSync(root).filter((d) => d.startsWith("chromium-"));
    for (const dir of dirs.sort().reverse()) {
      const candidate = join(root, dir, "chrome-linux", "chrome");
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    /* local dev — bundled Chromium */
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isDetachedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /detached Frame|Execution context was destroyed|Cannot find context/i.test(msg);
}

function jobLog(job: CalSyncJob | undefined, message: string): void {
  const line = `[cal-sync${job ? ` ${job.id.slice(0, 8)}` : ""}] ${message}`;
  console.log(line);
  if (!job) return;
  job.message = message;
  job.updatedAt = Date.now();
  job.logs.push({ at: new Date().toISOString(), message });
  if (job.logs.length > MAX_LOG_LINES) job.logs.shift();
}

async function retry<T>(
  job: CalSyncJob,
  label: string,
  fn: () => Promise<T>,
  attempts = 4,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isDetachedError(err) || i === attempts - 1) throw err;
      jobLog(job, `${label}: page reloaded, retry ${i + 2}/${attempts}…`);
      await sleep(800 + i * 400);
    }
  }
  throw lastErr;
}

async function frameAlive(frame: Frame): Promise<boolean> {
  try {
    await frame.evaluate(() => true);
    return true;
  } catch {
    return false;
  }
}

type PageOrFrame = Page | Frame;

async function findSelectorContext(page: Page, selector: string): Promise<PageOrFrame | null> {
  try {
    if (await page.$(selector)) return page;
  } catch {
    /* ignore */
  }
  for (const frame of page.frames()) {
    try {
      if ((await frameAlive(frame)) && (await frame.$(selector))) return frame;
    } catch {
      /* detached */
    }
  }
  return null;
}

async function requireContext(page: Page, job: CalSyncJob, selector: string, timeoutMs = 30_000): Promise<PageOrFrame> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ctx = await findSelectorContext(page, selector);
    if (ctx) return ctx;
    await sleep(500);
  }
  throw new Error(`Cal control not found: ${selector}`);
}

async function safeClick(target: PageOrFrame, selector: string, timeoutMs = 15_000): Promise<void> {
  await target.waitForSelector(selector, { visible: true, timeout: timeoutMs });
  const clicked = await target.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!(el instanceof HTMLElement)) return false;
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    el.click();
    return true;
  }, selector);
  if (!clicked) throw new Error(`Could not click: ${selector}`);
}

async function safeType(target: PageOrFrame, selector: string, value: string): Promise<void> {
  await target.waitForSelector(selector, { visible: true, timeout: 15_000 });
  await target.evaluate(
    (sel, text) => {
      const el = document.querySelector(sel);
      if (!(el instanceof HTMLInputElement)) throw new Error(`Input not found: ${sel}`);
      el.focus();
      el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    selector,
    value,
  );
}

async function clickByText(target: PageOrFrame, text: string): Promise<void> {
  const clicked = await target.evaluate((needle) => {
    const candidates = document.querySelectorAll("button, a, span, strong, div[role='button']");
    for (const el of candidates) {
      if (!el.textContent?.includes(needle)) continue;
      const clickTarget = (el.closest("button, a") ?? el) as HTMLElement;
      clickTarget.click();
      return true;
    }
    return false;
  }, text);
  if (!clicked) throw new Error(`Could not click text: ${text}`);
}

function purgeExpiredJobs(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    const age = now - job.createdAt;
    const idle = now - job.updatedAt;
    const terminal =
      job.status === "done" || job.status === "error" || job.status === "cancelled";
    if (age > JOB_MAX_AGE_MS) void cleanupJob(id);
    else if (terminal && idle > JOB_IDLE_TTL_MS) void cleanupJob(id);
  }
}

async function cleanupJob(jobId: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) return;
  jobs.delete(jobId);
  if (job.otpReject) job.otpReject(new Error("Sync cancelled"));
  if (job.browser) {
    try {
      await job.browser.close();
    } catch {
      /* ignore */
    }
  }
}

async function hasOtpField(page: Page): Promise<boolean> {
  const ctx = await findSelectorContext(page, '[formcontrolname="otp"]');
  if (!ctx) return false;
  try {
    const idField = await findSelectorContext(page, '[formcontrolname="id"]');
    return !idField;
  } catch {
    return true;
  }
}

async function fillOtp(page: Page, job: CalSyncJob, code: string): Promise<void> {
  await retry(job, "Fill OTP", async () => {
    const ctx = await requireContext(page, job, '[formcontrolname="otp"]');
    jobLog(job, "Entering SMS code…");
    await safeType(ctx, '[formcontrolname="otp"]', code);

    const navPromise = page
      .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45_000 })
      .catch(() => null);

    const submitted = await ctx.evaluate(() => {
      for (const btn of document.querySelectorAll("button")) {
        const text = btn.textContent?.trim() || "";
        if (/אישור|כניסה|המשך|אימות/i.test(text)) {
          (btn as HTMLElement).click();
          return true;
        }
      }
      const submit = document.querySelector('button[type="submit"], button.btn-primary');
      if (submit instanceof HTMLElement) {
        submit.click();
        return true;
      }
      const otp = document.querySelector('[formcontrolname="otp"]') as HTMLInputElement | null;
      otp?.form?.requestSubmit();
      return Boolean(otp);
    });
    if (!submitted) throw new Error("Could not submit OTP form");

    await navPromise;
    jobLog(job, `After OTP: ${page.url()}`);
    await sleep(3000);
  });
}

async function isLoggedIn(page: Page): Promise<boolean> {
  if (await findOnPageOrFrames(page, ".cardDebitsTransactions-main, .last4digits")) return true;
  if (/digital-web/i.test(page.url()) && (await hasAuthToken(page))) return true;
  return false;
}

async function findOnPageOrFrames(page: Page, selector: string): Promise<boolean> {
  try {
    if (await page.$(selector)) return true;
  } catch {
    /* ignore */
  }
  for (const frame of page.frames()) {
    try {
      if (await frameAlive(frame) && (await frame.$(selector))) return true;
    } catch {
      /* detached */
    }
  }
  return false;
}

async function hasAuthToken(page: Page): Promise<boolean> {
  try {
    return await page.evaluate(() => {
      const raw = window.sessionStorage.getItem("auth-module");
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { auth?: { calConnectToken?: string | null } };
      return Boolean(parsed.auth?.calConnectToken);
    });
  } catch {
    return false;
  }
}

async function loginFormVisible(page: Page): Promise<boolean> {
  return (
    (await findSelectorContext(page, '[formcontrolname="id"]')) !== null ||
    (await findSelectorContext(page, '[formcontrolname="otp"]')) !== null
  );
}

async function openCalLogin(page: Page, job: CalSyncJob): Promise<void> {
  jobLog(job, "Opening cal-online.co.il…");
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  jobLog(job, `Loaded ${page.url()}`);
  await sleep(1500);

  jobLog(job, "Clicking כניסה לחשבון…");
  const clicked = await page.evaluate(() => {
    for (const strong of document.querySelectorAll("strong")) {
      if (strong.textContent?.includes("כניסה לחשבון")) {
        const target = strong.closest("a, button, [role=button]") ?? strong.parentElement ?? strong;
        (target as HTMLElement).click();
        return true;
      }
    }
    const img = document.querySelector("img.imglogin");
    if (img) {
      const target = img.closest("a, button, strong") ?? img;
      (target as HTMLElement).click();
      return true;
    }
    const legacy = document.querySelector("#ccLoginDesktopBtn");
    if (legacy instanceof HTMLElement) {
      legacy.click();
      return true;
    }
    return false;
  });
  if (!clicked) throw new Error("Cal login button (כניסה לחשבון) not found");

  await sleep(2500);
  await requireContext(page, job, '[formcontrolname="id"]');
  jobLog(job, "Login form ready");
}

async function clickSendSms(ctx: PageOrFrame): Promise<void> {
  try {
    await clickByText(ctx, "שלחו לי סיסמה");
    return;
  } catch {
    /* fall through */
  }
  await safeClick(ctx, 'button[type="submit"]');
}

async function fillCredentialsAndRequestSms(
  page: Page,
  job: CalSyncJob,
  creds: CalCredentialsData,
): Promise<void> {
  await retry(job, "Fill login form", async () => {
    const ctx = await requireContext(page, job, '[formcontrolname="id"]');
    jobLog(job, "Entering teudat zehut…");
    await safeType(ctx, '[formcontrolname="id"]', creds.national_id);
    jobLog(job, "Entering last 4 card digits…");
    await safeType(ctx, '[formcontrolname="secondOtpParam"]', creds.card_last4);
    jobLog(job, "Clicking שלחו לי סיסמה ב-SMS…");
    await clickSendSms(ctx);
  });
  await sleep(2000);
}

function createOtpPromise(job: CalSyncJob): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("SMS code not entered in time")), OTP_WAIT_MS);
    job.otpResolve = (code: string) => {
      clearTimeout(timer);
      resolve(code);
    };
    job.otpReject = (err: Error) => {
      clearTimeout(timer);
      reject(err);
    };
  });
}

async function waitForDashboard(page: Page, job: CalSyncJob): Promise<void> {
  jobLog(job, "Waiting for login to finish…");
  const loginDeadline = Date.now() + 60_000;
  while (Date.now() < loginDeadline) {
    if (await isLoggedIn(page)) break;
    if (!(await loginFormVisible(page)) && !/login|connect/i.test(page.url())) {
      jobLog(job, `Login form cleared (${page.url()})`);
      break;
    }
    await sleep(1000);
  }

  if (!/digital-web/i.test(page.url())) {
    jobLog(job, `Opening ${DIGITAL_URL}…`);
    await page.goto(DIGITAL_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await sleep(4000);
  }

  jobLog(job, `At ${page.url()} — waiting for dashboard UI…`);
  const dashboardSelectors =
    ".cardDebitsTransactions-main, .last4digits, app-card-in-debits-transactions, .cardInDeatailsTransactions";
  const deadline = Date.now() + DASHBOARD_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (await findOnPageOrFrames(page, dashboardSelectors)) {
      jobLog(job, "Dashboard ready");
      return;
    }
    if (await hasAuthToken(page)) {
      jobLog(job, "Session token found — waiting for UI…");
    } else {
      jobLog(job, "No session token yet…");
    }
    await sleep(2000);
  }

  if (await hasAuthToken(page)) {
    jobLog(job, "Reloading dashboard (token present, UI slow)…");
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await sleep(5000);
    try {
      await page.waitForSelector(dashboardSelectors, { visible: true, timeout: 60_000 });
      jobLog(job, "Dashboard ready after reload");
      return;
    } catch {
      /* fall through */
    }
  }

  throw new Error(`Cal dashboard did not load after login (${page.url()})`);
}

async function waitForXlsxDownload(dir: string, timeoutMs = 90_000): Promise<Buffer> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".xlsx") || name.endsWith(".crdownload")) continue;
      const filePath = join(dir, name);
      if (!existsSync(filePath)) continue;
      await sleep(800);
      return readFileSync(filePath);
    }
    await sleep(500);
  }
  throw new Error("Excel download timed out");
}

async function setupDownloadDir(page: Page): Promise<string> {
  const downloadDir = mkdtempSync(join(tmpdir(), "cal-sync-"));
  const cdp = await page.createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: downloadDir,
    eventsEnabled: true,
  });
  return downloadDir;
}

async function exportTransactionsExcel(
  page: Page,
  job: CalSyncJob,
  cardLast4: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const downloadDir = await setupDownloadDir(page);

  jobLog(job, `Opening card ••••${cardLast4}…`);
  await page.waitForSelector(".cardDebitsTransactions-main", { visible: true, timeout: 60_000 });
  const cardClicked = await page.evaluate((last4) => {
    for (const card of document.querySelectorAll(".cardDebitsTransactions-main")) {
      if (card.textContent?.includes(last4)) {
        (card as HTMLElement).click();
        return true;
      }
    }
    const fallback = document.querySelector(".cardDebitsTransactions-main");
    if (fallback instanceof HTMLElement) {
      fallback.click();
      return true;
    }
    return false;
  }, cardLast4);
  if (!cardClicked) throw new Error("Could not open card transactions view");
  await sleep(3500);

  jobLog(job, "Clicking יצוא (Excel export)…");
  const exportClicked = await page.evaluate(() => {
    const byLabel = document.querySelector('button[aria-label="ייצוא לאקסל"]');
    if (byLabel instanceof HTMLElement) {
      byLabel.click();
      return true;
    }
    for (const btn of document.querySelectorAll(".export button, button")) {
      if (btn.textContent?.trim() === "יצוא") {
        (btn as HTMLElement).click();
        return true;
      }
    }
    return false;
  });
  if (!exportClicked) throw new Error('Export button (יצוא) not found');

  jobLog(job, "Waiting for Excel file…");
  const buffer = await waitForXlsxDownload(downloadDir);
  const filename = readdirSync(downloadDir).find((n) => n.endsWith(".xlsx")) || "cal-export.xlsx";
  try {
    rmSync(downloadDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  jobLog(job, `Downloaded ${filename} (${buffer.length} bytes)`);
  return { buffer, filename };
}

async function runPipeline(job: CalSyncJob, creds: CalCredentialsData): Promise<void> {
  try {
    const page = job.page!;
    const chromium = resolveChromiumPath();
    jobLog(job, chromium ? `Chromium: ${chromium}` : "Chromium: bundled (puppeteer)");

    await openCalLogin(page, job);
    await fillCredentialsAndRequestSms(page, job, creds);

    jobLog(job, "Waiting for SMS OTP screen…");
    const otpScreenDeadline = Date.now() + 60_000;
    while (Date.now() < otpScreenDeadline) {
      if (await hasOtpField(page)) break;
      if (await isLoggedIn(page)) break;
      await sleep(500);
    }

    if (!(await isLoggedIn(page))) {
      if (!(await hasOtpField(page))) {
        throw new Error("SMS OTP screen did not appear");
      }
      job.status = "otp_required";
      jobLog(job, "SMS sent — enter code in the app");
      const code = await (job.otpPromise ?? createOtpPromise(job));
      await fillOtp(page, job, code);
      await sleep(2000);
    }

    await waitForDashboard(page, job);

    job.status = "scraping";
    const exported = await exportTransactionsExcel(page, job, creds.card_last4);
    job.xlsxBuffer = exported.buffer;
    job.xlsxFilename = exported.filename;

    job.status = "saving";
    jobLog(job, "Saving statement…");
    const saved = await persistCalSyncExport(exported.buffer, exported.filename);
    job.savedStatementKey = saved.key;
    job.xlsxBuffer = undefined;
    job.status = "done";
    jobLog(job, "Sync complete — statement saved");
  } catch (e) {
    job.status = "error";
    job.error = e instanceof Error ? e.message : String(e);
    jobLog(job, `Failed: ${job.error}`);
  } finally {
    if (job.browser) {
      try {
        await job.browser.close();
      } catch {
        /* ignore */
      }
      job.browser = undefined;
    }
  }
}

export function getCalJob(jobId: string): CalSyncJob | undefined {
  purgeExpiredJobs();
  return jobs.get(jobId);
}

export async function cancelCalJob(jobId: string): Promise<void> {
  const job = jobs.get(jobId);
  if (job) job.status = "cancelled";
  await cleanupJob(jobId);
}

export function getCalJobStatus(jobId: string): {
  jobId: string;
  status: CalJobStatus;
  message: string | null;
  error: string | null;
  logs: CalSyncLogEntry[];
  saved: boolean;
  statementKey: string | null;
} | null {
  const job = getCalJob(jobId);
  if (!job) return null;
  return {
    jobId: job.id,
    status: job.status,
    message: job.message ?? null,
    error: job.error ?? null,
    logs: job.logs,
    saved: Boolean(job.savedStatementKey),
    statementKey: job.savedStatementKey ?? null,
  };
}

export async function createCalSyncJob(creds: CalCredentialsData): Promise<CalSyncJob> {
  purgeExpiredJobs();
  const id = crypto.randomUUID();
  const executablePath = resolveChromiumPath();
  jobLog(undefined, "Launching browser (headless)…");
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--lang=he-IL",
    ],
    defaultViewport: { width: 1280, height: 900 },
  });
  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);

  const job: CalSyncJob = {
    id,
    status: "starting",
    message: "Starting…",
    logs: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    browser,
    page,
  };
  job.otpPromise = createOtpPromise(job);
  jobs.set(id, job);
  jobLog(job, "Browser ready");

  job.pipelineDone = runPipeline(job, creds);
  return job;
}

export function submitCalOtpCode(jobId: string, code: string): void {
  const job = getCalJob(jobId);
  if (!job) throw new Error("Sync session expired — start again");
  if (job.status !== "otp_required") throw new Error("Not waiting for SMS code");
  const trimmed = code.replace(/\D/g, "");
  if (trimmed.length < 4) throw new Error("Invalid SMS code");
  if (!job.otpResolve) throw new Error("OTP handler not ready");
  jobLog(job, "OTP submitted from app");
  job.otpResolve(trimmed);
}

export async function awaitJobCompletion(jobId: string, timeoutMs = 360_000): Promise<CalSyncJob> {
  const job = getCalJob(jobId);
  if (!job?.pipelineDone) throw new Error("Sync session expired — start again");
  const timer = sleep(timeoutMs).then(() => {
    throw new Error("Cal sync timed out");
  });
  await Promise.race([job.pipelineDone, timer]);
  const finalJob = getCalJob(jobId);
  if (!finalJob) throw new Error("Sync session expired — start again");
  if (finalJob.status === "error") throw new Error(finalJob.error || "Cal sync failed");
  if (finalJob.status !== "done") throw new Error("Cal sync did not complete");
  return finalJob;
}

export function consumeCalJob(jobId: string): { buffer: Buffer; filename: string } {
  const job = getCalJob(jobId);
  if (!job?.xlsxBuffer?.length) throw new Error("No Excel export from Cal sync");
  const result = { buffer: job.xlsxBuffer, filename: job.xlsxFilename || "cal-export.xlsx" };
  job.xlsxBuffer = undefined;
  return result;
}

export function releaseCalJob(jobId: string): void {
  jobs.delete(jobId);
}
