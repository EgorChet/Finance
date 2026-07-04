import path from "path";

/**
 * True when the API should read/write JSON + .xlsx on disk.
 * Default is Supabase whenever credentials are set; set STORAGE=local for offline-only.
 */
export function useLocalFileStorage(): boolean {
  if (process.env.STORAGE === "local") return true;
  if (process.env.STORAGE === "supabase") return false;
  return !(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_KEY?.trim());
}

/** Offline fallback only (STORAGE=local). Not used when Supabase is configured. */
export const DATA_DIR =
  process.env.DATA_DIR || path.resolve(process.cwd(), "..", "local", "data");

export const STATEMENTS_DIR =
  process.env.STATEMENTS_DIR || path.join(path.resolve(DATA_DIR, ".."), "statements");
