/**
 * Supabase storage adapter — set STORAGE=supabase and configure env vars.
 * Falls back to local files when not configured.
 */
import type { MerchantRules, ReviewProgressData, StatementsData } from "../types.js";
import * as local from "./local.js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

export function supabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

async function supabaseFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init?.headers || {}),
    },
  });
}

export async function readStatements(): Promise<StatementsData> {
  if (!supabaseConfigured()) return local.readStatements();
  const res = await supabaseFetch("app_state?id=eq.statements&select=data");
  if (!res.ok) return { statements: {}, updated_at: null };
  const rows = (await res.json()) as { data: StatementsData }[];
  return rows[0]?.data || { statements: {}, updated_at: null };
}

export async function writeStatements(data: StatementsData): Promise<void> {
  if (!supabaseConfigured()) {
    await local.writeStatements(data);
    return;
  }
  data.updated_at = new Date().toISOString();
  const res = await supabaseFetch("app_state", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: "statements", data }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase write failed (${res.status}): ${text}`);
  }
}

export async function readRules(): Promise<MerchantRules> {
  if (!supabaseConfigured()) return local.readRules();
  const res = await supabaseFetch("app_state?id=eq.rules&select=data");
  if (!res.ok) return {};
  const rows = (await res.json()) as { data: MerchantRules }[];
  return rows[0]?.data || {};
}

export async function writeRules(rules: MerchantRules): Promise<void> {
  if (!supabaseConfigured()) {
    await local.writeRules(rules);
    return;
  }
  await supabaseFetch("app_state", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: "rules", data: rules }),
  });
}

export async function readReviewProgress(): Promise<ReviewProgressData> {
  if (!supabaseConfigured()) return local.readReviewProgress();
  const res = await supabaseFetch("app_state?id=eq.review&select=data");
  if (!res.ok) return { reviewed_transactions: [] };
  const rows = (await res.json()) as { data: ReviewProgressData }[];
  return rows[0]?.data || { reviewed_transactions: [] };
}

export async function writeReviewProgress(data: ReviewProgressData): Promise<void> {
  if (!supabaseConfigured()) {
    await local.writeReviewProgress(data);
    return;
  }
  await supabaseFetch("app_state", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: "review", data }),
  });
}

export {
  discoverXlsxFiles,
  fileHash,
  saveUploadedXlsx,
} from "./local.js";
