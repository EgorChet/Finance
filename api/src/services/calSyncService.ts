import { existsSync, readdirSync } from "fs";
import { join } from "path";
import puppeteer, { type Browser, type Frame, type Page } from "puppeteer";
import type { CalCredentialsData } from "../storage/calCredentials.js";
import { openCycleStartDate } from "../utils/billingCycle.js";
import { type CalScraperTransaction } from "./calTransactionMapper.js";

const LOGIN_URL = "https://www.cal-online.co.il/";
const TRANSACTIONS_ENDPOINT =
  "https://api.cal-online.co.il/Transactions/api/transactionsDetails/getCardTransactionsDetails";
const PENDING_ENDPOINT =
  "https://api.cal-online.co.il/Transactions/api/approvals/getClearanceRequests";
const FRAMES_ENDPOINT = "https://api.cal-online.co.il/Frames/api/Frames/GetFrameStatus";

const JOB_TTL_MS = 5 * 60 * 1000;
const OTP_WAIT_MS = 3 * 60 * 1000;
const PHASE_TIMEOUT_MS = 90 * 1000;

const API_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
  Origin: "https://digital-web.cal-online.co.il",
  Referer: "https://digital-web.cal-online.co.il",
  "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
  "Content-Type": "application/json",
};

export type CalJobStatus = "starting" | "otp_required" | "scraping" | "done" | "error" | "cancelled";

export interface CalSyncJob {
  id: string;
  status: CalJobStatus;
  error?: string;
  transactions?: CalScraperTransaction[];
  createdAt: number;
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
    /* local dev */
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function purgeExpiredJobs(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) void cleanupJob(id);
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

async function getLoginFrame(page: Page): Promise<Frame> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const frame = page.frames().find((f) => f.url().includes("connect"));
    if (frame) return frame;
    await sleep(400);
  }
  throw new Error("Cal login frame not found");
}

async function frameHasOtpInput(frame: Frame): Promise<boolean> {
  const selectors = [
    'input[formcontrolname="otp"]',
    'input[formcontrolname="otpCode"]',
    'input[formcontrolname="code"]',
    'input[name="otp"]',
    'input[type="tel"]',
    'input[inputmode="numeric"]',
  ];
  for (const sel of selectors) {
    if (await frame.$(sel)) return true;
  }
  const text = await frame.evaluate(() => document.body?.innerText || "");
  return /קוד|sms|אימות/i.test(text);
}

async function fillOtp(frame: Frame, code: string): Promise<void> {
  const selectors = [
    'input[formcontrolname="otp"]',
    'input[formcontrolname="otpCode"]',
    'input[formcontrolname="code"]',
    'input[name="otp"]',
    'input[type="tel"]',
    'input[inputmode="numeric"]',
  ];
  for (const sel of selectors) {
    const el = await frame.$(sel);
    if (el) {
      await el.click({ clickCount: 3 });
      await el.type(code, { delay: 40 });
      const submit = await frame.$('button[type="submit"]');
      if (submit) await submit.click();
      return;
    }
  }
  throw new Error("OTP input field not found");
}

async function isLoggedIn(page: Page): Promise<boolean> {
  if (/dashboard|digital-web/i.test(page.url())) return true;
  return page.evaluate(() => {
    const raw = window.sessionStorage.getItem("auth-module");
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw) as { auth?: { calConnectToken?: string | null } };
      return Boolean(parsed.auth?.calConnectToken);
    } catch {
      return false;
    }
  });
}

async function openCalLogin(page: Page): Promise<Frame> {
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector("#ccLoginDesktopBtn", { timeout: 30_000 });
  await page.click("#ccLoginDesktopBtn");
  const frame = await getLoginFrame(page);
  await frame.waitForSelector("#regular-login", { timeout: 15_000 });
  await frame.click("#regular-login");
  await frame.waitForSelector("regular-login", { timeout: 15_000 });
  return frame;
}

