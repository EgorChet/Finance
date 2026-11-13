/** Regular charges settings: which lines are switched off and hand-set amounts (Budget page). */
import { DEFAULT_REGULAR_CHARGES, type RegularChargeOverrides } from "../../../core/spending/regularCharges.js";
import { readRegularCharges, writeRegularCharges } from "../storage/index.js";

const KNOWN = new Set(DEFAULT_REGULAR_CHARGES.map((r) => r.id));

export function normalizeRegularChargeOverrides(input: unknown): RegularChargeOverrides {
  const out: RegularChargeOverrides = {};
  if (!input || typeof input !== "object") return out;
  for (const [id, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!KNOWN.has(id) || !raw || typeof raw !== "object") continue;
    const r = raw as { off?: unknown; amount?: unknown };
    const amount = typeof r.amount === "number" && Number.isFinite(r.amount) && r.amount > 0 && r.amount < 100000
      ? Math.round(r.amount * 100) / 100
      : null;
    if (r.off === true || amount != null) out[id] = { ...(r.off === true ? { off: true } : {}), ...(amount != null ? { amount } : {}) };
  }
  return out;
}

export async function loadRegularChargeOverrides(): Promise<RegularChargeOverrides> {
  try {
    const raw = (await readRegularCharges()) as { overrides?: unknown } | null;
    return normalizeRegularChargeOverrides(raw?.overrides);
  } catch {
    return {};
  }
}

export async function saveRegularChargeOverrides(input: unknown): Promise<RegularChargeOverrides> {
  const overrides = normalizeRegularChargeOverrides(input);
  await writeRegularCharges({ overrides, updated_at: new Date().toISOString() });
  return overrides;
}
