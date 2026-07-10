import type { MerchantRules, SpendingReport, StatementsData } from "../types.js";

/** Render `hostport` is `hostname:port` without a scheme — Node fetch needs http:// */
export function normalizeAnalyzerUrl(raw: string | undefined): string {
  const fallback = "http://127.0.0.1:8001";
  if (!raw?.trim()) return fallback;
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url.replace(/\/$/, "");
}

/** Public Render URL — required on free tier (free web services cannot receive private network traffic). */
export function isPublicRenderAnalyzerUrl(url: string): boolean {
  return /\.onrender\.com/i.test(url);
}

const ANALYZER_URL = normalizeAnalyzerUrl(process.env.ANALYZER_URL);
const ANALYZER_USES_PUBLIC_URL = isPublicRenderAnalyzerUrl(ANALYZER_URL);
const ANALYZER_TIMEOUT_MS = Number(process.env.ANALYZER_TIMEOUT_MS || 120_000);
const ANALYZER_WARMUP_FETCH_TIMEOUT_MS = Number(process.env.ANALYZER_WARMUP_FETCH_TIMEOUT_MS || 45_000);
const ANALYZER_WARMUP_ATTEMPTS = Number(
  process.env.ANALYZER_WARMUP_ATTEMPTS || (ANALYZER_USES_PUBLIC_URL ? 30 : 10),
);
const ANALYZER_WARMUP_DELAY_MS = Number(process.env.ANALYZER_WARMUP_DELAY_MS || 5000);
const ANALYZER_WAKE_PAUSE_MS = Number(process.env.ANALYZER_WAKE_PAUSE_MS || 6000);

/** Render returns these while a free-tier service is still spinning up. */
const WARMUP_RETRYABLE_STATUS = new Set([500, 502, 503, 504]);

if (process.env.NODE_ENV !== "test") {
  console.log(`Analyzer URL: ${ANALYZER_URL}`);
  if (ANALYZER_USES_PUBLIC_URL) {
    console.log(
      "Analyzer via public Render URL (normal on free tier — free web services cannot receive private network traffic).",
    );
  }
}

async function fetchAnalyzer(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYZER_TIMEOUT_MS);
  try {
    return await fetch(`${ANALYZER_URL}${path}`, { ...init, signal: controller.signal });
  } catch (e) {
    const cause = e instanceof Error && "cause" in e ? String((e as Error & { cause?: unknown }).cause) : "";
    const detail = cause ? ` (${cause})` : "";
    throw new Error(`Analyzer unreachable at ${ANALYZER_URL}${path}${detail}`);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAnalyzerWarm(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYZER_WARMUP_FETCH_TIMEOUT_MS);
  try {
    return await fetch(`${ANALYZER_URL}${path}`, { ...init, signal: controller.signal });
  } catch (e) {
    const cause = e instanceof Error && "cause" in e ? String((e as Error & { cause?: unknown }).cause) : "";
    const detail = cause ? ` (${cause})` : "";
    throw new Error(`Analyzer unreachable at ${ANALYZER_URL}${path}${detail}`);
  } finally {
    clearTimeout(timer);
  }
}

function isWarmingHttpStatus(status: number): boolean {
  return WARMUP_RETRYABLE_STATUS.has(status);
}

/** Hit the public base URL so Render starts the analyzer container (502 is normal while waking). */
async function pingAnalyzerBase(): Promise<void> {
  for (const path of ["/", "/health"]) {
    try {
      const res = await fetchAnalyzerWarm(path, { method: "GET", redirect: "follow" });
      if (res.ok) return;
      if (!isWarmingHttpStatus(res.status)) return;
    } catch {
      /* still waking */
    }
  }
}

async function quickHealthCheck(): Promise<boolean> {
  try {
    const res = await fetchAnalyzerWarm("/health");
    return res.ok;
  } catch {
    return false;
  }
}

/** Fast path when already awake; full wake loop if not. */
export async function ensureAnalyzerReady(): Promise<boolean> {
  if (await quickHealthCheck()) return true;
  return warmAnalyzer();
}

/** Wake the Python analyzer (Render free tier sleeps both services). */
export async function warmAnalyzer(): Promise<boolean> {
  let lastError = "";

  if (ANALYZER_USES_PUBLIC_URL) {
    console.log("Pinging analyzer base URL to wake Render instance…");
    await pingAnalyzerBase();
    await new Promise((r) => setTimeout(r, ANALYZER_WAKE_PAUSE_MS));
  }

  for (let attempt = 0; attempt < ANALYZER_WARMUP_ATTEMPTS; attempt += 1) {
    if (ANALYZER_USES_PUBLIC_URL && attempt > 0 && attempt % 4 === 0) {
      await pingAnalyzerBase();
    }
    try {
      const res = await fetchAnalyzerWarm("/health");
      if (res.ok) {
        if (attempt > 0 || ANALYZER_USES_PUBLIC_URL) {
          console.log(`Analyzer ready after ${attempt + 1} warmup attempt(s)`);
        }
        return true;
      }
      lastError = `HTTP ${res.status}`;
      if (!isWarmingHttpStatus(res.status)) {
        console.warn(`Analyzer /health returned ${res.status} (attempt ${attempt + 1})`);
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    if (attempt < ANALYZER_WARMUP_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, ANALYZER_WARMUP_DELAY_MS));
    }
  }
  if (lastError) {
    console.error(`Analyzer warmup failed after ${ANALYZER_WARMUP_ATTEMPTS} attempts: ${lastError}`);
  }
  return false;
}

