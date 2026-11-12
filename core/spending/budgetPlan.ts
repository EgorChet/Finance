/**
 * "Am I on track?" — one rule, anchored to the living budget, shaped by your own habits.
 *
 * 1. Budget − committed charges = flexible money for the cycle. Committed = what you
 *    can't steer day to day: rent, car loan, Dev Institute, vaad bayit (reserved until it
 *    posts), standing orders (utilities, insurance, subscriptions), installment payments,
 *    charges dated before the cycle, and arnona. On real statements these were 1–6k a
 *    month and posted early, which used to paint whole months red.
 * 2. Spending curve: from your last completed cycles the app learns what share of the
 *    flexible spending is usually gone by each point of the cycle (e.g. 45% by day 10).
 *    Without enough history it falls back to an even split.
 * 3. Plan through yesterday = flexible money × curve. Buffer = plan − flexible spent.
 * 4. Colour: flexible money left vs what the plan still expects you to need.
 *      green  ≥ 90%  — keep going as usual
 *      yellow 75–90% — trim a little
 *      red    < 75%, or the money is already gone
 */
import type { Transaction } from "../types.js";
import {
  budgetSpendBreakdown,
  hasVaadBayitCharge,
  isCarLoanTransaction,
  isDevInstituteTransaction,
  isRentTransaction,
  isVaadBayitTransaction,
  VAAD_BAYIT_RESERVE,
} from "../household/householdBudget.js";
import { effectiveSpend } from "../utils/transaction.js";
import { roundMoney } from "../utils/format.js";
import { billingCycleProgress, getBillingCycle } from "./pace.js";
import { configuredChargesForCycle, type ConfiguredCharge } from "../household/fixedCharges.js";

export type BudgetPlanTone = "good" | "warn" | "bad";

export const PLAN_GREEN_RATIO = 0.9;
export const PLAN_RED_RATIO = 0.75;

/** Completed cycles used to learn the spending curve. */
export const CURVE_CYCLES = 6;
/** Fewer than this → even split. */
export const CURVE_MIN_CYCLES = 3;
/** Learned curve is blended with an even split so one odd month can't bend it too far. */
export const CURVE_LEARNED_WEIGHT = 0.7;
const CURVE_POINTS = 30;

/**
 * Cumulative share of a cycle's flexible spending, sampled at CURVE_POINTS + 1 evenly
 * spaced points of the cycle (0 = start, 1 = end). Starts at 0, ends at 1, never falls.
 */
export interface SpendingCurve {
  points: number[];
  cyclesUsed: number;
  learned: boolean;
}

