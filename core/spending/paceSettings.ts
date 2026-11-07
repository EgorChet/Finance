/**
 * Pace settings and the manual "spent so far" entry for an open billing cycle.
 *
 * The logic in this core module is shared by the web app and the API. Where these values
 * live depends on who runs it, so it reads them through a pluggable source:
 * - web: browser cache, kept in sync with the API (`/api/settings`)
 * - API: the stored settings document, loaded per request
 * Defaults apply until a source is registered.
 */

/** 0 = average over all completed cycles. */
export const PACE_AVG_CYCLE_OPTIONS = [3, 6, 12, 0] as const;
export type PaceAvgCycles = (typeof PACE_AVG_CYCLE_OPTIONS)[number];

export const DEFAULT_CYCLE_DAY = 10;
export const DEFAULT_PACE_INCLUDE_FIXED = true;
export const DEFAULT_PACE_AVG_CYCLES: PaceAvgCycles = 3;

export interface ManualCycleSpendEntry {
  amount: number;
  savedAt: string;
}

/** The household's pace settings as stored on the server. */
export interface PaceSettings {
  cycle_day: number;
  pace_include_fixed: boolean;
  pace_avg_cycles: PaceAvgCycles;
  /** Keyed by cycle start date (YYYY-MM-DD). */
  manual_cycle_spend: Record<string, ManualCycleSpendEntry>;
  updated_at?: string | null;
}

export function defaultPaceSettings(): PaceSettings {
  return {
    cycle_day: DEFAULT_CYCLE_DAY,
    pace_include_fixed: DEFAULT_PACE_INCLUDE_FIXED,
    pace_avg_cycles: DEFAULT_PACE_AVG_CYCLES,
    manual_cycle_spend: {},
  };
}

export function normalizeCycleDay(value: unknown): number {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  return Number.isInteger(n) && n >= 1 && n <= 28 ? n : DEFAULT_CYCLE_DAY;
}

export function normalizePaceAvgCycles(value: unknown): PaceAvgCycles {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  return (PACE_AVG_CYCLE_OPTIONS as readonly number[]).includes(n)
    ? (n as PaceAvgCycles)
    : DEFAULT_PACE_AVG_CYCLES;
}

export function normalizeManualEntry(value: unknown): ManualCycleSpendEntry | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { amount?: unknown; savedAt?: unknown };
  const amount = typeof raw.amount === "number" ? raw.amount : parseFloat(String(raw.amount));
  const savedAt = typeof raw.savedAt === "string" ? raw.savedAt : "";
  if (!Number.isFinite(amount) || amount <= 0 || !savedAt) return null;
  return { amount: Math.round(amount * 100) / 100, savedAt };
}

/** Validate anything that claims to be settings (request bodies, stored JSON). */
export function normalizePaceSettings(value: unknown): PaceSettings {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof PaceSettings, unknown>>;
  const manual: Record<string, ManualCycleSpendEntry> = {};
  if (raw.manual_cycle_spend && typeof raw.manual_cycle_spend === "object") {
    for (const [cycleStart, entry] of Object.entries(raw.manual_cycle_spend as Record<string, unknown>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cycleStart)) continue;
      const normalized = normalizeManualEntry(entry);
      if (normalized) manual[cycleStart] = normalized;
    }
  }
  return {
    cycle_day: normalizeCycleDay(raw.cycle_day),
    pace_include_fixed:
      typeof raw.pace_include_fixed === "boolean" ? raw.pace_include_fixed : DEFAULT_PACE_INCLUDE_FIXED,
    pace_avg_cycles: normalizePaceAvgCycles(raw.pace_avg_cycles),
    manual_cycle_spend: manual,
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : null,
  };
}

/** Where the current settings come from. `save` is called after every local change. */
export interface PaceSettingsSource {
  get(): PaceSettings;
  save(next: PaceSettings): void;
}

function memorySource(initial: PaceSettings = defaultPaceSettings()): PaceSettingsSource {
  let current = initial;
  return {
    get: () => current,
    save: (next) => {
      current = next;
    },
  };
}

let source: PaceSettingsSource = memorySource();

export function setPaceSettingsSource(next: PaceSettingsSource): void {
  source = next;
}

/** Run `fn` with fixed settings (server side: one request, synchronous compute). */
export function withPaceSettings<T>(settings: PaceSettings, fn: () => T): T {
  const previous = source;
  source = memorySource(settings);
  try {
    return fn();
  } finally {
    source = previous;
  }
}

export function getPaceSettings(): PaceSettings {
  return source.get();
}

function update(patch: Partial<PaceSettings>): void {
  source.save({ ...source.get(), ...patch, updated_at: new Date().toISOString() });
}

export function loadCycleDay(): number {
  return normalizeCycleDay(source.get().cycle_day);
}

export function saveCycleDay(day: number): void {
  update({ cycle_day: normalizeCycleDay(day) });
}

export function loadPaceIncludeFixed(): boolean {
  return source.get().pace_include_fixed;
}

export function savePaceIncludeFixed(value: boolean): void {
  update({ pace_include_fixed: value });
}

export function loadPaceAvgCycles(): PaceAvgCycles {
  return normalizePaceAvgCycles(source.get().pace_avg_cycles);
}

export function savePaceAvgCycles(value: PaceAvgCycles): void {
  update({ pace_avg_cycles: normalizePaceAvgCycles(value) });
}

export function loadManualCycleSpendEntry(cycleStart: string): ManualCycleSpendEntry | null {
  return normalizeManualEntry(source.get().manual_cycle_spend[cycleStart]);
}

export function loadManualCycleSpend(cycleStart: string): number | null {
  return loadManualCycleSpendEntry(cycleStart)?.amount ?? null;
}

export function saveManualCycleSpend(cycleStart: string, amount: number | null): void {
  const manual = { ...source.get().manual_cycle_spend };
  if (amount === null || amount <= 0) {
    delete manual[cycleStart];
  } else {
    manual[cycleStart] = { amount: Math.round(amount * 100) / 100, savedAt: new Date().toISOString() };
  }
  update({ manual_cycle_spend: manual });
}

/** Manual bank-app entry only applies when no newer statement snapshot exists for this cycle. */
export function effectiveManualCycleSpend(
  cycleStart: string,
  options: { statementSavedAt?: string | null; hasStatementSpend?: boolean } = {},
): number | null {
  const entry = loadManualCycleSpendEntry(cycleStart);
  if (!entry) return null;
  if (!options.hasStatementSpend) return entry.amount;
  const statementAt = options.statementSavedAt?.trim();
  if (!statementAt) return null;
  return entry.savedAt > statementAt ? entry.amount : null;
}

/** Drop manual entries superseded by a newer partial or final upload. */
export function pruneStaleManualCycleSpend(
  cycleStart: string,
  options: { statementSavedAt?: string | null; hasStatementSpend?: boolean } = {},
): void {
  if (!loadManualCycleSpendEntry(cycleStart)) return;
  if (effectiveManualCycleSpend(cycleStart, options) !== null) return;
  saveManualCycleSpend(cycleStart, null);
}