async function submitCalLogin(frame: Frame, creds: CalCredentialsData): Promise<void> {
  await frame.waitForSelector('[formcontrolname="userName"]', { timeout: 15_000 });
  await frame.evaluate(
    (sel) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (el) el.value = "";
    },
    '[formcontrolname="userName"]',
  );
  await frame.type('[formcontrolname="userName"]', creds.national_id, { delay: 25 });
  await frame.type('[formcontrolname="password"]', creds.card_last4, { delay: 25 });
  await frame.click('button[type="submit"]');
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

async function getAuthHeader(page: Page): Promise<string> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const token = await page.evaluate(() => {
      const raw = window.sessionStorage.getItem("auth-module");
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as { auth?: { calConnectToken?: string | null } };
        return parsed.auth?.calConnectToken || null;
      } catch {
        return null;
      }
    });
    if (token) return `CALAuthScheme ${token}`;
    await sleep(500);
  }
  throw new Error("Could not read Cal session token");
}

async function calPost<T>(page: Page, url: string, body: unknown, auth: string): Promise<T> {
  return page.evaluate(
    async (args) => {
      const res = await fetch(args.url, {
        method: "POST",
        headers: {
          ...args.headers,
          Authorization: args.auth,
          "X-Site-Id": "09031987-273E-2311-906C-8AF85B17C8D9",
        },
        body: JSON.stringify(args.body),
      });
      if (!res.ok) throw new Error(`Cal API ${res.status}`);
      return res.json() as Promise<T>;
    },
    { url, body, auth, headers: API_HEADERS },
  );
}

