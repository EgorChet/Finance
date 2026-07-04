import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import puppeteer, { type Browser, type Cookie, type Frame, type Page } from "puppeteer";
import type { CalCredentialsData } from "../storage/calCredentials.js";
import { clearCalSession, readCalSession, writeCalSession, type CalSessionData } from "../storage/calSession.js";
import { persistCalSyncExport } from "./calSyncPersist.js";

const LOGIN_URL = "https://www.cal-online.co.il/";
const DIGITAL_URL = "https://digital-web.cal-online.co.il/";
const DIGITAL_LOGIN_URL = "https://digital-web.cal-online.co.il/login";

const JOB_IDLE_TTL_MS = 10 * 60 * 1000;
const JOB_MAX_AGE_MS = 20 * 60 * 1000;
const OTP_WAIT_MS = 3 * 60 * 1000;
const OTP_SCREEN_TIMEOUT_MS = 120_000;
const PHASE_TIMEOUT_MS = 180_000;
const DASHBOARD_TIMEOUT_MS = 60_000;
const RESTORE_TIMEOUT_MS = 40_000;
const DASHBOARD_SELECTORS =
  ".cardDebitsTransactions-main, .last4digits, app-card-in-debits-transactions, .cardInDeatailsTransactions";
const MAX_LOG_LINES = 80;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

export type CalSyncMode = "auto" | "classic";

export type CalJobStatus =
  | "starting"
  | "otp_required"
  | "logging_in"
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
  mode: CalSyncMode;
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
  otpTimer?: ReturnType<typeof setTimeout>;
  pipelineDone?: Promise<void>;
}

const IN_FLIGHT_STATUSES: CalJobStatus[] = [
  "starting",
  "otp_required",
  "logging_in",
  "scraping",
  "saving",
];

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

function abortOtpWait(job: CalSyncJob, reason = "Sync cancelled"): void {
  if (job.otpTimer) {
    clearTimeout(job.otpTimer);
    job.otpTimer = undefined;
  }
  const reject = job.otpReject;
  job.otpResolve = undefined;
  job.otpReject = undefined;
  job.otpPromise = undefined;
  if (reject) reject(new Error(reason));
}

async function cancelStaleCalJobs(keepJobId: string, logJob?: CalSyncJob): Promise<void> {
  const stale: string[] = [];
  for (const [id, job] of jobs) {
    if (id === keepJobId) continue;
    if (IN_FLIGHT_STATUSES.includes(job.status)) stale.push(id);
  }
  for (const id of stale) {
    const job = jobs.get(id);
    if (job) job.status = "cancelled";
    await cleanupJob(id);
  }
  if (stale.length && logJob) {
    jobLog(logJob, `Cancelled ${stale.length} stale Cal sync job(s)`);
  }
}

async function cleanupJob(jobId: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) return;
  abortOtpWait(job, "Sync cancelled");
  jobs.delete(jobId);
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

async function dashboardReady(page: Page): Promise<boolean> {
  return findOnPageOrFrames(page, DASHBOARD_SELECTORS);
}

async function isLoggedIn(page: Page): Promise<boolean> {
  if (await dashboardReady(page)) return true;
  // Token alone means login finished (post-OTP), not that the SPA rendered.
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

async function readBrowserStorage(page: Page): Promise<{
  session_storage: Record<string, string>;
  local_storage: Record<string, string>;
}> {
  return page.evaluate(() => {
    const session_storage: Record<string, string> = {};
    const local_storage: Record<string, string> = {};
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key != null) session_storage[key] = sessionStorage.getItem(key) ?? "";
    }
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key != null) local_storage[key] = localStorage.getItem(key) ?? "";
    }
    return { session_storage, local_storage };
  });
}

async function captureAllCookies(page: Page): Promise<Cookie[]> {
  try {
    const cdp = await page.createCDPSession();
    const { cookies } = await cdp.send("Network.getAllCookies");
    return cookies
      .filter((c) => /cal-online/i.test(c.domain))
      .map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires,
        size: c.size,
        httpOnly: c.httpOnly,
        secure: c.secure,
        session: c.session,
        sameSite: c.sameSite as Cookie["sameSite"],
      }));
  } catch {
    return page.cookies(DIGITAL_URL, LOGIN_URL);
  }
}

