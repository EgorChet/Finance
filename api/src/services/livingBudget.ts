import type { FixedCharge, LivingBudgetData, LivingBudgetMonthEstimate, LivingBudgetMonthTopup, LivingBudgetSegment } from "../types.js";
import { applyMonthBases, resolveMonthBases, type LivingBudgetMonthBase } from "../../../core/household/livingBudget.js";
import { cycleStartForDate } from "../../../core/spending/pace.js";
import { listPayslips } from "./payslips/payslipService.js";
import { readLivingBudget, writeLivingBudget } from "../storage/index.js";

export const ONGOING_THROUGH_MONTH = "2035-12";
const MONTH_RE = /^\d{4}-\d{2}$/;

let cached: LivingBudgetData | null = null;

export function normalizeSegment(segment: LivingBudgetSegment): LivingBudgetSegment {
  return {
    amount: Math.round(segment.amount * 100) / 100,
    from_month: segment.from_month.trim(),
    through_month: segment.through_month.trim(),
  };
}

export function normalizeMonthTopup(topup: LivingBudgetMonthTopup): LivingBudgetMonthTopup {
  const note = topup.note?.trim();
  return {
    month: topup.month.trim(),
    extra: Math.round(topup.extra * 100) / 100,
    ...(note ? { note } : {}),
  };
}

