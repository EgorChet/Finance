/**
 * Browser side of the pace settings (billing-cycle day, pace options, manual cycle spend).
 *
 * The source of truth is the API (`/api/settings`), so the Telegram assistant and every device
 * see the same values. The browser keeps a cached copy so screens render instantly and
 * offline, and pushes local changes to the server shortly after they happen.
 */
import {
  CYCLE_DAY_KEY,
  PACE_AVG_CYCLES_KEY,
  PACE_INCLUDE_FIXED_KEY,
} from "@core/spending/pace";
import {
  defaultPaceSettings,
  normalizePaceSettings,
  setPaceSettingsSource,
  type ManualCycleSpendEntry,
  type PaceSettings,
} from "@core/spending/paceSettings";
import { fetchPaceSettings, savePaceSettings } from "@/shared/api/client";

const CACHE_KEY = "finance-pace-settings";
const MANUAL_PREFIX = "finance-pace-manual-";
const LEGACY_SAVED_AT = "1970-01-01T00:00:00.000Z";
const HYDRATE_TIMEOUT_MS = 2500;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Settings written by older app versions, one localStorage key each. */
function readLegacy(): { settings: PaceSettings; found: boolean } {
  const ls = storage();
  const settings = defaultPaceSettings();
  if (!ls) return { settings, found: false };
  let found = false;
  const day = ls.getItem(CYCLE_DAY_KEY);
  if (day) {
    settings.cycle_day = parseInt(day, 10);
    found = true;
  }
  const fixed = ls.getItem(PACE_INCLUDE_FIXED_KEY);
  if (fixed !== null) {
    settings.pace_include_fixed = fixed === "true";
    found = true;
  }
  const avg = ls.getItem(PACE_AVG_CYCLES_KEY);
  if (avg) {
    settings.pace_avg_cycles = parseInt(avg, 10) as PaceSettings["pace_avg_cycles"];
    found = true;
  }
  for (let i = 0; i < ls.length; i += 1) {
    const key = ls.key(i);
    if (!key?.startsWith(MANUAL_PREFIX)) continue;
    const raw = ls.getItem(key) || "";
    let entry: Partial<ManualCycleSpendEntry> = {};
    try {
      entry = raw.startsWith("{") ? JSON.parse(raw) : { amount: parseFloat(raw), savedAt: LEGACY_SAVED_AT };
    } catch {
      continue;
    }
    settings.manual_cycle_spend[key.slice(MANUAL_PREFIX.length)] = entry as ManualCycleSpendEntry;
    found = true;
  }
  return { settings: normalizePaceSettings(settings), found };
}

function readCache(): PaceSettings | null {
  const raw = storage()?.getItem(CACHE_KEY);
  if (!raw) return null;
  try {
    return normalizePaceSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeCache(settings: PaceSettings): void {
  try {
    storage()?.setItem(CACHE_KEY, JSON.stringify(settings));
  } catch {
    /* storage full or blocked: the in-memory copy still works */
  }
}

const legacy = readLegacy();
let current: PaceSettings = readCache() ?? legacy.settings;
/** True when this browser holds values the server may not have yet (old app version). */
let hasUnsyncedLegacy = !readCache() && legacy.found;
let token: string | undefined;
let syncEnabled = false;
let uploadTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleUpload(): void {
  if (!syncEnabled) return;
  if (uploadTimer) clearTimeout(uploadTimer);
  uploadTimer = setTimeout(() => {
    uploadTimer = null;
    savePaceSettings(current, token)
      .then((saved) => {
        hasUnsyncedLegacy = false;
        if (saved?.updated_at) {
          current = { ...current, updated_at: saved.updated_at };
          writeCache(current);
        }
      })
      .catch((err) => console.warn("Could not save settings to the server", err));
  }, 600);
}

setPaceSettingsSource({
  get: () => current,
  save: (next) => {
    current = normalizePaceSettings(next);
    writeCache(current);
    scheduleUpload();
  },
});

/**
 * Load settings from the server. Call before mounting and after sign-in.
 * Never blocks for long: a sleeping free-tier server falls back to the cached copy.
 */
export async function hydratePaceSettings(
  authToken: string | null | undefined,
  demo: boolean,
  canEdit = true,
): Promise<void> {
  if (demo || !authToken) {
    syncEnabled = false;
    return;
  }
  token = authToken;
  // View-only members read the household settings but never write them.
  syncEnabled = canEdit;
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), HYDRATE_TIMEOUT_MS));
  const request = fetchPaceSettings(token).catch(() => null);
  const apply = (server: PaceSettings | null) => {
    if (!server) return;
    const remote = normalizePaceSettings(server);
    if (!canEdit) {
      current = remote;
      writeCache(current);
      return;
    }
    if (!remote.updated_at) {
      // Server has never stored settings: seed it from this device.
      if (hasUnsyncedLegacy || current.updated_at) scheduleUpload();
      return;
    }
    if (!current.updated_at || remote.updated_at >= current.updated_at) {
      current = remote;
      writeCache(current);
    } else {
      scheduleUpload();
    }
  };
  const first = await Promise.race([request, timeout]);
  if (first) {
    apply(first);
  } else {
    // Slow server: keep the cached copy now, adopt the server's once it answers.
    void request.then(apply);
  }
}
