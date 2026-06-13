import type { MerchantRules, SpendingReport, StatementsData } from "../types.js";

/** Render `hostport` is `hostname:port` without a scheme — Node fetch needs http:// */
export function normalizeAnalyzerUrl(raw: string | undefined): string {
  const fallback = "http://127.0.0.1:8001";
  if (!raw?.trim()) return fallback;
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url.replace(/\/$/, "");
}

const ANALYZER_URL = normalizeAnalyzerUrl(process.env.ANALYZER_URL);
const ANALYZER_TIMEOUT_MS = Number(process.env.ANALYZER_TIMEOUT_MS || 120_000);
const ANALYZER_WARMUP_ATTEMPTS = Number(process.env.ANALYZER_WARMUP_ATTEMPTS || 3);

if (process.env.NODE_ENV !== "test") {
  console.log(`Analyzer URL: ${ANALYZER_URL}`);
}

async function fetchAnalyzer(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYZER_TIMEOUT_MS);
  try {
    return await fetch(`${ANALYZER_URL}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Wake the Python analyzer (Render free tier sleeps both services). */
export async function warmAnalyzer(): Promise<boolean> {
  for (let attempt = 0; attempt < ANALYZER_WARMUP_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetchAnalyzer("/health");
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    if (attempt < ANALYZER_WARMUP_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  return false;
}

export async function analyzeFileBuffer(
  buffer: Buffer,
  filename: string,
  autoTranslate = true,
): Promise<SpendingReport> {
  await warmAnalyzer();
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
