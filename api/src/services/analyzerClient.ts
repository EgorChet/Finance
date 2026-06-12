import type { MerchantRules, SpendingReport, StatementsData } from "../types.js";

const ANALYZER_URL = process.env.ANALYZER_URL || "http://127.0.0.1:8001";

export async function analyzeFileBuffer(
  buffer: Buffer,
  filename: string,
  autoTranslate = true,
): Promise<SpendingReport> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)]), filename);
  const url = `${ANALYZER_URL}/analyze-file?auto_translate=${autoTranslate}`;
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Analyzer error ${res.status}: ${text}`);
  }
  return (await res.json()) as SpendingReport;
}

export async function translateMerchant(hebrew: string): Promise<string> {
  const q = encodeURIComponent(hebrew.trim());
  if (!q) return "";
  const res = await fetch(`${ANALYZER_URL}/translate-merchant?q=${q}`);
  if (!res.ok) return "";
  const data = (await res.json()) as { english: string };
  return data.english || "";
}

export async function reanalyzeAll(
  statements: StatementsData,
  rules: MerchantRules,
  autoTranslate = true,
): Promise<{ statements: StatementsData["statements"]; updated_count: number }> {
  const res = await fetch(`${ANALYZER_URL}/reanalyze-all`, {
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
    const res = await fetch(`${ANALYZER_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