export function normalizeEstimates(list: LivingBudgetMonthEstimate[] | undefined): LivingBudgetMonthEstimate[] {
  const byMonth = new Map<string, LivingBudgetMonthEstimate>();
  for (const e of list || []) {
    const month = String(e?.month ?? "").trim();
    const amount = Math.round(Number(e?.amount) * 100) / 100;
    if (MONTH_RE.test(month) && Number.isFinite(amount) && amount > 0 && amount < 1_000_000) byMonth.set(month, { month, amount });
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

function normalizeData(user: LivingBudgetData): LivingBudgetData {
  return {
    segments: (user.segments || []).map(normalizeSegment),
    month_topups: (user.month_topups || []).map(normalizeMonthTopup),
    month_estimates: normalizeEstimates(user.month_estimates),
  };
}

// ===== Cap additions (Cibus + Rent) =====

const CIBUS_CHARGE_IDS = new Set(["cibus-card", "cibus"]);
const CIBUS_NAME_RE = /\bcibus\b/i;
const RENT_CHARGE_IDS = new Set(["flat-rent", "rent"]);
const RENT_NAME_RE = /\b(flat rent|rent\b|שכירות)/i;
const CAR_LOAN_NAME_RE = /\b(car loan|הלוואת רכב)/i;

function isMonthlyCharge(charge: FixedCharge): boolean {
  return charge.schedule !== "once";
}

function isConfiguredEverydayCharge(charge: FixedCharge): boolean {
  // Everyday charges exclude rent, car loans, education (fixed cost categories)
  // For simplicity, we check if it's NOT a rent charge using the naming patterns
  const name = `${charge.name_en} ${charge.name_he || ""}`;
  return !RENT_NAME_RE.test(name) || CAR_LOAN_NAME_RE.test(name);
}

function isCibusConfiguredCharge(charge: FixedCharge): boolean {
  if (CIBUS_CHARGE_IDS.has(charge.id)) return true;
  const name = `${charge.name_en} ${charge.name_he || ""}`;
  return CIBUS_NAME_RE.test(name) && isConfiguredEverydayCharge(charge);
}

function isRentConfiguredCharge(charge: FixedCharge): boolean {
  if (RENT_CHARGE_IDS.has(charge.id)) return true;
  const name = `${charge.name_en} ${charge.name_he || ""}`;
  return RENT_NAME_RE.test(name) && !CAR_LOAN_NAME_RE.test(name);
}

function chargesForMonth(ym: string, charges: FixedCharge[]): FixedCharge[] {
  return charges.filter((c) => c.from_month <= ym && ym <= c.through_month);
}

function cibusChargeForMonth(ym: string, charges: FixedCharge[]): FixedCharge | null {
  const active = chargesForMonth(ym, charges).filter(
    (c) => isCibusConfiguredCharge(c) && isMonthlyCharge(c),
  );
  return active.find((c) => CIBUS_CHARGE_IDS.has(c.id)) ?? active[0] ?? null;
}

function rentChargeForMonth(ym: string, charges: FixedCharge[]): FixedCharge | null {
  const active = chargesForMonth(ym, charges).filter(
    (c) => isRentConfiguredCharge(c) && isMonthlyCharge(c),
  );
  return active.find((c) => RENT_CHARGE_IDS.has(c.id)) ?? active[0] ?? null;
}

function cibusAllowanceForMonth(ym: string, charges: FixedCharge[]): number {
  const charge = cibusChargeForMonth(ym, charges);
  return charge ? Math.round(charge.amount * 100) / 100 : 0;
}

function fatherInjectionForMonth(ym: string, charges: FixedCharge[]): number {
  const charge = rentChargeForMonth(ym, charges);
  return charge ? Math.round(charge.amount * 100) / 100 : 0;
}

function capAdditionsForMonth(ym: string, charges: FixedCharge[]): number {
  return Math.round((cibusAllowanceForMonth(ym, charges) + fatherInjectionForMonth(ym, charges)) * 100) / 100;
}

export async function refreshLivingBudgetCache(): Promise<void> {
  const user = await readLivingBudget();
  cached = normalizeData(user);
}

function ensureCache(): void {
  if (!cached) cached = { segments: [], month_topups: [] };
}

export function loadLivingBudgetData(): LivingBudgetData {
  ensureCache();
  return cached!;
}

export function loadLivingBudgetSegments(): LivingBudgetSegment[] {
  return loadLivingBudgetData().segments;
}

export function loadLivingBudgetMonthTopups(): LivingBudgetMonthTopup[] {
  return loadLivingBudgetData().month_topups || [];
}

function livingBudgetBaseForMonth(ym: string, segments: LivingBudgetSegment[], charges: FixedCharge[] = []): number | null {
  const match = segments.find((s) => s.from_month <= ym && ym <= s.through_month);
  if (!match) return null;
  return Math.round((match.amount + capAdditionsForMonth(ym, charges)) * 100) / 100;
}

function monthTopupExtraForMonth(ym: string, monthTopups: LivingBudgetMonthTopup[]): number {
  return Math.round(
    monthTopups.filter((t) => t.month === ym).reduce((sum, t) => sum + normalizeMonthTopup(t).extra, 0) * 100,
  ) / 100;
}

export function livingBudgetForMonth(
  ym: string,
  segments = loadLivingBudgetSegments(),
  monthTopups = loadLivingBudgetMonthTopups(),
  charges: FixedCharge[] = [],
): number | null {
  const base = livingBudgetBaseForMonth(ym, segments, charges);
  if (base === null) return null;
  return Math.round((base + monthTopupExtraForMonth(ym, monthTopups)) * 100) / 100;
}

function segmentsOverlap(a: LivingBudgetSegment, b: LivingBudgetSegment): boolean {
  return a.from_month <= b.through_month && b.from_month <= a.through_month;
}

export function validateLivingBudgetSegments(segments: LivingBudgetSegment[]): string | null {
  if (!segments.length) return "At least one budget period is required";
  for (const raw of segments) {
    const segment = normalizeSegment(raw);
    if (!Number.isFinite(segment.amount) || segment.amount <= 0) return "Each budget amount must be positive";
    if (!MONTH_RE.test(segment.from_month) || !MONTH_RE.test(segment.through_month)) {
      return "Months must be YYYY-MM";
    }
    if (segment.from_month > segment.through_month) {
      return "Start month must be on or before end month";
    }
  }
  const sorted = [...segments].map(normalizeSegment).sort((a, b) => a.from_month.localeCompare(b.from_month));
  for (let i = 1; i < sorted.length; i += 1) {
    if (segmentsOverlap(sorted[i - 1], sorted[i])) {
      return "Budget periods must not overlap";
    }
  }
  return null;
}

export function validateLivingBudgetMonthTopups(
  monthTopups: LivingBudgetMonthTopup[],
  segments: LivingBudgetSegment[],
  charges: FixedCharge[] = [],
): string | null {
  // Several extras per month are fine; the month's extra is their sum.
  for (const raw of monthTopups) {
    const topup = normalizeMonthTopup(raw);
    if (!MONTH_RE.test(topup.month)) return "Each monthly extra needs a valid month (YYYY-MM)";
    if (!Number.isFinite(topup.extra) || topup.extra <= 0) return "Each monthly extra must be positive";
    if (livingBudgetBaseForMonth(topup.month, segments, charges) === null) {
      return `No base budget covers ${topup.month}`;
    }
  }
  return null;
}

export function validateLivingBudget(
  segments: LivingBudgetSegment[],
  monthTopups: LivingBudgetMonthTopup[] = [],
  charges: FixedCharge[] = [],
): string | null {
  const segmentError = validateLivingBudgetSegments(segments);
  if (segmentError) return segmentError;
  return validateLivingBudgetMonthTopups(monthTopups, segments, charges);
}

export async function saveLivingBudget(
  segments: LivingBudgetSegment[],
  monthTopups: LivingBudgetMonthTopup[] = [],
  charges: FixedCharge[] = [],
  /** Undefined keeps what is stored (the Budget page doesn't send them back). */
  monthEstimates?: LivingBudgetMonthEstimate[],
): Promise<LivingBudgetData> {
  const normalized: LivingBudgetData = {
    segments: segments.map(normalizeSegment).sort((a, b) => a.from_month.localeCompare(b.from_month)),
    month_topups: monthTopups.map(normalizeMonthTopup).sort((a, b) => a.month.localeCompare(b.month)),
    month_estimates: monthEstimates === undefined ? loadLivingBudgetData().month_estimates || [] : normalizeEstimates(monthEstimates),
  };
  const error = validateLivingBudget(normalized.segments, normalized.month_topups, charges);
  if (error) throw new Error(error);
  await writeLivingBudget(normalized);
  cached = null;
  await refreshLivingBudgetCache();
  const persisted = loadLivingBudgetData();
  if (persisted.segments.length !== normalized.segments.length) {
    throw new Error(
      "Living budget did not persist — check that Render has deployed the latest API and Supabase credentials are set.",
    );
  }
  return persisted;
}

/** Set (or clear with null) what is expected to be taken home for one month. */
export async function setMonthEstimate(month: string, amount: number | null): Promise<LivingBudgetData> {
  if (!MONTH_RE.test(month)) throw new Error("Month must be YYYY-MM");
  const current = loadLivingBudgetData();
  const others = (current.month_estimates || []).filter((e) => e.month !== month);
  const next = amount == null ? others : [...others, { month, amount }];
  const normalized: LivingBudgetData = {
    segments: current.segments,
    month_topups: current.month_topups || [],
    month_estimates: normalizeEstimates(next),
  };
  if (amount != null && !normalized.month_estimates!.some((e) => e.month === month)) throw new Error("Amount must be a positive number");
  await writeLivingBudget(normalized);
  cached = null;
  await refreshLivingBudgetCache();
  return loadLivingBudgetData();
}

export interface EffectiveLivingBudget {
  /** The periods with payslip and estimate months cut out: what every calculation should use. */
  segments: LivingBudgetSegment[];
  month_topups: LivingBudgetMonthTopup[];
  month_bases: LivingBudgetMonthBase[];
  /** Net pay of the latest payslip: the number to offer when asking what to expect for a month. */
  estimate_suggestion: number | null;
  /** Net pay by payslip month (private: only handed to Egor). */
  payslip_nets: Record<string, number>;
}

/** "Now" decides which month the open cycle is; payslips are only read, never changed here. */
export async function effectiveLivingBudget(now: Date, cycleDay: number): Promise<EffectiveLivingBudget> {
  const data = loadLivingBudgetData();
  let nets: Record<string, number> = {};
  let suggestion: number | null = null;
  try {
    const payslips = await listPayslips();
    for (const p of payslips) nets[p.id] = p.totals.netPayable || p.totals.net;
    const latest = payslips[0];
    suggestion = latest ? latest.totals.netPayable || latest.totals.net : null;
  } catch {
    nets = {};
  }
  const currentMonth = cycleStartForDate(now, cycleDay).slice(0, 7);
  const bases = resolveMonthBases({ estimates: data.month_estimates || [], payslipNets: nets, currentMonth });
  return {
    segments: applyMonthBases(data.segments, bases),
    month_topups: data.month_topups || [],
    month_bases: bases,
    estimate_suggestion: suggestion,
    payslip_nets: nets,
  };
}
