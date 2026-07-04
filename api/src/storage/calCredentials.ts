import path from "path";
import { DATA_DIR } from "./paths.js";

export interface CalCredentialsData {
  national_id: string;
  card_last4: string;
  updated_at?: string | null;
}

const LOCAL_PATH_SUFFIX = "cal_credentials.json";

function localPath(): string {
  return path.join(DATA_DIR, LOCAL_PATH_SUFFIX);
}

async function readLocal(): Promise<CalCredentialsData | null> {
  try {
    const { readFile } = await import("fs/promises");
    const raw = await readFile(localPath(), "utf-8");
    const data = JSON.parse(raw) as CalCredentialsData;
    if (!data.national_id?.trim() || !data.card_last4?.trim()) return null;
    return data;
  } catch {
    return null;
  }
}

async function writeLocal(data: CalCredentialsData): Promise<void> {
  const { mkdir, writeFile } = await import("fs/promises");
  const filePath = localPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

async function supabaseFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_KEY || "";
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init?.headers || {}),
    },
  });
}

function supabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

export function maskNationalId(id: string): string {
  const digits = id.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `••••${digits.slice(-4)}`;
}

export async function readCalCredentials(): Promise<CalCredentialsData | null> {
  if (!supabaseConfigured()) return readLocal();
  const res = await supabaseFetch("app_state?id=eq.cal_credentials&select=data");
  if (!res.ok) return null;
  const rows = (await res.json()) as { data: CalCredentialsData }[];
  const data = rows[0]?.data;
  if (!data?.national_id?.trim() || !data?.card_last4?.trim()) return null;
  return data;
}

export async function writeCalCredentials(nationalId: string, cardLast4: string): Promise<CalCredentialsData> {
  const data: CalCredentialsData = {
    national_id: nationalId.trim(),
    card_last4: cardLast4.trim(),
    updated_at: new Date().toISOString(),
  };
  const existing = await readCalCredentials();
  const credsChanged =
    existing &&
    (existing.national_id !== data.national_id || existing.card_last4 !== data.card_last4);
  if (credsChanged) {
    const { clearCalSession } = await import("./calSession.js");
    await clearCalSession();
  }
  if (!supabaseConfigured()) {
    await writeLocal(data);
    return data;
  }
  const res = await supabaseFetch("app_state", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: "cal_credentials", data }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to save Cal credentials (${res.status}): ${text}`);
  }
  return data;
}

export function calSyncEnabled(): boolean {
  return process.env.CAL_SYNC_ENABLED === "true" || process.env.CAL_SYNC_ENABLED === "1";
}
