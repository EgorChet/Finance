import type { Cookie } from "puppeteer";

export interface CalSessionData {
  cookies: Cookie[];
  auth_module: string | null;
  saved_at: string;
}

const LOCAL_PATH_SUFFIX = "cal_session.json";

function localPath(): string {
  const dataDir = process.env.DATA_DIR || "./data";
  return `${dataDir}/${LOCAL_PATH_SUFFIX}`;
}

async function readLocal(): Promise<CalSessionData | null> {
  try {
    const { readFile } = await import("fs/promises");
    const raw = await readFile(localPath(), "utf-8");
    const data = JSON.parse(raw) as CalSessionData;
    if (!Array.isArray(data.cookies) || !data.cookies.length) return null;
    return data;
  } catch {
    return null;
  }
}

async function writeLocal(data: CalSessionData): Promise<void> {
  const { mkdir, writeFile } = await import("fs/promises");
  const path = localPath();
  await mkdir(path.replace(/\/[^/]+$/, ""), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), "utf-8");
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
  const rows = (await res.json()) as { data: CalSessionData }[];
  const data = rows[0]?.data;
  if (!Array.isArray(data?.cookies) || !data.cookies.length) return null;
  return data;
}

export async function writeCalSession(data: CalSessionData): Promise<void> {
  if (!supabaseConfigured()) {
    await writeLocal(data);
    return;
  }
  const res = await supabaseFetch("app_state", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: "cal_session", data }),
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
  await supabaseFetch("app_state?id=eq.cal_session", { method: "DELETE" });
}