const ANALYZE_RETRY_ATTEMPTS = Number(process.env.ANALYZER_ANALYZE_ATTEMPTS || 3);
const ANALYZE_RETRY_DELAY_MS = Number(process.env.ANALYZER_ANALYZE_RETRY_DELAY_MS || 8000);

function buildAnalyzeFileForm(buffer: Buffer, filename: string): FormData {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)]), filename);
  return form;
}

function analyzerHttpErrorMessage(status: number, text: string): string {
  const body = text.trim();
  if (status === 502 && !body) {
    return (
      "Analyzer error 502: The parser service dropped the connection (common on Render free tier while waking or under load). " +
      "Wait about a minute and try again, or open the analyzer URL in a browser tab first."
    );
  }
  if ((status === 503 || status === 504) && !body) {
    return `Analyzer error ${status}: The parser service is still starting — wait and try again.`;
  }
  return `Analyzer error ${status}: ${body || "(empty response)"}`;
}

export async function analyzeFileBuffer(
  buffer: Buffer,
  filename: string,
  autoTranslate = true,
): Promise<SpendingReport> {
  const ready = await ensureAnalyzerReady();
  if (!ready) {
    throw new Error(analyzerNotReadyMessage());
  }

  const url = `/analyze-file?auto_translate=${autoTranslate}`;
  let lastError = analyzerHttpErrorMessage(0, "");

  for (let attempt = 0; attempt < ANALYZE_RETRY_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      console.warn(`analyze-file retry ${attempt + 1}/${ANALYZE_RETRY_ATTEMPTS}: ${lastError}`);
      if (ANALYZER_USES_PUBLIC_URL) {
        await pingAnalyzerBase();
        await new Promise((r) => setTimeout(r, ANALYZER_WAKE_PAUSE_MS));
      }
      await warmAnalyzer();
      await new Promise((r) => setTimeout(r, ANALYZE_RETRY_DELAY_MS));
    }

    const res = await fetchAnalyzer(url, { method: "POST", body: buildAnalyzeFileForm(buffer, filename) });
    if (res.ok) {
      return (await res.json()) as SpendingReport;
    }
    const text = await res.text();
    lastError = analyzerHttpErrorMessage(res.status, text);
    if (!WARMUP_RETRYABLE_STATUS.has(res.status)) break;
  }

  throw new Error(lastError);
}

export async function translateMerchant(hebrew: string): Promise<string> {
  const q = encodeURIComponent(hebrew.trim());
  if (!q) return "";
  const res = await fetchAnalyzer(`/translate-merchant?q=${q}`);
  if (!res.ok) return "";
  const data = (await res.json()) as { english: string };
  return data.english || "";
}

export async function analyzeCalTransactions(
  transactions: Array<Record<string, unknown>>,
  metadata: Record<string, unknown>,
  autoTranslate = true,
): Promise<SpendingReport> {
  const ready = await ensureAnalyzerReady();
  if (!ready) {
    throw new Error(analyzerNotReadyMessage());
  }
  const res = await fetchAnalyzer("/analyze-cal-transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transactions,
      metadata,
      auto_translate: autoTranslate,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(analyzerHttpErrorMessage(res.status, text));
  }
  return (await res.json()) as SpendingReport;
}

export async function reanalyzeAll(
  statements: StatementsData,
  rules: MerchantRules,
  autoTranslate = true,
): Promise<{ statements: StatementsData["statements"]; updated_count: number }> {
  const res = await fetchAnalyzer("/reanalyze-all", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      statements,
      rules,
      auto_translate: autoTranslate,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Reanalyze error ${res.status}: ${text}`);
  }
  return (await res.json()) as { statements: StatementsData["statements"]; updated_count: number };
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetchAnalyzerWarm("/health");
    return res.ok;
  } catch {
    return false;
  }
}

export function analyzerUrlMisconfigured(): boolean {
  return false;
}

export function analyzerUsesPublicUrl(): boolean {
  return ANALYZER_USES_PUBLIC_URL;
}

export function analyzerNotReadyMessage(): string {
  if (ANALYZER_USES_PUBLIC_URL) {
    return (
      `Analyzer not ready at ${ANALYZER_URL}. Render free tier can take 1–2 minutes to wake — ` +
      "wait and try again, or open the analyzer URL in a browser first."
    );
  }
  return (
    `Analyzer not ready at ${ANALYZER_URL}. Use the internal host:port from finance-analyzer → Connect → Internal, ` +
    "or upgrade the analyzer off free tier (free web services cannot receive private network traffic)."
  );
}

/** True for cold-start / connectivity failures and retryable analyzer gateway errors. */
export function isAnalyzerConnectivityError(message: string): boolean {
  return (
    message.includes("ECONNREFUSED") ||
    message.includes("ENOTFOUND") ||
    message.includes("ETIMEDOUT") ||
    message.includes("fetch failed") ||
    message.includes("Analyzer unreachable") ||
    message.includes("Analyzer not ready") ||
    message.includes("Analyzer error 502") ||
    message.includes("Analyzer error 503") ||
    message.includes("Analyzer error 504") ||
    (message.includes("abort") && !message.includes("Analyzer error"))
  );
}
