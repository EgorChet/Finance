import type { SpendingReport } from "../types";
import { roundMoney } from "./format";
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

export const DEFAULT_LIVING_BUDGET = 12000;

/** @deprecated Use resolved budget from living budget segments. */
export const MONTHLY_DISCRETIONARY_BUDGET = DEFAULT_LIVING_BUDGET;

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

export function livingBudgetForMonth(ym: string, segments: LivingBudgetSegment[]): number {
  const match = segments.find((s) => s.from_month <= ym && ym <= s.through_month);
  return match?.amount ?? DEFAULT_LIVING_BUDGET;
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
): number {
  const ym = cycleMonthYmForOverview(selectedMonth, report, cycleDay);
  return livingBudgetForMonth(ym, segments);
}

export function livingBudgetTimelineSummary(segments: LivingBudgetSegment[]): string {
  return [...segments]
    .sort((a, b) => a.from_month.localeCompare(b.from_month))
    .map((s) => `₪${s.amount.toLocaleString()} (${monthRangeLabel(s.from_month, s.through_month)})`)
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