export interface BudgetPlan {
  tone: BudgetPlanTone;
  /** "On track", "Slow down a little", "Slow down", "Over budget", "Finished within budget". */
  status: string;
  budget: number;
  /** Committed charges posted so far + vaad reserve. */
  bills: number;
  /** Committed charges by kind, for the details sheet (vaad reserve included). */
  committedRows: { kind: CommittedKind; label: string; amount: number; oneTimeDate?: string }[];
  vaadReserve: number;
  /** Charges added under Budget that are due later this cycle (set aside, not charged yet). */
  upcomingReserve: number;
  flexBudget: number;
  flexSpent: number;
  flexLeft: number;
  moneyLeft: number;
  spentOnCap: number;
  dayIndex: number;
  cycleLength: number;
  /** Days left including today. */
  daysLeft: number;
  /** Average plan per day over the whole cycle (flexBudget ÷ days). */
  planPerDay: number;
  /** What the plan expects you to spend per day for the rest of the cycle. */
  planPerDayAhead: number;
  plannedSoFar: number;
  /** plannedSoFar − flexSpent. Positive = under plan. */
  buffer: number;
  /** flexLeft ÷ daysLeft. */
  perDayLeft: number;
  allowanceRatio: number;
  curve: SpendingCurve;
  /** Cumulative flexible spend at the end of each day so far (index 0 = day 1). */
  actualByDay: number[];
  /** Planned cumulative flexible spend at the end of each day of the cycle. */
  planByDay: number[];
  /**
   * The plain comparison: what you spent by this day of the cycle, now and in each past cycle
   * (everyday = what the card paces; total = everything on the card incl. bills). Most recent first.
   */
  byThisDay: {
    everyday: number;
    total: number;
    past: { cycleStart: string; label: string; everyday: number; total: number }[];
    /** 1 = the most of all listed cycles. */
    everydayRank: number;
    totalRank: number;
  } | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Spending through day `dayIndex` of each past cycle, straight from the transactions — no
 * scaling, no curve. Cycles the loaded statements only half cover are skipped.
 */
export function pastCyclesByDay(
  history: Transaction[],
  cycleStart: string,
  cycleDay: number,
  dayIndex: number,
): { cycleStart: string; label: string; everyday: number; total: number }[] {
  const start = parseIsoDate(cycleStart);
  const buckets = new Map<number, { start: Date; everyday: number; total: number; full: number }>();
  for (const tx of history) {
    const amt = effectiveSpend(tx);
    if (!(amt > 0)) continue;
    const d = parseIsoDate(tx.date);
    const cycle = getBillingCycle(d, cycleDay);
    if (cycle.start >= start) continue;
    const key = cycle.start.getTime();
    let b = buckets.get(key);
    if (!b) {
      b = { start: cycle.start, everyday: 0, total: 0, full: 0 };
      buckets.set(key, b);
    }
    b.full += amt;
    const day = daysBetween(cycle.start, d) + 1;
    if (day > dayIndex) continue;
    b.total += amt;
    if (isFlexibleTransaction(tx)) b.everyday += amt;
  }
  const all = [...buckets.values()];
  const fulls = all.map((b) => b.full).sort((a, b) => a - b);
  const medianFull = fulls.length ? fulls[Math.floor(fulls.length / 2)] : 0;
  return all
    .filter((b) => b.full >= medianFull * 0.5)
    .sort((a, b) => b.start.getTime() - a.start.getTime())
    .slice(0, 12)
    .map((b) => {
      const y = b.start.getFullYear();
      const m = String(b.start.getMonth() + 1).padStart(2, "0");
      const dd = String(b.start.getDate()).padStart(2, "0");
      return {
        cycleStart: `${y}-${m}-${dd}`,
        label: `${MONTHS[b.start.getMonth()]} ${y}`,
        everyday: roundMoney(b.everyday),
        total: roundMoney(b.total),
      };
    });
}

function parseIsoDate(dateStr: string): Date {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

const STANDING_ORDER = "הוראת קבע";
const INSTALLMENT_TYPES = new Set(["תשלומים", "רכישה בקרדיט"]);
const ARNONA_RE = /עיריית|ארנונה|arnona|municipality/i;

export type CommittedKind =
  | "rent"
  | "carLoan"
  | "devInstitute"
  | "vaad"
  | "configured"
  | "upcoming"
  | "standingOrder"
  | "installment"
  | "arnona"
  | "earlier";

export const COMMITTED_LABELS: Record<CommittedKind, string> = {
  rent: "Flat rent",
  carLoan: "Car loan",
  devInstitute: "Dev Institute",
  vaad: "Vaad bayit",
  configured: "Charges you added",
  upcoming: "Coming up this cycle",
  standingOrder: "Standing orders",
  installment: "Installments",
  arnona: "Arnona",
  earlier: "Charges from earlier dates",
};

export function isInstallmentTransaction(tx: Transaction): boolean {
  return INSTALLMENT_TYPES.has(tx.transaction_type_he ?? "");
}

/** Why a charge is committed (not day-to-day spending), or null when it's flexible. */
export function committedKind(tx: Transaction, cycleStart?: string): CommittedKind | null {
  if (isRentTransaction(tx)) return "rent";
  if (isCarLoanTransaction(tx)) return "carLoan";
  if (isDevInstituteTransaction(tx)) return "devInstitute";
  if (isVaadBayitTransaction(tx)) return "vaad";
  // Charges entered under Budget (one-time or monthly) are known in advance, not day-to-day spending.
  if (tx.notes?.startsWith("fixed_charge:")) return "configured";
  if (isInstallmentTransaction(tx)) return "installment";
  if (tx.transaction_type_he === STANDING_ORDER) return "standingOrder";
  if (ARNONA_RE.test(`${tx.merchant_he ?? ""} ${tx.merchant_en ?? ""}`)) return "arnona";
  if (cycleStart && tx.date.slice(0, 10) < cycleStart && !tx.notes?.startsWith("fixed_charge:")) return "earlier";
  return null;
}

/** Day-to-day spending: everything on the cap that isn't committed. */
export function isFlexibleTransaction(tx: Transaction, cycleStart?: string): boolean {
  return committedKind(tx, cycleStart) === null;
}

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function evenCurve(): SpendingCurve {
  return {
    points: Array.from({ length: CURVE_POINTS + 1 }, (_, i) => i / CURVE_POINTS),
    cyclesUsed: 0,
    learned: false,
  };
}

/** Share of flexible spending usually gone by fraction `t` (0–1) of the cycle. */
export function curveAt(curve: SpendingCurve, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const x = t * CURVE_POINTS;
  const i = Math.floor(x);
  const f = x - i;
  return curve.points[i] + (curve.points[i + 1] - curve.points[i]) * f;
}

/**
 * Learn the curve from completed cycles before `cycleStart`.
 * A purchase on day d of an L-day cycle lands at fraction d / L.
 */
export function learnSpendingCurve(
  history: Transaction[],
  cycleStart: string,
  cycleDay: number,
): SpendingCurve {
  const start = parseIsoDate(cycleStart);
  const buckets = new Map<number, { start: Date; length: number; byDay: number[] }>();
  for (const tx of history) {
    if (!isFlexibleTransaction(tx)) continue;
    const amt = effectiveSpend(tx);
    if (!(amt > 0)) continue;
    const d = parseIsoDate(tx.date);
    const cycle = getBillingCycle(d, cycleDay);
    if (cycle.start >= start) continue;
    const key = cycle.start.getTime();
    let b = buckets.get(key);
    if (!b) {
      b = { start: cycle.start, length: cycle.cycleLength, byDay: new Array(cycle.cycleLength).fill(0) };
      buckets.set(key, b);
    }
    const day = Math.min(b.length, Math.max(1, daysBetween(b.start, d) + 1));
    b.byDay[day - 1] += amt;
  }

  // Drop cycles the loaded statements only half cover (much smaller than a typical cycle).
  const withTotals = [...buckets.values()]
    .map((b) => ({ ...b, total: b.byDay.reduce((s, v) => s + v, 0) }))
    .filter((b) => b.total > 0);
  const sortedTotals = withTotals.map((b) => b.total).sort((x, y) => x - y);
  const medianTotal = sortedTotals.length ? sortedTotals[Math.floor(sortedTotals.length / 2)] : 0;
  const recent = withTotals
    .filter((b) => b.total >= medianTotal * 0.5)
    .sort((a, b) => b.start.getTime() - a.start.getTime())
    .slice(0, CURVE_CYCLES);
  if (recent.length < CURVE_MIN_CYCLES) return evenCurve();

  const even = evenCurve().points;
  const samples: number[][] = Array.from({ length: CURVE_POINTS + 1 }, () => []);
  for (const b of recent) {
    const total = b.total;
    const cum: number[] = [0];
    let run = 0;
    for (const v of b.byDay) {
      run += v;
      cum.push(run / total);
    }
    for (let i = 0; i <= CURVE_POINTS; i++) {
      const x = (i / CURVE_POINTS) * b.length;
      const j = Math.floor(x);
      const f = x - j;
      samples[i].push(j >= b.length ? 1 : cum[j] + (cum[j + 1] - cum[j]) * f);
    }
  }
  // Median per point: one cycle with a huge day-1 purchase can't bend the curve.
  const points = samples.map(
    (vals, i) => CURVE_LEARNED_WEIGHT * median(vals) + (1 - CURVE_LEARNED_WEIGHT) * even[i],
  );
  points[0] = 0;
  points[CURVE_POINTS] = 1;
  for (let i = 1; i <= CURVE_POINTS; i++) points[i] = Math.max(points[i], points[i - 1]);
  return { points, cyclesUsed: recent.length, learned: true };
}

export function computeBudgetPlan(
  cycleTransactions: Transaction[],
  budget: number | null,
  cycle: {
    cycleStart: string;
    cycleDay: number;
    referenceDate: Date;
    /** Past transactions to learn the spending curve from; omitted → even split. */
    history?: Transaction[];
    /** Charges entered under Budget; the ones not posted yet this cycle are set aside up front. */
    configuredCharges?: ConfiguredCharge[];
  },
): BudgetPlan | null {
  if (budget == null || budget <= 0) return null;

  const { dayIndex, cycleLength, start, end } = billingCycleProgress(
    cycle.cycleStart,
    cycle.cycleDay,
    cycle.referenceDate,
  );
  const daysLeft = Math.max(0, cycleLength - dayIndex + 1);

  const breakdown = budgetSpendBreakdown(cycleTransactions);
  // Rows keyed by label: charges you added are listed one by one, by name.
  const rows = new Map<string, { kind: CommittedKind; label: string; amount: number; oneTimeDate?: string }>();
  const addRow = (kind: CommittedKind, label: string, amount: number, oneTimeDate?: string) => {
    const cur = rows.get(label) ?? { kind, label, amount: 0, ...(oneTimeDate ? { oneTimeDate } : {}) };
    cur.amount += amount;
    rows.set(label, cur);
  };
  let committedPosted = 0;
  const postedChargeIds = new Set<string>();
  for (const tx of cycleTransactions) {
    const kind = committedKind(tx, start);
    if (tx.notes?.startsWith("fixed_charge:")) postedChargeIds.add(tx.notes.slice("fixed_charge:".length));
    if (!kind) continue;
    const amount = effectiveSpend(tx);
    committedPosted += amount;
    addRow(kind, kind === "configured" ? tx.merchant_en || tx.merchant_he : COMMITTED_LABELS[kind], amount);
  }
  committedPosted = roundMoney(committedPosted);

  // Charges entered under Budget that fall in this cycle but aren't on the list yet (dated later).
  let upcomingReserve = 0;
  for (const charge of configuredChargesForCycle(start, cycle.configuredCharges ?? [], end)) {
    if (postedChargeIds.has(charge.id) || !(charge.amount > 0)) continue;
    upcomingReserve += charge.amount;
    const when = charge.charge_date ? ` (${charge.charge_date.slice(8, 10)}/${charge.charge_date.slice(5, 7)})` : "";
    addRow(
      "upcoming",
      `${charge.name_en}${when}`,
      charge.amount,
      charge.schedule === "once" ? charge.charge_date?.slice(0, 10) : undefined,
    );
  }
  upcomingReserve = roundMoney(upcomingReserve);

  const vaadReserve = hasVaadBayitCharge(cycleTransactions) ? 0 : VAAD_BAYIT_RESERVE;
  if (vaadReserve > 0) addRow("vaad", COMMITTED_LABELS.vaad, vaadReserve);
  const bills = roundMoney(committedPosted + upcomingReserve + vaadReserve);
  const committedRows = [...rows.values()]
    .map((r) => ({ ...r, amount: roundMoney(r.amount) }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const moneyLeft = roundMoney(budget - breakdown.spent);
  const flexBudget = roundMoney(Math.max(0, budget - bills));
  const flexSpent = roundMoney(Math.max(0, breakdown.spent - committedPosted));
  const flexLeft = roundMoney(flexBudget - flexSpent);

  const curve = cycle.history?.length
    ? learnSpendingCurve(cycle.history, start, cycle.cycleDay)
    : evenCurve();
  const planShareAt = (day: number) => curveAt(curve, day / cycleLength);

  const plannedSoFar = roundMoney(flexBudget * planShareAt(dayIndex - 1));
  const expectedAhead = roundMoney(flexBudget - plannedSoFar);
  const buffer = roundMoney(plannedSoFar - flexSpent);
  const planPerDay = cycleLength > 0 ? roundMoney(flexBudget / cycleLength) : 0;
  const planPerDayAhead = daysLeft > 0 ? roundMoney(expectedAhead / daysLeft) : 0;
  const perDayLeft = daysLeft > 0 ? roundMoney(Math.max(0, flexLeft) / daysLeft) : 0;
  const allowanceRatio = expectedAhead > 0 ? flexLeft / expectedAhead : flexLeft >= 0 ? 1 : 0;

  let tone: BudgetPlanTone;
  let status: string;
  if (moneyLeft < 0 || flexLeft < 0) {
    tone = "bad";
    status = "Over budget";
  } else if (daysLeft === 0) {
    tone = "good";
    status = "Finished within budget";
  } else if (allowanceRatio >= PLAN_GREEN_RATIO) {
    tone = "good";
    status = "On track";
  } else if (allowanceRatio >= PLAN_RED_RATIO) {
    tone = "warn";
    status = "Slow down a little";
  } else {
    tone = "bad";
    status = "Slow down";
  }

  // Daily series for the chart.
  const startDate = parseIsoDate(start);
  const perDay = new Array(cycleLength).fill(0);
  for (const tx of cycleTransactions) {
    if (!isFlexibleTransaction(tx, start)) continue;
    const day = daysBetween(startDate, parseIsoDate(tx.date)) + 1;
    if (day < 1 || day > dayIndex) continue;
    perDay[day - 1] += effectiveSpend(tx);
  }
  const actualByDay: number[] = [];
  let run = 0;
  for (let d = 0; d < dayIndex; d++) {
    run += perDay[d];
    actualByDay.push(roundMoney(run));
  }
  // A manual "spent so far" entry has no per-charge dates — put the gap on today.
  if (actualByDay.length && actualByDay[actualByDay.length - 1] < flexSpent) {
    actualByDay[actualByDay.length - 1] = flexSpent;
  }
  const planByDay = Array.from({ length: cycleLength }, (_, i) =>
    roundMoney(flexBudget * planShareAt(i + 1)),
  );

  // Plain "have we ever spent this much by day N?" — counted the same way as the past cycles.
  let byThisDay: BudgetPlan["byThisDay"] = null;
  if (cycle.history?.length) {
    const past = pastCyclesByDay(cycle.history, start, cycle.cycleDay, dayIndex);
    if (past.length) {
      let everyday = 0;
      let total = 0;
      for (const tx of cycleTransactions) {
        const amt = effectiveSpend(tx);
        if (!(amt > 0)) continue;
        const day = daysBetween(startDate, parseIsoDate(tx.date)) + 1;
        if (day > dayIndex) continue;
        total += amt;
        if (isFlexibleTransaction(tx)) everyday += amt;
      }
      // A manual "spent so far" total has no per-charge dates; count it as everyday.
      everyday = Math.max(everyday, flexSpent);
      total = Math.max(total, everyday);
      byThisDay = {
        everyday: roundMoney(everyday),
        total: roundMoney(total),
        past,
        everydayRank: 1 + past.filter((p) => p.everyday > everyday).length,
        totalRank: 1 + past.filter((p) => p.total > total).length,
      };
    }
  }

  return {
    tone,
    status,
    budget,
    bills,
    committedRows,
    vaadReserve,
    upcomingReserve,
    flexBudget,
    flexSpent,
    flexLeft,
    moneyLeft,
    spentOnCap: breakdown.spent,
    dayIndex,
    cycleLength,
    daysLeft,
    planPerDay,
    planPerDayAhead,
    plannedSoFar,
    buffer,
    perDayLeft,
    allowanceRatio: Math.round(allowanceRatio * 1000) / 1000,
    curve,
    actualByDay,
    planByDay,
    byThisDay,
  };
}

/** "₪420 under plan" / "₪310 over plan" / "Right on plan". */
export function budgetPlanBufferLabel(plan: BudgetPlan, format: (n: number) => string): string {
  if (Math.abs(plan.buffer) < 1) return "Right on plan";
  return plan.buffer > 0 ? `${format(plan.buffer)} under plan` : `${format(Math.abs(plan.buffer))} over plan`;
}

export function budgetPlanToneClass(tone: BudgetPlanTone): string {
  if (tone === "good") return "metric-card-budget--ok";
  if (tone === "warn") return "metric-card-budget--low";
  return "metric-card-budget--over";
}
