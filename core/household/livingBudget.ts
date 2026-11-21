import type { SpendingReport } from "../types.js";
import { roundMoney } from "../utils/format.js";

import {
  currentYearMonth,
  isOngoingThrough,
  monthRangeLabel,
  ONGOING_THROUGH_MONTH,
  segmentStatus,
  ymToLabel,
} from "./fixedCharges.js";
import type { ConfiguredCharge } from "./fixedCharges.js";
import {
  cibusAllowanceForMonth,
  capAdditionsForMonth,
  CIBUS_LABEL,
  FATHER_INJECTION_LABEL,
} from "./budgetCapAdditions.js";
import { cycleStartForStatementBilling, cycleStartFromMonthKey, isCycleMonthKey } from "../spending/pace.js";

export interface LivingBudgetSegment {
  amount: number;
  from_month: string;
  through_month: string;
}

/**
 * One extra amount for a single calendar month, added on top of the active period.
 * A month can have several (leftover from last month, a refund, money from savings…):
 * the month's extra is their sum. Old data with one entry per month works unchanged.
 */
export interface LivingBudgetMonthTopup {
  month: string;
  extra: number;
  note?: string;
}

/**
 * What you expect to take home for a month, said before the payslip is there (it comes at the very end
 * of the cycle). Until the payslip is uploaded the month's budget uses this; then the payslip wins.
 */
export interface LivingBudgetMonthEstimate {
  month: string;
  amount: number;
}

export type LivingBudgetMonthBaseSource = "payslip" | "estimate" | "latest";

/** The salary part of one month's budget when it is not simply the period's amount. */
export interface LivingBudgetMonthBase {
  month: string;
  amount: number;
  source: LivingBudgetMonthBaseSource;
  /** The expected amount that the payslip replaced, when there was one. */
  estimate?: number;
}

export interface LivingBudgetData {
  segments: LivingBudgetSegment[];
  month_topups?: LivingBudgetMonthTopup[];
  month_estimates?: LivingBudgetMonthEstimate[];
}

export function normalizeLivingBudgetSegment(segment: LivingBudgetSegment): LivingBudgetSegment {
  return {
    amount: roundMoney(segment.amount),
    from_month: segment.from_month.trim(),
    through_month: segment.through_month.trim(),
  };
}

export function livingBudgetSegmentKey(segment: LivingBudgetSegment): string {
  return `${segment.from_month}|${segment.through_month}|${segment.amount}`;
}

/** Stable list key for v-for — must not include amount (typing would remount the input). */
export function livingBudgetSegmentStableKey(segment: LivingBudgetSegment): string {
  return `${segment.from_month}|${segment.through_month}`;
}

export function normalizeLivingBudgetMonthTopup(topup: LivingBudgetMonthTopup): LivingBudgetMonthTopup {
  const note = topup.note?.trim();
  return {
    month: topup.month.trim(),
    extra: roundMoney(topup.extra),
    ...(note ? { note } : {}),
  };
}

export function livingBudgetMonthTopupStableKey(topup: LivingBudgetMonthTopup, index = 0): string {
  return `${topup.month}#${index}`;
}

/** Extras of one month, in the order they were added. */
export function monthTopupsForMonth(ym: string, monthTopups: LivingBudgetMonthTopup[]): LivingBudgetMonthTopup[] {
  return monthTopups.filter((t) => t.month === ym).map(normalizeLivingBudgetMonthTopup);
}

export function monthTopupExtraForMonth(ym: string, monthTopups: LivingBudgetMonthTopup[]): number {
  return roundMoney(
    monthTopups.filter((t) => t.month === ym).reduce((sum, t) => sum + normalizeLivingBudgetMonthTopup(t).extra, 0),
  );
}

export function livingBudgetForMonth(
  ym: string,
  segments: LivingBudgetSegment[],
  monthTopups: LivingBudgetMonthTopup[] = [],
  configuredCharges: ConfiguredCharge[] = [],
): number | null {
  const base = livingBudgetBaseForMonth(ym, segments, configuredCharges);
  if (base === null) return null;
  return roundMoney(base + monthTopupExtraForMonth(ym, monthTopups));
}

export function livingBudgetBaseForMonth(
  ym: string,
  segments: LivingBudgetSegment[],
  configuredCharges: ConfiguredCharge[] = [],
): number | null {
  const match = livingBudgetSegmentForMonth(ym, segments);
  if (!match) return null;
  return roundMoney(match.amount + capAdditionsForMonth(ym, configuredCharges));
}

/** Active living-budget period for a calendar month (YYYY-MM). */
export function livingBudgetSegmentForMonth(
  ym: string,
  segments: LivingBudgetSegment[],
): LivingBudgetSegment | null {
  return segments.find((s) => s.from_month <= ym && ym <= s.through_month) ?? null;
}