async function applyCookies(page: Page, cookies: Cookie[], job: CalSyncJob): Promise<void> {
  let ok = 0;
  let failed = 0;
  for (const cookie of cookies) {
    try {
      const url = /digital-web/i.test(cookie.domain || "") ? DIGITAL_URL : LOGIN_URL;
      await page.setCookie({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || "/",
        ...(cookie.expires && cookie.expires > 0 ? { expires: cookie.expires } : {}),
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        ...(cookie.sameSite ? { sameSite: cookie.sameSite } : {}),
        url,
      });
      ok += 1;
    } catch {
      failed += 1;
    }
  }
  jobLog(job, failed ? `Restored ${ok} cookies (${failed} skipped)` : `Restored ${ok} cookies`);
}

function sessionStorageFrom(session: CalSessionData): Record<string, string> {
  if (session.session_storage && Object.keys(session.session_storage).length > 0) {
    return session.session_storage;
  }
  if (session.auth_module) return { "auth-module": session.auth_module };
  return {};
}

async function pageDiagnostics(page: Page): Promise<string> {
  let title = "(unknown)";
  try {
    title = await page.title();
  } catch {
    /* ignore */
  }
  const token = await hasAuthToken(page);
  const loginForm = await loginFormVisible(page);
  const dash = await dashboardReady(page);
  return `url=${page.url()} title=${JSON.stringify(title)} token=${token} loginForm=${loginForm} dashboard=${dash}`;
}

async function captureCalSession(page: Page): Promise<CalSessionData> {
  const cookies = await captureAllCookies(page);
  const { session_storage, local_storage } = await readBrowserStorage(page);
  return {
    cookies,
    auth_module: session_storage["auth-module"] ?? null,
    session_storage,
    local_storage,
    saved_at: new Date().toISOString(),
  };
}

