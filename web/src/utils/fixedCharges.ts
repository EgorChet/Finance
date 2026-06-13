import { roundMoney } from "./format";

export interface ConfiguredCharge {
  id: string;
  name_en: string;
  name_he?: string;
  amount: number;
  category_en: string;
  from_month: string;
  through_month: string;
}

export function chargesForMonth(ym: string, charges: ConfiguredCharge[]): ConfiguredCharge[] {
  return charges.filter((c) => c.from_month <= ym && ym <= c.through_month);
}

/** Configured recurring charges for a billing cycle (deduped by id). */
export function configuredChargesForCycle(
  cycleStart: string,
  charges: ConfiguredCharge[],
): ConfiguredCharge[] {
  const ym = cycleStart.slice(0, 7);
  const byId = new Map<string, ConfiguredCharge>();
  for (const charge of chargesForMonth(ym, charges)) {
    byId.set(charge.id, charge);
  }
  return [...byId.values()];
}

export function sumConfiguredCharges(cycleStart: string, charges: ConfiguredCharge[]): number {
  return roundMoney(
    configuredChargesForCycle(cycleStart, charges).reduce((sum, c) => sum + c.amount, 0),
  );
}

export const ONGOING_THROUGH_MONTH = "2035-12";

export function isOngoingThrough(throughMonth: string): boolean {
  return throughMonth >= "2030-01";
}

export function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function segmentStatus(
  fromMonth: string,
  throughMonth: string,
  nowYm = currentYearMonth(),
): "upcoming" | "active" | "ended" {
  if (throughMonth < nowYm) return "ended";
  if (fromMonth > nowYm) return "upcoming";
  return "active";
}

export interface ChargeGroup {
  id: string;
  name_en: string;
  name_he?: string;
  category_en: string;
  segments: ConfiguredCharge[];
}

export function groupCharges(charges: ConfiguredCharge[]): ChargeGroup[] {
  const groups = new Map<string, ChargeGroup>();
  for (const charge of charges) {
    const existing = groups.get(charge.id);
    if (existing) {
      existing.segments.push(charge);
      continue;
    }
    groups.set(charge.id, {
      id: charge.id,
      name_en: charge.name_en,
      name_he: charge.name_he,
      category_en: charge.category_en,
      segments: [charge],
    });
  }
  for (const group of groups.values()) {
    group.segments.sort((a, b) => a.from_month.localeCompare(b.from_month));
  }
  return [...groups.values()].sort((a, b) => a.name_en.localeCompare(b.name_en));
}

export function segmentKey(charge: ConfiguredCharge): string {
  return `${charge.id}|${charge.from_month}|${charge.through_month}|${charge.amount}`;
}

export function slugifyId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "charge";
}

export function ymToLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const idx = Number.parseInt(m, 10) - 1;
  if (idx < 0 || idx > 11 || !y) return ym;
  return `${months[idx]} ${y}`;
}

export function monthRangeLabel(fromMonth: string, throughMonth: string): string {
  const from = ymToLabel(fromMonth);
  if (isOngoingThrough(throughMonth)) return `${from} → ongoing`;
  return `${from} → ${ymToLabel(throughMonth)}`;
}
