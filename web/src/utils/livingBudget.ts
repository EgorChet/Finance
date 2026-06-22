import type { SpendingReport } from "../types";
import { roundMoney } from "./format";

/** Employer Cibus card — loaded monthly, spent as groceries; not on the Visa export. */
export const CIBUS_MONTHLY_ALLOWANCE = 600;
import {
  currentYearMonth,
  isOngoingThrough,
  monthRangeLabel,
  ONGOING_THROUGH_MONTH,
  segmentStatus,
  ymToLabel,
} from "./fixedCharges";
import { cycleStartForStatementBilling, cycleStartFromMonthKey, isCycleMonthKey } from "./pace";

export interface LivingBudgetSegment {
  amount: number;
  from_month: string;
  through_month: string;
}

/** One-off extra cap for a single calendar month (added on top of the active period). */
export interface LivingBudgetMonthTopup {
  month: string;
  extra: number;
  note?: string;
}

export interface LivingBudgetData {
  segments: LivingBudgetSegment[];
  month_topups?: LivingBudgetMonthTopup[];
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

export function livingBudgetMonthTopupStableKey(topup: LivingBudgetMonthTopup): string {
  return topup.month;
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
): number | null {
  const match = segments.find((s) => s.from_month <= ym && ym <= s.through_month);
  if (!match) return null;
  return roundMoney(match.amount + CIBUS_MONTHLY_ALLOWANCE + monthTopupExtraForMonth(ym, monthTopups));
}

export function livingBudgetBaseForMonth(ym: string, segments: LivingBudgetSegment[]): number | null {
  const match = segments.find((s) => s.from_month <= ym && ym <= s.through_month);
  if (!match) return null;
  return roundMoney(match.amount + CIBUS_MONTHLY_ALLOWANCE);
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
  const seen = new Set<string>();
  for (const raw of monthTopups) {
    const topup = normalizeLivingBudgetMonthTopup(raw);
    if (!/^\d{4}-\d{2}$/.test(topup.month)) {
      return "Each monthly extra needs a valid month (YYYY-MM).";
    }
    if (!Number.isFinite(topup.extra) || topup.extra <= 0) {
      return "Each monthly extra must be a positive amount.";
    }
    if (seen.has(topup.month)) {
      return `Only one extra amount per month — merge duplicates for ${ymToLabel(topup.month)}.`;
    }
    seen.add(topup.month);
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
): number | null {
  const ym = cycleMonthYmForOverview(selectedMonth, report, cycleDay);
  return livingBudgetForMonth(ym, segments, monthTopups);
}

export function livingBudgetTimelineSummary(segments: LivingBudgetSegment[]): string {
  return [...segments]
    .sort((a, b) => a.from_month.localeCompare(b.from_month))
    .map((s) => {
      const total = roundMoney(s.amount + CIBUS_MONTHLY_ALLOWANCE);
      return `₪${total.toLocaleString()} incl. Cibus (${monthRangeLabel(s.from_month, s.through_month)})`;
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
