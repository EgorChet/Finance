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
const ANALYZER_WARMUP_ATTEMPTS = Number(
  process.env.ANALYZER_WARMUP_ATTEMPTS || (ANALYZER_USES_PUBLIC_URL ? 12 : 8),
);
const ANALYZER_WARMUP_DELAY_MS = Number(process.env.ANALYZER_WARMUP_DELAY_MS || 5000);

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

/** Wake the Python analyzer (Render free tier sleeps both services). */
export async function warmAnalyzer(): Promise<boolean> {
  let lastError = "";
  for (let attempt = 0; attempt < ANALYZER_WARMUP_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetchAnalyzer("/health");
      if (res.ok) return true;
      lastError = `HTTP ${res.status}`;
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

export async function analyzeFileBuffer(
  buffer: Buffer,
  filename: string,
  autoTranslate = true,
): Promise<SpendingReport> {
  const ready = await warmAnalyzer();
  if (!ready) {
    throw new Error(analyzerNotReadyMessage());
  }
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)]), filename);
  const url = `/analyze-file?auto_translate=${autoTranslate}`;
  const res = await fetchAnalyzer(url, { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Analyzer error ${res.status}: ${text}`);
  }
  return (await res.json()) as SpendingReport;
}

export async function translateMerchant(hebrew: string): Promise<string> {
  const q = encodeURIComponent(hebrew.trim());
  if (!q) return "";
  const res = await fetchAnalyzer(`/translate-merchant?q=${q}`);
  if (!res.ok) return "";
  const data = (await res.json()) as { english: string };
  return data.english || "";
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
    const res = await fetchAnalyzer("/health");
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
      `Analyzer not ready at ${ANALYZER_URL}. On Render free tier the analyzer wakes via its public URL — ` +
      "wait a minute and try again, or open the analyzer URL in a browser first."
    );
  }
  return (
    `Analyzer not ready at ${ANALYZER_URL}. Use the internal host:port from finance-analyzer → Connect → Internal, ` +
    "or upgrade the analyzer off free tier (free web services cannot receive private network traffic)."
  );
}

/** True only for cold-start / connectivity failures — not analyzer HTTP 4xx/5xx. */
export function isAnalyzerConnectivityError(message: string): boolean {
  return (
    message.includes("ECONNREFUSED") ||
    message.includes("ENOTFOUND") ||
    message.includes("ETIMEDOUT") ||
    message.includes("fetch failed") ||
    message.includes("Analyzer unreachable") ||
    message.includes("Analyzer not ready") ||
    (message.includes("abort") && !message.includes("Analyzer error"))
  );
}
