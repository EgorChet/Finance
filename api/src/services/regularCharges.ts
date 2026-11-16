/** Regular charges settings: which lines are switched off and hand-set amounts (Budget page). */
import { CUSTOM_RULE_PREFIX, DEFAULT_REGULAR_CHARGES, type RegularChargeOverrides } from "../../../core/spending/regularCharges.js";
import { readRegularCharges, writeRegularCharges } from "../storage/index.js";

const KNOWN = new Set(DEFAULT_REGULAR_CHARGES.map((r) => r.id));

export function normalizeRegularChargeOverrides(input: unknown): RegularChargeOverrides {
  const out: RegularChargeOverrides = {};
  if (!input || typeof input !== "object") return out;
  for (const [id, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as { off?: unknown; amount?: unknown; custom?: unknown; dismissed?: unknown };
    if (id.startsWith(CUSTOM_RULE_PREFIX)) {
      // A bill confirmed from a suggestion, or a suggestion declined; the key carries the name on the card.
      const merchant = id.slice(CUSTOM_RULE_PREFIX.length).trim();
      if (!merchant || merchant.length > 120) continue;
      const c = r.custom as { name?: unknown } | undefined;
      if (c && typeof c === "object") {
        const name = typeof c.name === "string" && c.name.trim() ? c.name.trim().slice(0, 80) : merchant;
        const amt = typeof r.amount === "number" && Number.isFinite(r.amount) && r.amount > 0 && r.amount < 100000
          ? Math.round(r.amount * 100) / 100
          : null;
        out[id] = { custom: { name, merchant }, ...(r.off === true ? { off: true } : {}), ...(amt != null ? { amount: amt } : {}) };
      } else if (r.dismissed === true) {
        out[id] = { dismissed: true };
      }
      continue;
    }
    if (!KNOWN.has(id)) continue;
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
