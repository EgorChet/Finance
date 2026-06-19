/**
 * Supabase storage adapter — set STORAGE=supabase and configure env vars.
 * Falls back to local files when not configured.
 */
import type { ExclusionsData, FixedChargesData, FxFallbackData, MerchantRules, ReviewProgressData, StatementsData } from "../types.js";
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

export async function readExclusions(): Promise<ExclusionsData> {
  if (!supabaseConfigured()) return local.readExclusions();
  const res = await supabaseFetch("app_state?id=eq.exclusions&select=data");
  if (!res.ok) return { entries: [], restored_keys: [], updated_at: null };
  const rows = (await res.json()) as { data: ExclusionsData }[];
  const data = rows[0]?.data;
  return {
    entries: data?.entries || [],
    restored_keys: data?.restored_keys || [],
    updated_at: data?.updated_at ?? null,
  };
}

export async function writeExclusions(data: ExclusionsData): Promise<void> {
  if (!supabaseConfigured()) {
    await local.writeExclusions(data);
    return;
  }
  data.updated_at = new Date().toISOString();
  const res = await supabaseFetch("app_state", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: "exclusions", data }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase write failed (${res.status}): ${text}`);
  }
}

export async function readFixedCharges(): Promise<FixedChargesData> {
  if (!supabaseConfigured()) return local.readFixedCharges();
  const res = await supabaseFetch("app_state?id=eq.fixed_charges&select=data");
  if (!res.ok) return { charges: [], updated_at: null };
  const rows = (await res.json()) as { data: FixedChargesData }[];
  const data = rows[0]?.data;
  return { charges: data?.charges || [], updated_at: data?.updated_at ?? null };
}

export async function writeFixedCharges(data: FixedChargesData): Promise<void> {
  if (!supabaseConfigured()) {
    await local.writeFixedCharges(data);
    return;
  }
  data.updated_at = new Date().toISOString();
  const res = await supabaseFetch("app_state", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: "fixed_charges", data }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase write failed (${res.status}): ${text}`);
  }
}

export async function readFxFallback(): Promise<FxFallbackData> {
  if (!supabaseConfigured()) return local.readFxFallback();
  const res = await supabaseFetch("app_state?id=eq.fx_fallback&select=data");
  if (!res.ok) return { updated: "", rates: {} };
  const rows = (await res.json()) as { data: FxFallbackData }[];
  const data = rows[0]?.data;
  return { updated: data?.updated ?? "", rates: data?.rates ?? {} };
}

export async function writeFxFallback(data: FxFallbackData): Promise<void> {
  if (!supabaseConfigured()) {
    await local.writeFxFallback(data);
    return;
  }
  const res = await supabaseFetch("app_state", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: "fx_fallback", data }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase write failed (${res.status}): ${text}`);
  }
}

export {
  discoverXlsxFiles,
  fileHash,
  saveUploadedXlsx,
} from "./local.js";
