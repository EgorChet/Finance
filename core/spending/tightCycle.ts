/**
 * "Tight cycle": after bills there's clearly less left than you usually spend on everyday
 * things. Instead of only a red pill, say the gap in shekels and give a practical way back:
 * stay-home days (groceries and essentials only), which categories to pause, or a top-up.
 * All numbers come from your own recent cycles (same cycles the spending curve learns from).
 */
import type { Transaction } from "../types.js";
import { effectiveSpend } from "../utils/transaction.js";
import { roundMoney } from "../utils/format.js";
import { getBillingCycle } from "./pace.js";

/** Categories you can pause for a while; everything else (groceries, fuel, health…) is essential. */
export const PAUSABLE_CATEGORIES = new Set([
  "Eating out",
  "Coffee",
  "Clothes",
  "Leisure & Entertainment",
  "Tourism",
  "Hookah",
  "Home & Living",
  "Home & Furniture",
  "Home & Electronics",
  "Electronics & computers",
  "Beauty & Personal Care",
  "Miscellaneous",
  "Other",
]);

/** Tight when the usual need for the days left beats the free money by this much (and ≥ ₪300). */
const TIGHT_SHARE = 0.1;
const TIGHT_MIN = 300;

export interface TightCycleAdvice {
  /** Usual everyday spending for a whole cycle (median of recent cycles). */
  usualNeed: number;
  /** What you'd usually still spend in the days left. */
  needAhead: number;
  freeLeft: number;
  shortBy: number;
  /** Usual spending on pausable things per day. */
  pausablePerDay: number;
  /** Stay-home days (essentials only) that close the gap; null when even every day left isn't enough. */
  homeDays: number | null;
  /** What staying home every day left would save, for the "not enough" case. */
  homeAllDaysSaving: number;
  /** Biggest pausable categories, with what they'd usually cost in the days left. */
  cuts: { category: string; usualAhead: number }[];
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function parseIsoDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function tightCycleAdvice(
  history: Transaction[],
  opts: {
    cycleStart: string;
    cycleDay: number;
    isFlexible: (tx: Transaction) => boolean;
    flexLeft: number;
    daysLeft: number;
    cycleLength: number;
    /** Share of a cycle's everyday spending usually gone by yesterday (from the learned curve). */
    shareSoFar: number;
    maxCycles: number;
  },
): TightCycleAdvice | null {
  if (opts.daysLeft <= 0) return null;
  const start = parseIsoDate(opts.cycleStart);
  const buckets = new Map<number, { total: number; byCat: Map<string, number> }>();
  for (const tx of history) {
    if (!opts.isFlexible(tx)) continue;
    const amt = effectiveSpend(tx);
    if (!(amt > 0)) continue;
    const cycle = getBillingCycle(parseIsoDate(tx.date), opts.cycleDay);
    if (cycle.start >= start) continue;
    const key = cycle.start.getTime();
    let b = buckets.get(key);
    if (!b) {
      b = { total: 0, byCat: new Map() };
      buckets.set(key, b);
    }
    b.total += amt;
    const cat = tx.category_en || "Uncategorized";
    b.byCat.set(cat, (b.byCat.get(cat) ?? 0) + amt);
  }
  // Same rule as the curve: skip cycles the statements only half cover; use the recent ones.
  const all = [...buckets.entries()].map(([k, b]) => ({ k, ...b }));
  const typical = median(all.map((b) => b.total));
  const recent = all
    .filter((b) => b.total >= typical * 0.5)
    .sort((a, b) => b.k - a.k)
    .slice(0, opts.maxCycles);
  if (recent.length < 3) return null;

  const usualNeed = median(recent.map((b) => b.total));
  const needAhead = usualNeed * (1 - Math.min(1, Math.max(0, opts.shareSoFar)));
  const freeLeft = Math.max(0, opts.flexLeft);
  const shortBy = needAhead - freeLeft;
  if (shortBy < Math.max(TIGHT_MIN, needAhead * TIGHT_SHARE)) return null;

  const cats = new Set<string>();
  for (const b of recent) for (const c of b.byCat.keys()) if (PAUSABLE_CATEGORIES.has(c)) cats.add(c);
  const usualByCat = [...cats].map((c) => ({ category: c, usual: median(recent.map((b) => b.byCat.get(c) ?? 0)) }));
  const pausablePerCycle = usualByCat.reduce((s, c) => s + c.usual, 0);
  const pausablePerDay = pausablePerCycle / opts.cycleLength;
  const daysShare = opts.daysLeft / opts.cycleLength;
  const homeDaysNeeded = pausablePerDay > 0 ? Math.ceil(shortBy / pausablePerDay) : Infinity;

  return {
    usualNeed: roundMoney(usualNeed),
    needAhead: roundMoney(needAhead),
    freeLeft: roundMoney(freeLeft),
    shortBy: roundMoney(shortBy),
    pausablePerDay: roundMoney(pausablePerDay),
    homeDays: homeDaysNeeded <= opts.daysLeft ? homeDaysNeeded : null,
    homeAllDaysSaving: roundMoney(pausablePerDay * opts.daysLeft),
    cuts: usualByCat
      .map((c) => ({ category: c.category, usualAhead: roundMoney(c.usual * daysShare) }))
      .filter((c) => c.usualAhead >= 100)
      .sort((a, b) => b.usualAhead - a.usualAhead)
      .slice(0, 3),
  };
}
