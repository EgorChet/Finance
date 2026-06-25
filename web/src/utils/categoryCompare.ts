import type { Transaction } from "../types";
import {
  HOME_LIVING,
  homeSubsectionKey,
  rollupCategory,
} from "../categories";
import { roundMoney } from "./format";
import { getBillingCycle, loadPaceAvgCycles, type PaceAvgCycles } from "./pace";
import { subscriptionSubsectionLabel } from "./subscriptionSections";

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
  usual: number | null;
  delta: number | null;
  cyclesUsed: number;
  dayIndex: number;
  cycleLength: number;
}

export type CategoryCompareTone = "high" | "low" | "neutral" | "unknown";

/** Ignore small noise — same order of magnitude as pace deltas. */
export const CATEGORY_COMPARE_NEUTRAL_THRESHOLD = 30;

export function categoryCompareTone(
  delta: number | null,
  usual: number | null,
): CategoryCompareTone {
  if (delta == null || usual == null) return "unknown";
  if (Math.abs(delta) < CATEGORY_COMPARE_NEUTRAL_THRESHOLD) return "neutral";
  return delta > 0 ? "high" : "low";
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

export interface CategoryCompareContext {
  dayIndex: number;
  cycleLength: number;
  currentStart: Date;
  historical: { start: Date; txs: Transaction[] }[];
}

export function buildCategoryCompareContext(
  allTransactions: Transaction[],
  options: {
    cycleDay: number;
    cycleStart: string;
    referenceDate: Date;
    avgCycles?: PaceAvgCycles;
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
  const cycle = getBillingCycle(ref, options.cycleDay);
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

  const historical: { start: Date; txs: Transaction[] }[] = [];
  for (const [key, bucket] of byCycle.entries()) {
    if (key === currentKey) continue;
    if (bucket.end >= ref) continue;
    historical.push({ start: bucket.start, txs: bucket.txs });
  }
  historical.sort((a, b) => b.start.getTime() - a.start.getTime());

  return {
    dayIndex: cycle.dayIndex,
    cycleLength: cycle.cycleLength,
    currentStart,
    historical: historical.slice(0, targetCycles),
  };
}

export function computeCategoryCompareFromContext(
  ctx: CategoryCompareContext,
  currentCycleTransactions: Transaction[],
  scope: CategoryCompareScope,
  label: string,
): CategoryCompareResult {
  const usualSamples = ctx.historical.map((row) =>
    sumScopeThroughDay(row.txs, row.start, ctx.dayIndex, scope),
  );
  const cyclesUsed = usualSamples.length;
  const usual =
    cyclesUsed > 0 ? roundMoney(usualSamples.reduce((s, v) => s + v, 0) / cyclesUsed) : null;

  const current = sumScopeThroughDay(
    currentCycleTransactions,
    ctx.currentStart,
    ctx.dayIndex,
    scope,
  );
  const delta = usual != null ? roundMoney(current - usual) : null;

  return {
    label,
    current,
    usual,
    delta,
    cyclesUsed,
    dayIndex: ctx.dayIndex,
    cycleLength: ctx.cycleLength,
  };
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

function sumScopeThroughDay(
  transactions: Transaction[],
  cycleStart: Date,
  dayIndex: number,
  scope: CategoryCompareScope,
): number {
  if (dayIndex <= 0) return 0;
  let sum = 0;
  for (const tx of transactions) {
    if (!transactionMatchesScope(tx, scope)) continue;
    const d = parseIsoDate(tx.date);
    const day = daysBetween(cycleStart, d) + 1;
    if (day > dayIndex) continue;
    sum += tx.charge_amount;
  }
  return roundMoney(sum);
}

export function computeCategoryCompare(
  allTransactions: Transaction[],
  currentCycleTransactions: Transaction[],
  options: {
    scope: CategoryCompareScope;
    label: string;
    cycleDay: number;
    cycleStart: string;
    referenceDate: Date;
    avgCycles?: PaceAvgCycles;
  },
): CategoryCompareResult {
  const ref = new Date(
    options.referenceDate.getFullYear(),
    options.referenceDate.getMonth(),
    options.referenceDate.getDate(),
  );
  const cycle = getBillingCycle(ref, options.cycleDay);
  const ctx = buildCategoryCompareContext(allTransactions, options);
  if (!ctx) {
    return {
      label: options.label,
      current: sumScopeThroughDay(
        currentCycleTransactions,
        parseIsoDate(options.cycleStart),
        cycle.dayIndex,
        options.scope,
      ),
      usual: null,
      delta: null,
      cyclesUsed: 0,
      dayIndex: cycle.dayIndex,
      cycleLength: cycle.cycleLength,
    };
  }
  return computeCategoryCompareFromContext(
    ctx,
    currentCycleTransactions,
    options.scope,
    options.label,
  );
}
