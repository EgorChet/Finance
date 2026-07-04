import path from "path";
import type { Cookie } from "puppeteer";
import {
  calSessionEncryptionConfigured,
  decryptJson,
  encryptJson,
  isEncryptedEnvelope,
  type EncryptedEnvelope,
} from "../utils/atRestEncryption.js";
import { DATA_DIR } from "./paths.js";

export interface CalSessionData {
  cookies: Cookie[];
  auth_module: string | null;
  /** Full sessionStorage snapshot from digital-web (preferred over auth_module alone). */
  session_storage?: Record<string, string>;
  saved_at: string;
}

type StoredCalSession = CalSessionData | EncryptedEnvelope;

const LOCAL_PATH_SUFFIX = "cal_session.json";

function localPath(): string {
  return path.join(DATA_DIR, LOCAL_PATH_SUFFIX);
}

function isCalSessionData(value: unknown): value is CalSessionData {
  if (typeof value !== "object" || value === null) return false;
  const data = value as CalSessionData;
  return Array.isArray(data.cookies) && data.cookies.length > 0;
}

function parseStoredCalSession(raw: unknown): CalSessionData | null {
  if (isEncryptedEnvelope(raw)) {
    if (!calSessionEncryptionConfigured()) {
      console.warn("[cal-session] Encrypted session found but CAL_SESSION_ENCRYPTION_KEY is not set");
      return null;
    }
    try {
      const data = decryptJson<CalSessionData>(raw);
      return isCalSessionData(data) ? data : null;
    } catch (err) {
      console.warn(
        `[cal-session] Could not decrypt saved session: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
  return isCalSessionData(raw) ? raw : null;
}

function serializeCalSession(data: CalSessionData): StoredCalSession {
  if (calSessionEncryptionConfigured()) {
    return encryptJson(data);
  }
  return data;
}

async function readLocal(): Promise<CalSessionData | null> {
  try {
    const { readFile } = await import("fs/promises");
    const raw = await readFile(localPath(), "utf-8");
    return parseStoredCalSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeLocal(data: CalSessionData): Promise<void> {
  const { mkdir, writeFile } = await import("fs/promises");
  const filePath = localPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(serializeCalSession(data), null, 2), "utf-8");
}

async function deleteLocal(): Promise<void> {
  try {
    const { unlink } = await import("fs/promises");
    await unlink(localPath());
  } catch {
    /* ignore */
  }
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

export async function readCalSession(): Promise<CalSessionData | null> {
  if (!supabaseConfigured()) return readLocal();
  const res = await supabaseFetch("app_state?id=eq.cal_session&select=data");
  if (!res.ok) return null;
  const rows = (await res.json()) as { data: unknown }[];
  return parseStoredCalSession(rows[0]?.data);
}

export async function writeCalSession(data: CalSessionData): Promise<void> {
  const stored = serializeCalSession(data);
  if (!supabaseConfigured()) {
    await writeLocal(data);
    return;
  }
  const res = await supabaseFetch("app_state", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: "cal_session", data: stored }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to save Cal session (${res.status}): ${text}`);
  }
}

export async function clearCalSession(): Promise<void> {
  if (!supabaseConfigured()) {
    await deleteLocal();
    return;
  }
  const res = await supabaseFetch("app_state?id=eq.cal_session", { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to clear Cal session (${res.status}): ${text}`);
  }
}