/** Next calendar month as YYYY-MM. */
export function nextCalendarMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m >= 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/**
 * The month-by-month salary: a payslip replaces an estimate, and counts by itself from the month the
 * cycle is in now onwards. A past month without an estimate keeps its period amount: the payslip's net
 * can include pay that was added to the budget as an extra by hand, so past months are changed only
 * when you confirm it (which is done by giving that month an estimate).
 */
export function resolveMonthBases(opts: {
  estimates: LivingBudgetMonthEstimate[];
  /** Net pay by payslip month ("2026-10" → 12345.67). */
  payslipNets: Record<string, number>;
  /** The month the open cycle belongs to. */
  currentMonth: string;
}): LivingBudgetMonthBase[] {
  const out = new Map<string, LivingBudgetMonthBase>();
  for (const e of opts.estimates) {
    if (/^\d{4}-\d{2}$/.test(e.month) && e.amount > 0) out.set(e.month, { month: e.month, amount: roundMoney(e.amount), source: "estimate" });
  }
  for (const [month, net] of Object.entries(opts.payslipNets)) {
    if (!(net > 0)) continue;
    const estimate = out.get(month);
    if (month >= opts.currentMonth || estimate) {
      out.set(month, { month, amount: roundMoney(net), source: "payslip", ...(estimate ? { estimate: estimate.amount } : {}) });
    }
  }
  // From this month on, a month with neither a payslip nor an estimate follows the latest payslip.
  const latest = Object.entries(opts.payslipNets)
    .filter(([, net]) => net > 0)
    .sort(([a], [b]) => b.localeCompare(a))[0];
  if (latest) {
    let ym = opts.currentMonth;
    for (let i = 0; i < 12; i += 1) {
      if (!out.has(ym)) out.set(ym, { month: ym, amount: roundMoney(latest[1]), source: "latest" });
      ym = nextCalendarMonth(ym);
    }
  }
  return [...out.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** The periods with those months cut out and given their own amount. */
export function applyMonthBases(segments: LivingBudgetSegment[], bases: LivingBudgetMonthBase[]): LivingBudgetSegment[] {
  if (!bases.length) return segments;
  const byMonth = new Map(bases.map((b) => [b.month, b.amount]));
  const out: LivingBudgetSegment[] = [];
  for (const seg of segments) {
    const inside = [...byMonth.keys()].filter((m) => seg.from_month <= m && m <= seg.through_month).sort();
    if (!inside.length) {
      out.push(seg);
      continue;
    }
    let from = seg.from_month;
    for (const m of inside) {
      const before = previousCalendarMonth(m);
      if (from <= before) out.push({ amount: seg.amount, from_month: from, through_month: before });
      out.push({ amount: byMonth.get(m)!, from_month: m, through_month: m });
      from = nextCalendarMonth(m);
    }
    if (from <= seg.through_month) out.push({ amount: seg.amount, from_month: from, through_month: seg.through_month });
  }
  for (const [m, amount] of byMonth) {
    if (!out.some((s) => s.from_month <= m && m <= s.through_month)) out.push({ amount, from_month: m, through_month: m });
  }
  return out.sort((a, b) => a.from_month.localeCompare(b.from_month));
}

/** Previous calendar month as YYYY-MM. */
export function previousCalendarMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  let month = m - 1;
  let year = y;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function livingBudgetForPreviousMonth(
  ym: string,
  segments: LivingBudgetSegment[],
  monthTopups: LivingBudgetMonthTopup[] = [],
  configuredCharges: ConfiguredCharge[] = [],
): number | null {
  return livingBudgetForMonth(previousCalendarMonth(ym), segments, monthTopups, configuredCharges);
}

function segmentsOverlap(a: LivingBudgetSegment, b: LivingBudgetSegment): boolean {
  return a.from_month <= b.through_month && b.from_month <= a.through_month;
}

export function validateLivingBudgetSegments(segments: LivingBudgetSegment[]): string | null {
  if (!segments.length) return "Add at least one budget period before saving.";
  for (const raw of segments) {
    const segment = normalizeLivingBudgetSegment(raw);
    if (!Number.isFinite(segment.amount) || segment.amount <= 0) {
      return "Each budget amount must be a positive number.";
    }
    if (!/^\d{4}-\d{2}$/.test(segment.from_month) || !/^\d{4}-\d{2}$/.test(segment.through_month)) {
      return "Each budget period needs valid from/through months.";
    }
    if (segment.from_month > segment.through_month) {
      return "Budget start month must be on or before the end month.";
    }
  }
  const sorted = segments.map(normalizeLivingBudgetSegment).sort((a, b) => a.from_month.localeCompare(b.from_month));
  for (let i = 1; i < sorted.length; i += 1) {
    if (segmentsOverlap(sorted[i - 1], sorted[i])) {
      return "Budget periods must not overlap — adjust the dates.";
    }
  }
  return null;
}

export function validateLivingBudgetMonthTopups(
  monthTopups: LivingBudgetMonthTopup[],
  segments: LivingBudgetSegment[],
): string | null {
  for (const raw of monthTopups) {
    const topup = normalizeLivingBudgetMonthTopup(raw);
    if (!/^\d{4}-\d{2}$/.test(topup.month)) {
      return "Each monthly extra needs a valid month (YYYY-MM).";
    }
    if (!Number.isFinite(topup.extra) || topup.extra <= 0) {
      return "Each monthly extra must be a positive amount.";
    }
    if (livingBudgetBaseForMonth(topup.month, segments) === null) {
      return `No base budget covers ${ymToLabel(topup.month)} — add a period first.`;
    }
  }
  return null;
}

export function validateLivingBudget(
  segments: LivingBudgetSegment[],
  monthTopups: LivingBudgetMonthTopup[] = [],
): string | null {
  const segmentError = validateLivingBudgetSegments(segments);
  if (segmentError) return segmentError;
  return validateLivingBudgetMonthTopups(monthTopups, segments);
}

export function serializeLivingBudgetSegments(segments: LivingBudgetSegment[]): string {
  return JSON.stringify(
    segments.map(normalizeLivingBudgetSegment).sort((a, b) => a.from_month.localeCompare(b.from_month)),
  );
}

export function serializeLivingBudget(data: LivingBudgetData): string {
  return JSON.stringify({
    segments: data.segments.map(normalizeLivingBudgetSegment).sort((a, b) => a.from_month.localeCompare(b.from_month)),
    month_topups: (data.month_topups || [])
      .map(normalizeLivingBudgetMonthTopup)
      .sort((a, b) => a.month.localeCompare(b.month)),
    month_estimates: (data.month_estimates || []).slice().sort((a, b) => a.month.localeCompare(b.month)),
  });
}

export function cycleMonthYmForOverview(
  selectedMonth: string | null,
  report: SpendingReport | null,
  cycleDay: number,
): string {
  if (selectedMonth && isCycleMonthKey(selectedMonth)) {
    return cycleStartFromMonthKey(selectedMonth).slice(0, 7);
  }
  const billing = report?.metadata?.billing_date as string | undefined;
  if (billing) {
    return cycleStartForStatementBilling(billing, cycleDay).slice(0, 7);
  }
  return currentYearMonth();
}

export function resolvedLivingBudget(
  selectedMonth: string | null,
  report: SpendingReport | null,
  segments: LivingBudgetSegment[],
  cycleDay: number,
  monthTopups: LivingBudgetMonthTopup[] = [],
  configuredCharges: ConfiguredCharge[] = [],
): number | null {
  const ym = cycleMonthYmForOverview(selectedMonth, report, cycleDay);
  return livingBudgetForMonth(ym, segments, monthTopups, configuredCharges);
}

export function livingBudgetTimelineSummary(
  segments: LivingBudgetSegment[],
  configuredCharges: ConfiguredCharge[] = [],
): string {
  return [...segments]
    .sort((a, b) => a.from_month.localeCompare(b.from_month))
    .map((s) => {
      const ym = s.from_month;
      const cibus = cibusAllowanceForMonth(ym, configuredCharges);
      const additions = capAdditionsForMonth(ym, configuredCharges);
      const extras: string[] = [];
      if (cibus > 0) extras.push(CIBUS_LABEL);
      if (additions > cibus) extras.push(FATHER_INJECTION_LABEL.toLowerCase());
      const extraLabel = extras.length ? ` incl. ${extras.join(" + ")}` : "";
      const total = roundMoney(s.amount + additions);
      return `₪${total.toLocaleString()}${extraLabel} (${monthRangeLabel(s.from_month, s.through_month)})`;
    })
    .join(" → ");
}

export function livingBudgetStatusLabel(segment: LivingBudgetSegment): string {
  const s = segmentStatus(segment.from_month, segment.through_month);
  if (s === "ended") return "Ended";
  if (s === "upcoming") return "Starts " + ymToLabel(segment.from_month);
  if (isOngoingThrough(segment.through_month)) return "Active · ongoing";
  return "Active · ends " + ymToLabel(segment.through_month);
}

export {
  currentYearMonth,
  isOngoingThrough,
  monthRangeLabel,
  ONGOING_THROUGH_MONTH,
  segmentStatus,
  ymToLabel,
};
