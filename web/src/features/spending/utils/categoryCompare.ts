import { dateTag, t } from "@/shared/i18n";
import type { Transaction } from "@/shared/types";
import {
  HOME_LIVING,
  homeSubsectionKey,
  rollupCategory,
} from "@/shared/categories";
import { formatIlsWhole, roundMoney } from "@/shared/utils/format";
import { effectiveSpend } from "@/shared/utils/transaction";
import { isFlexibleTransaction } from "@/features/spending/utils/budgetPlan";
import { billingCycleProgress, getBillingCycle, loadPaceAvgCycles, type PaceAvgCycles } from "@/features/spending/utils/pace";
import { subscriptionSubsectionLabel } from "@/features/spending/utils/subscriptionSections";

function parseIsoDate(dateStr: string): Date {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "25 Aug" for day `day` of a cycle starting `start`. */
function shortDay(start: Date, day: number): string {
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + day - 1);
  return d.toLocaleDateString(dateTag(), { day: "numeric", month: "short" });
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

export type CategoryCompareScope =
  | { kind: "rollup"; category: string }
  | { kind: "homeSub"; category: string }
  | { kind: "subscriptionSub"; name: string }
  | { kind: "raw"; category: string }
  | { kind: "otherBucket"; categories: string[] };

export interface CategoryCompareResult {
  label: string;
  current: number;
  /** Most recent previous cycle / statement, at the same point. */
  last: number | null;
  /** Average of recent previous cycles / statements, at the same point. */
  usual: number | null;
  /** current − usual. */
  delta: number | null;
  samplesUsed: number;
}

export type CategoryCompareTone = "high" | "low" | "neutral" | "unknown" | "new";

/** Differences under ₪50 or 15% of usual are noise. */
export const CATEGORY_COMPARE_MIN_ABS = 50;
export const CATEGORY_COMPARE_MIN_REL = 0.15;

export function categoryCompareTone(result: CategoryCompareResult | undefined | null): CategoryCompareTone {
  if (!result || result.usual == null || result.delta == null) return "unknown";
  if (result.usual < 1 && result.current >= CATEGORY_COMPARE_MIN_ABS) return "new";
  const threshold = Math.max(CATEGORY_COMPARE_MIN_ABS, result.usual * CATEGORY_COMPARE_MIN_REL);
  if (Math.abs(result.delta) < threshold) return "neutral";
  return result.delta > 0 ? "high" : "low";
}

/** One short line for a category row: "₪320 more than usual", "About usual", "New". */
export function categoryCompareLine(result: CategoryCompareResult | undefined | null): string {
  const tone = categoryCompareTone(result);
  if (!result || tone === "unknown") return "";
  if (tone === "new") return t("Not usual for you");
  if (tone === "neutral") return t("About usual");
  const abs = formatIlsWhole(Math.abs(result.delta!));
  return tone === "high" ? t("{amount} more than usual", { amount: abs }) : t("{amount} less than usual", { amount: abs });
}

export function scopeKey(scope: CategoryCompareScope): string {
  switch (scope.kind) {
    case "rollup":
      return `r:${scope.category}`;
    case "homeSub":
      return `h:${scope.category}`;
    case "subscriptionSub":
      return `s:${scope.name}`;
    case "raw":
      return `raw:${scope.category}`;
    case "otherBucket":
      return `o:${scope.categories.join("|")}`;
  }
}

/**
 * What a category is compared against.
 * - cycle: open billing cycle — previous cycles summed through the same day (fair mid-cycle).
 * - statement: closed month — previous statements in full.
 */
export interface CategoryCompareContext {
  mode: "cycle" | "statement";
  /** Day of the cycle being compared (cycle mode). */
  dayIndex: number | null;
  currentStart: Date | null;
  /** Most recent first. */
  historical: { start: Date | null; txs: Transaction[]; label: string }[];
  /** "by day 15" / "" — appended to "usual" / "last" labels. */
  pointLabel: string;
  /** "Last cycle" / "Sep 2026". */
  lastLabel: string;
}

export function buildCategoryCompareContext(
  allTransactions: Transaction[],
  options: {
    cycleDay: number;
    cycleStart: string;
    referenceDate: Date;
    avgCycles?: PaceAvgCycles;
    /** Compare through this day instead of today — the day the card data is from (same as the budget card). */
    throughDay?: number | null;
  },
): CategoryCompareContext | null {
  if (!allTransactions.length) return null;

  const avgCycles = options.avgCycles ?? loadPaceAvgCycles();
  const targetCycles = avgCycles > 0 ? avgCycles : 3;
  const ref = new Date(
    options.referenceDate.getFullYear(),
    options.referenceDate.getMonth(),
    options.referenceDate.getDate(),
  );
  const today = billingCycleProgress(options.cycleStart, options.cycleDay, ref).dayIndex;
  const dayIndex =
    options.throughDay != null && options.throughDay >= 1 ? Math.min(today, options.throughDay) : today;
  const currentStart = parseIsoDate(options.cycleStart);
  const currentKey = isoDate(currentStart);

  const byCycle = new Map<string, { start: Date; end: Date; txs: Transaction[] }>();
  for (const tx of allTransactions) {
    const txCycle = getBillingCycle(parseIsoDate(tx.date), options.cycleDay);
    const key = isoDate(txCycle.start);
    let bucket = byCycle.get(key);
    if (!bucket) {
      bucket = { start: txCycle.start, end: txCycle.end, txs: [] };
      byCycle.set(key, bucket);
    }
    bucket.txs.push(tx);
  }

  const historical: CategoryCompareContext["historical"] = [];
  for (const [key, bucket] of byCycle.entries()) {
    if (key >= currentKey) continue;
    if (bucket.end >= ref) continue;
    historical.push({ start: bucket.start, txs: bucket.txs, label: key });
  }
  historical.sort((a, b) => b.start!.getTime() - a.start!.getTime());

  return {
    mode: "cycle",
    dayIndex,
    currentStart,
    historical: historical.slice(0, targetCycles),
    pointLabel: dayIndex < today ? t("by {date}, the last sync", { date: shortDay(currentStart, dayIndex) }) : t("by day {n}", { n: dayIndex }),
    lastLabel: "Last cycle",
  };
}

/** Closed statement month vs the statements before it (most recent first). */
export function buildStatementCompareContext(
  previous: { label: string; txs: Transaction[] }[],
): CategoryCompareContext | null {
  if (!previous.length) return null;
  return {
    mode: "statement",
    dayIndex: null,
    currentStart: null,
    historical: previous.map((p) => ({ start: null, txs: p.txs, label: p.label })),
    pointLabel: "",
    lastLabel: previous[0].label,
  };
}

export function computeCategoryCompareFromContext(
  ctx: CategoryCompareContext,
  currentTransactions: Transaction[],
  scope: CategoryCompareScope,
  label: string,
): CategoryCompareResult {
  const samples = ctx.historical.map((row) => sumScope(row.txs, row.start, ctx.dayIndex, scope));
  const samplesUsed = samples.length;
  // Median, not mean: one freak month (a yearly purchase) must not redefine "usual".
  const usual = samplesUsed > 0 ? roundMoney(median(samples)) : null;
  const current = sumScope(currentTransactions, ctx.currentStart, ctx.dayIndex, scope);
  // Mid-cycle only everyday spending is compared; a category that's all bills (arnona, Bezeq…)
  // has nothing to compare — its bills just land on different days.
  if (ctx.mode === "cycle" && current < 1 && (usual ?? 0) < 1) {
    return { label, current, last: null, usual: null, delta: null, samplesUsed };
  }
  return {
    label,
    current,
    last: samplesUsed > 0 ? samples[0] : null,
    usual,
    delta: usual != null ? roundMoney(current - usual) : null,
    samplesUsed,
  };
}

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function transactionMatchesScope(tx: Transaction, scope: CategoryCompareScope): boolean {
  switch (scope.kind) {
    case "rollup":
      return rollupCategory(tx.category_en) === scope.category;
    case "homeSub":
      return (
        rollupCategory(tx.category_en) === HOME_LIVING &&
        homeSubsectionKey(tx.category_en) === scope.category
      );
    case "subscriptionSub":
      return (
        rollupCategory(tx.category_en) === "Subscriptions" &&
        subscriptionSubsectionLabel(tx) === scope.name
      );
    case "raw":
      return tx.category_en === scope.category;
    case "otherBucket":
      return scope.categories.includes(tx.category_en);
  }
}

/** Sum a scope; in cycle mode only charges through `dayIndex` of the cycle starting at `start`. */
function sumScope(
  transactions: Transaction[],
  start: Date | null,
  dayIndex: number | null,
  scope: CategoryCompareScope,
): number {
  let sum = 0;
  for (const tx of transactions) {
    if (!transactionMatchesScope(tx, scope)) continue;
    if (start && dayIndex != null) {
      // Same rule as the budget card: bills, subscriptions, rent, loans, installments and one-time
      // charges are fixed — their timing isn't spending more or less.
      if (!isFlexibleTransaction(tx, isoDate(start))) continue;
      const day = daysBetween(start, parseIsoDate(tx.date)) + 1;
      if (day > dayIndex) continue;
    }
    sum += effectiveSpend(tx);
  }
  return roundMoney(sum);
}