async function fetchTransactionsFromCal(page: Page, startDate: Date): Promise<CalScraperTransaction[]> {
  const auth = await getAuthHeader(page);

  const init = await page.evaluate(() => {
    const raw = window.sessionStorage.getItem("init");
    return raw ? JSON.parse(raw) : null;
  }) as { result?: { cards?: { cardUniqueId: string; last4Digits: string }[] } } | null;

  const cards = init?.result?.cards || [];
  if (!cards.length) throw new Error("No Cal cards found in session");

  const all: CalScraperTransaction[] = [];
  const start = new Date(startDate);
  const now = new Date();
  const months =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1;

  for (const card of cards) {
    let pendingData: {
      result?: { cardsList?: { authDetalisList?: Record<string, unknown>[] }[] };
      statusCode?: number;
    } | null = null;
    try {
      pendingData = await calPost(page, PENDING_ENDPOINT, { cardUniqueIDArray: [card.cardUniqueId] }, auth);
    } catch {
      pendingData = null;
    }

    for (let i = 0; i <= Math.max(months, 1); i++) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthData = await calPost<{
        statusCode?: number;
        title?: string;
        result?: {
          bankAccounts?: {
            debitDates?: { transactions?: Record<string, unknown>[] }[];
            immidiateDebits?: { debitDays?: { transactions?: Record<string, unknown>[] }[] };
          }[];
        };
      }>(
        page,
        TRANSACTIONS_ENDPOINT,
        {
          cardUniqueId: card.cardUniqueId,
          month: String(monthDate.getMonth() + 1),
          year: String(monthDate.getFullYear()),
        },
        auth,
      );

      if (monthData.statusCode !== 1) {
        throw new Error(monthData.title || "Failed to fetch Cal transactions");
      }

      const bankAccounts = monthData.result?.bankAccounts || [];
      for (const account of bankAccounts) {
        for (const debit of account.debitDates || []) {
          for (const tx of debit.transactions || []) {
            all.push(mapCalApiTransaction(tx, false));
          }
        }
        for (const day of account.immidiateDebits?.debitDays || []) {
          for (const tx of day.transactions || []) {
            all.push(mapCalApiTransaction(tx, false));
          }
        }
      }
    }

    const pendingList = pendingData?.result?.cardsList?.flatMap((c) => c.authDetalisList || []) || [];
    for (const tx of pendingList) {
      all.push(mapCalApiTransaction(tx, true));
    }
  }

  const startIso = startDate.toISOString().slice(0, 10);
  const seen = new Set<string>();
  return all.filter((tx) => {
    if (tx.date.slice(0, 10) < startIso) return false;
    const key = `${tx.date}|${tx.description}|${tx.chargedAmount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mapCalApiTransaction(raw: Record<string, unknown>, pending: boolean): CalScraperTransaction {
  const merchantName = String(raw.merchantName || "");
  const trnPurchaseDate = String(raw.trnPurchaseDate || "");
  const debCrdDate = raw.debCrdDate ? String(raw.debCrdDate) : trnPurchaseDate;
  const trnAmt = Number(raw.trnAmt || 0);
  const amtBeforeConv = Number(raw.amtBeforeConvAndIndex ?? trnAmt);
  const charged = pending ? trnAmt : amtBeforeConv;
  const currency = String(raw.trnCurrencySymbol || "₪");
  const trnTypeCode = String(raw.trnTypeCode || "5");

  return {
    date: trnPurchaseDate,
    processedDate: debCrdDate,
    description: merchantName,
    chargedAmount: charged * -1,
    originalAmount: trnAmt * (trnTypeCode === "6" ? 1 : -1),
    originalCurrency: currency,
    status: pending ? "pending" : "completed",
    category: String(raw.branchCodeDesc || ""),
    memo: "",
    type: trnTypeCode === "8" ? "installments" : "normal",
  };
}

async function runPipeline(job: CalSyncJob, creds: CalCredentialsData): Promise<void> {
  try {
    const page = job.page!;
    const frame = await openCalLogin(page);
    await submitCalLogin(frame, creds);

    const deadline = Date.now() + PHASE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (await isLoggedIn(page)) break;
      if (await frameHasOtpInput(frame)) {
        job.status = "otp_required";
        const code = await (job.otpPromise ?? createOtpPromise(job));
        await fillOtp(frame, code);
        await sleep(3000);
        continue;
      }
      await sleep(800);
    }

    if (!(await isLoggedIn(page))) {
      throw new Error("Cal login timed out");
    }

    // Navigate to digital app so session storage is populated
    await page.goto("https://digital-web.cal-online.co.il/", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await sleep(2000);

    job.status = "scraping";
    const cycleStart = openCycleStartDate();
    job.transactions = await fetchTransactionsFromCal(page, new Date(cycleStart + "T00:00:00"));
    job.status = "done";
  } catch (e) {
    job.status = "error";
    job.error = e instanceof Error ? e.message : String(e);
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

export async function createCalSyncJob(creds: CalCredentialsData): Promise<CalSyncJob> {
  purgeExpiredJobs();
  const id = crypto.randomUUID();
  const executablePath = resolveChromiumPath();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setUserAgent(API_HEADERS["User-Agent"]);

  const job: CalSyncJob = {
    id,
    status: "starting",
    createdAt: Date.now(),
    browser,
    page,
  };
  job.otpPromise = createOtpPromise(job);
  jobs.set(id, job);

  job.pipelineDone = runPipeline(job, creds);
  return job;
}

export async function waitForJobPhase(
  jobId: string,
  targets: CalJobStatus[],
  timeoutMs: number,
): Promise<CalSyncJob> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = getCalJob(jobId);
    if (!job) throw new Error("Sync session expired — start again");
    if (targets.includes(job.status)) return job;
    if (job.status === "error") throw new Error(job.error || "Cal sync failed");
    await sleep(400);
  }
  throw new Error("Cal sync timed out");
}

export function submitCalOtpCode(jobId: string, code: string): void {
  const job = getCalJob(jobId);
  if (!job) throw new Error("Sync session expired — start again");
  if (job.status !== "otp_required") throw new Error("Not waiting for SMS code");
  const trimmed = code.replace(/\D/g, "");
  if (trimmed.length < 4) throw new Error("Invalid SMS code");
  if (!job.otpResolve) throw new Error("OTP handler not ready");
  job.otpResolve(trimmed);
}

export async function awaitJobCompletion(jobId: string, timeoutMs = 120_000): Promise<CalSyncJob> {
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

export function consumeCalJob(jobId: string): CalScraperTransaction[] {
  const job = getCalJob(jobId);
  if (!job?.transactions?.length) throw new Error("No transactions from Cal sync");
  const txns = job.transactions;
  jobs.delete(jobId);
  return txns;
}