async function persistCalSession(page: Page, job: CalSyncJob): Promise<void> {
  try {
    const session = await captureCalSession(page);
    if (!session.auth_module && !session.cookies.some((c) => /cal-online/i.test(c.domain || ""))) {
      jobLog(job, "Session not saved — no auth data found");
      return;
    }
    await writeCalSession(session);
    const storageKeys = Object.keys(session.session_storage ?? {}).length;
    jobLog(
      job,
      `Cal session saved for next sync (${session.cookies.length} cookies, ${storageKeys} session keys)`,
    );
  } catch (err) {
    jobLog(job, `Could not save Cal session: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function restoreCalSession(page: Page, job: CalSyncJob, session: CalSessionData): Promise<boolean> {
  jobLog(job, "Restoring saved Cal session…");

  const sessionEntries = sessionStorageFrom(session);
  const localEntries = session.local_storage ?? {};
  // Inject storage before any page script runs so the SPA boots already authenticated.
  await page.evaluateOnNewDocument(
    (sessionStorageEntries: Record<string, string>, localStorageEntries: Record<string, string>) => {
      for (const [key, value] of Object.entries(sessionStorageEntries)) {
        window.sessionStorage.setItem(key, value);
      }
      for (const [key, value] of Object.entries(localStorageEntries)) {
        window.localStorage.setItem(key, value);
      }
    },
    sessionEntries,
    localEntries,
  );

  if (session.cookies.length) {
    await applyCookies(page, session.cookies, job);
  }

  await page.goto(DIGITAL_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });

  jobLog(job, `At ${page.url()} — waiting for dashboard UI…`);
  const deadline = Date.now() + RESTORE_TIMEOUT_MS;
  let lastProgressLog = 0;
  while (Date.now() < deadline) {
    if (await dashboardReady(page)) {
      jobLog(job, "Saved session is still valid");
      return true;
    }
    const now = Date.now();
    if (now - lastProgressLog >= 10_000) {
      jobLog(
        job,
        (await hasAuthToken(page))
          ? "Session token found — waiting for dashboard…"
          : "No session token yet — waiting for dashboard…",
      );
      lastProgressLog = now;
    }
    await sleep(2000);
  }

  jobLog(job, "Dashboard not ready after restore — reloading once…");
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  await sleep(5000);
  if (await dashboardReady(page)) {
    jobLog(job, "Saved session is still valid");
    return true;
  }

  jobLog(job, `Saved session could not restore dashboard (${await pageDiagnostics(page)})`);
  return false;
}

async function waitForOtpScreen(page: Page, job: CalSyncJob): Promise<void> {
  jobLog(job, "Waiting for SMS OTP screen…");
  const deadline = Date.now() + OTP_SCREEN_TIMEOUT_MS;
  const started = Date.now();
  let smsRetried = false;
  let lastProgressLog = 0;

  while (Date.now() < deadline) {
    if (await hasOtpField(page)) return;
    if (await isLoggedIn(page)) return;

    const now = Date.now();
    const elapsed = now - started;
    if (!smsRetried && elapsed >= 15_000) {
      smsRetried = true;
      jobLog(job, "OTP screen slow — retrying SMS send…");
      try {
        const ctx = await findSelectorContext(page, '[formcontrolname="id"]');
        if (ctx) {
          await clickSendSms(ctx);
          await sleep(3500);
        }
      } catch {
        /* may already be on OTP step */
      }
    }

    if (now - lastProgressLog >= 15_000) {
      const otp = await hasOtpField(page);
      const login = await loginFormVisible(page);
      jobLog(job, `Still waiting for OTP screen (url=${page.url()} otpField=${otp} loginForm=${login})`);
      lastProgressLog = now;
    }
    await sleep(500);
  }
}

async function performCalLogin(page: Page, job: CalSyncJob, creds: CalCredentialsData): Promise<void> {
  if (job.mode === "auto") {
    throw new Error("Auto sync cannot sign in with SMS. Use Sync Cal to refresh your saved session.");
  }
  await openCalLogin(page, job);
  await fillCredentialsAndRequestSms(page, job, creds);
  await waitForOtpScreen(page, job);

  if (!(await isLoggedIn(page))) {
    if (!(await hasOtpField(page))) {
      throw new Error("SMS OTP screen did not appear");
    }
    job.status = "otp_required";
    jobLog(job, "SMS sent — enter code in the app");
    const code = await createOtpPromise(job);
    await fillOtp(page, job, code);
    await sleep(2000);
  }
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

async function isCalWafBlock(page: Page): Promise<boolean> {
  try {
    const title = await page.title();
    if (/request rejected/i.test(title)) return true;
    return await page.evaluate(() => /request rejected/i.test(document.body?.innerText || ""));
  } catch {
    return false;
  }
}

async function clickCalHomepageLogin(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    for (const el of document.querySelectorAll("a, button, [role=button]")) {
      const label = el.getAttribute("aria-label") || "";
      if (label.includes("כניסה לחשבון")) {
        (el as HTMLElement).click();
        return true;
      }
    }
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
    const legacy = document.querySelector("#ccLoginDesktopBtn, #ccLoginMobileBtn");
    if (legacy instanceof HTMLElement) {
      legacy.click();
      return true;
    }
    return false;
  });
}

async function openCalLogin(page: Page, job: CalSyncJob): Promise<void> {
  await page.setViewport({ width: 1280, height: 900 });

  if (await loginFormVisible(page)) {
    jobLog(job, "Login form already open");
    return;
  }

  jobLog(job, "Opening Cal login page…");
  await page.goto(DIGITAL_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  jobLog(job, `Loaded ${page.url()}`);

  const formDeadline = Date.now() + 45_000;
  while (Date.now() < formDeadline) {
    if (await loginFormVisible(page)) {
      jobLog(job, "Login form ready");
      return;
    }
    if (await isCalWafBlock(page)) break;
    await sleep(500);
  }

  if (!(await loginFormVisible(page))) {
    jobLog(job, "Direct login URL did not show form — trying cal-online.co.il homepage…");
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    jobLog(job, `Loaded ${page.url()}`);
    if (await isCalWafBlock(page)) {
      throw new Error(
        "Cal site blocked this server (Request Rejected). Try again later or run sync from a different network.",
      );
    }

    const clickDeadline = Date.now() + 30_000;
    let clicked = false;
    while (Date.now() < clickDeadline && !clicked) {
      clicked = await clickCalHomepageLogin(page);
      if (clicked) break;
      await sleep(500);
    }
    if (!clicked) {
      const diag = await pageDiagnostics(page);
      throw new Error(`Cal login button (כניסה לחשבון) not found (${diag})`);
    }

    jobLog(job, "Clicked כניסה לחשבון on homepage");
    await sleep(2500);
  }

  await requireContext(page, job, '[formcontrolname="id"]', 60_000);
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
  await sleep(3500);
}

function createOtpPromise(job: CalSyncJob): Promise<string> {
  abortOtpWait(job);

  const promise = new Promise<string>((resolve, reject) => {
    job.otpTimer = setTimeout(() => {
      job.otpTimer = undefined;
      reject(new Error("SMS code not entered in time"));
    }, OTP_WAIT_MS);

    job.otpResolve = (code: string) => {
      if (job.otpTimer) {
        clearTimeout(job.otpTimer);
        job.otpTimer = undefined;
      }
      job.otpResolve = undefined;
      job.otpReject = undefined;
      resolve(code);
    };

    job.otpReject = (err: Error) => {
      if (job.otpTimer) {
        clearTimeout(job.otpTimer);
        job.otpTimer = undefined;
      }
      job.otpResolve = undefined;
      job.otpReject = undefined;
      reject(err);
    };
  });

  job.otpPromise = promise;
  void promise.catch(() => {});
  return promise;
}

async function waitForDashboard(page: Page, job: CalSyncJob): Promise<void> {
  if (await dashboardReady(page)) {
    jobLog(job, "Dashboard ready");
    return;
  }

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
  const started = Date.now();
  const deadline = started + DASHBOARD_TIMEOUT_MS;
  let lastProgressLog = 0;
  let reloaded = false;

  while (Date.now() < deadline) {
    if (await dashboardReady(page)) {
      jobLog(job, reloaded ? "Dashboard ready after reload" : "Dashboard ready");
      return;
    }

    // One reload at the halfway mark, still within the 60s budget.
    if (
      !reloaded &&
      Date.now() - started >= DASHBOARD_TIMEOUT_MS / 2 &&
      (await hasAuthToken(page))
    ) {
      const remainingMs = Math.max(5_000, deadline - Date.now());
      jobLog(job, "Reloading dashboard (token present, UI slow)…");
      reloaded = true;
      try {
        await page.reload({
          waitUntil: "domcontentloaded",
          timeout: Math.min(remainingMs, 15_000),
        });
      } catch {
        /* keep polling until deadline */
      }
      continue;
    }

    const now = Date.now();
    if (now - lastProgressLog >= 10_000) {
      jobLog(
        job,
        (await hasAuthToken(page))
          ? "Session token found — waiting for UI…"
          : "No session token yet…",
      );
      lastProgressLog = now;
    }
    await sleep(2000);
  }

  jobLog(job, `Dashboard timeout (${await pageDiagnostics(page)})`);
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

const TRANSACTIONS_VIEW_SELECTORS =
  ".cardInDeatailsTransactions, app-card-in-deatails-transactions, .transactions-table, .export, button[aria-label*='אקסל'], button[aria-label*='ייצוא'], button[aria-label*='יצוא']";

async function allAliveContexts(page: Page): Promise<PageOrFrame[]> {
  const contexts: PageOrFrame[] = [page];
  for (const frame of page.frames()) {
    if (await frameAlive(frame)) contexts.push(frame);
  }
  return contexts;
}

async function waitForTransactionsView(page: Page, job: CalSyncJob, timeoutMs = 60_000): Promise<void> {
  jobLog(job, "Waiting for card transactions view…");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await findSelectorContext(page, TRANSACTIONS_VIEW_SELECTORS)) return;
    await sleep(500);
  }
  throw new Error("Card transactions view did not load");
}

async function openCardTransactions(page: Page, job: CalSyncJob, cardLast4: string): Promise<void> {
  const cardCtx = await requireContext(page, job, ".cardDebitsTransactions-main", 60_000);
  const cardClicked = await cardCtx.evaluate((last4) => {
    const clickCard = (card: Element): boolean => {
      if (!(card instanceof HTMLElement)) return false;
      card.scrollIntoView({ block: "center", inline: "nearest" });
      card.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      card.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      card.click();
      return true;
    };
    for (const card of document.querySelectorAll(".cardDebitsTransactions-main")) {
      if (card.textContent?.includes(last4)) return clickCard(card);
    }
    const fallback = document.querySelector(".cardDebitsTransactions-main");
    return fallback ? clickCard(fallback) : false;
  }, cardLast4);
  if (!cardClicked) throw new Error("Could not open card transactions view");
  await waitForTransactionsView(page, job);
}

type ExportClickResult = "excel" | "menu" | false;

async function clickExportInContext(ctx: PageOrFrame): Promise<ExportClickResult> {
  return ctx.evaluate(() => {
    const exportNeedle = /י{1,2}צוא|אקסל|excel/i;

    const queryAllDeep = (selector: string, root: ParentNode = document): Element[] => {
      const out: Element[] = [];
      root.querySelectorAll(selector).forEach((el) => out.push(el));
      root.querySelectorAll("*").forEach((el) => {
        if (el.shadowRoot) out.push(...queryAllDeep(selector, el.shadowRoot));
      });
      return out;
    };

    const clickEl = (el: Element): void => {
      if (!(el instanceof HTMLElement)) return;
      el.scrollIntoView({ block: "center", inline: "nearest" });
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      el.click();
    };

    const matchesExcelExport = (el: Element): boolean => {
      const label = el.getAttribute("aria-label") || "";
      const title = el.getAttribute("title") || "";
      const text = el.textContent?.replace(/\s+/g, " ").trim() || "";
      return (
        /י{1,2}צוא.*אקסל/i.test(label) ||
        /י{1,2}צוא.*אקסל/i.test(title) ||
        (exportNeedle.test(text) && /אקסל|excel/i.test(text))
      );
    };

    for (const el of queryAllDeep("button, a, [role='button']")) {
      if (matchesExcelExport(el)) {
        clickEl(el);
        return "excel";
      }
    }

    for (const el of queryAllDeep("button, a, [role='button']")) {
      const label = el.getAttribute("aria-label") || "";
      const title = el.getAttribute("title") || "";
      const text = el.textContent?.replace(/\s+/g, " ").trim() || "";
      if (exportNeedle.test(label) || exportNeedle.test(title) || exportNeedle.test(text)) {
        clickEl(el);
        return /אקסל|excel/i.test(`${label} ${title} ${text}`) ? "excel" : "menu";
      }
    }

    for (const container of queryAllDeep(".export, [class*='export']")) {
      for (const btn of container.querySelectorAll("button, a, [role='button']")) {
        const text = btn.textContent?.replace(/\s+/g, " ").trim() || "";
        const label = btn.getAttribute("aria-label") || "";
        if (exportNeedle.test(text) || exportNeedle.test(label)) {
          clickEl(btn);
          return /אקסל|excel/i.test(`${label} ${text}`) ? "excel" : "menu";
        }
      }
    }

    for (const el of queryAllDeep("button, a, [role='button']")) {
      const text = el.textContent?.replace(/\s+/g, " ").trim() || "";
      if (/^י{1,2}צוא$/i.test(text)) {
        clickEl(el);
        return "menu";
      }
    }

    return false;
  });
}

async function collectExportHints(page: Page): Promise<string[]> {
  const hints: string[] = [];
  for (const ctx of await allAliveContexts(page)) {
    try {
      const frameHints = await ctx.evaluate(() => {
        const out: string[] = [];
        const needles = /י{0,2}צוא|אקסל|export/i;
        for (const el of document.querySelectorAll("button, a, [role='button']")) {
          const text = el.textContent?.replace(/\s+/g, " ").trim() || "";
          const label = el.getAttribute("aria-label") || "";
          const title = el.getAttribute("title") || "";
          if (needles.test(text) || needles.test(label) || needles.test(title)) {
            out.push(`<${el.tagName}> text="${text}" aria="${label}" title="${title}"`);
          }
        }
        return out.slice(0, 6);
      });
      hints.push(...frameHints);
    } catch {
      /* detached frame */
    }
  }
  return hints.slice(0, 10);
}

async function clickCalExportButton(page: Page, job: CalSyncJob): Promise<void> {
  jobLog(job, "Clicking יצוא (Excel export)…");
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    for (const ctx of await allAliveContexts(page)) {
      try {
        const result = await clickExportInContext(ctx);
        if (result === "excel") return;
        if (result === "menu") {
          await sleep(700);
          const menuPick = await clickExportInContext(ctx);
          if (menuPick === "excel") return;
        }
      } catch {
        /* detached frame */
      }
    }
    await sleep(500);
  }

  const hints = await collectExportHints(page);
  if (hints.length) {
    jobLog(job, `Export hints: ${hints.join(" | ")}`);
  }
  throw new Error("Export button (יצוא / ייצוא לאקסל) not found");
}

async function exportTransactionsExcel(
  page: Page,
  job: CalSyncJob,
  cardLast4: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const downloadDir = await setupDownloadDir(page);

  jobLog(job, `Opening card ••••${cardLast4}…`);
  await openCardTransactions(page, job, cardLast4);
  await clickCalExportButton(page, job);

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
    jobLog(job, `Sync mode: ${job.mode}`);

    let loggedIn = false;
    if (job.mode === "auto") {
      const savedSession = await readCalSession();
      if (!savedSession) {
        throw new Error("No saved Cal session. Use Sync Cal to sign in with SMS.");
      }
      loggedIn = await restoreCalSession(page, job, savedSession);
      if (!loggedIn) {
        await clearCalSession();
        throw new Error(
          "Saved Cal session could not be used. The saved login was cleared — use Sync Cal to sign in again with SMS.",
        );
      }
    } else {
      const savedSession = await readCalSession();
      if (savedSession) {
        loggedIn = await restoreCalSession(page, job, savedSession);
        if (!loggedIn) {
          await clearCalSession();
          jobLog(job, "Saved session cleared — signing in with SMS");
        }
      }
      if (!loggedIn) {
        await performCalLogin(page, job, creds);
      }
    }

    await waitForDashboard(page, job);
    await persistCalSession(page, job);

    job.status = "scraping";
    const exported = await exportTransactionsExcel(page, job, creds.card_last4);
    job.xlsxBuffer = exported.buffer;
    job.xlsxFilename = exported.filename;

    // Refresh saved session after export in case cookies/tokens rotated.
    await persistCalSession(page, job);

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
    const msg = job.error || "";
    if (/login|otp|session|dashboard|auth/i.test(msg)) {
      await clearCalSession();
    }
  } finally {
    abortOtpWait(job, "Sync finished");
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
  mode: CalSyncMode;
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
    mode: job.mode,
    message: job.message ?? null,
    error: job.error ?? null,
    logs: job.logs,
    saved: Boolean(job.savedStatementKey),
    statementKey: job.savedStatementKey ?? null,
  };
}

export async function createCalSyncJob(
  creds: CalCredentialsData,
  mode: CalSyncMode = "classic",
): Promise<CalSyncJob> {
  purgeExpiredJobs();
  const id = crypto.randomUUID();

  const job: CalSyncJob = {
    id,
    mode,
    status: "starting",
    message: "Starting…",
    logs: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await cancelStaleCalJobs(id, job);
  jobs.set(id, job);

  job.pipelineDone = (async () => {
    try {
      jobLog(job, "Launching browser (headless)…");
      const executablePath = resolveChromiumPath();
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
      job.browser = browser;
      job.page = page;
      jobLog(job, "Browser ready");
      await runPipeline(job, creds);
    } catch (e) {
      if (job.status !== "error" && job.status !== "cancelled") {
        job.status = "error";
        job.error = e instanceof Error ? e.message : String(e);
        jobLog(job, `Failed: ${job.error}`);
      }
      if (job.browser) {
        try {
          await job.browser.close();
        } catch {
          /* ignore */
        }
        job.browser = undefined;
      }
    } finally {
      abortOtpWait(job, "Sync finished");
    }
  })();

  return job;
}

export function submitCalOtpCode(jobId: string, code: string): void {
  const job = getCalJob(jobId);
  if (!job) throw new Error("Sync session expired — start again");
  if (job.status !== "otp_required") throw new Error("Not waiting for SMS code");
  const trimmed = code.replace(/\D/g, "");
  if (trimmed.length < 4) throw new Error("Invalid SMS code");
  if (!job.otpResolve) throw new Error("OTP handler not ready");
  job.status = "logging_in";
  jobLog(job, "Signing in with SMS code…");
  job.otpResolve(trimmed);
  abortOtpWait(job, "OTP submitted");
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
