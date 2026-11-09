/**
 * "Am I on track?" — one rule, anchored to the living budget.
 *
 * 1. Take the cycle's budget and set aside the lumpy, known bills (rent, car loan,
 *    Dev Institute, vaad bayit — reserved until it posts). What's left is the
 *    flexible money for everyday life.
 * 2. Spread it evenly across the cycle: that's your fixed daily plan. It does not
 *    change during the cycle.
 * 3. Each morning the plan has "earned" one more day. Buffer = plan through
 *    yesterday − flexible spent so far. Spending lowers it; a quiet day raises it
 *    by exactly one day's plan.
 * 4. Color: what you can still spend per day vs the plan per day.
 *      green  — you can keep spending your normal daily amount (≥ 90% of plan)
 *      yellow — you need to trim a little (75–90% of plan)
 *      red    — you need to cut hard (< 75%), or the money is already gone
 *
 * Early in the cycle a big purchase is spread over many remaining days, so it barely
 * moves the color; late in the cycle the same overspend matters more. No forecasts,
 * no history averages, no magic ₪50 thresholds.
 */
import type { Transaction } from "../types.js";
import {
  budgetSpendBreakdown,
  hasVaadBayitCharge,
  isVaadBayitTransaction,
  VAAD_BAYIT_RESERVE,
} from "../household/householdBudget.js";
import { effectiveSpend } from "../utils/transaction.js";
import { roundMoney } from "../utils/format.js";
import { billingCycleProgress } from "./pace.js";

export type BudgetPlanTone = "good" | "warn" | "bad";

/** Per-day allowance at or above this share of the plan is green. */
export const PLAN_GREEN_RATIO = 0.9;
/** Below this share of the plan is red. */
export const PLAN_RED_RATIO = 0.75;

export interface BudgetPlan {
  tone: BudgetPlanTone;
  /** Short headline: "On track", "Slow down a little", "Slow down", "Over budget". */
  status: string;
  budget: number;
  /** Rent + car loan + Dev Institute + vaad bayit (actual or reserved). */
  bills: number;
  /** Vaad bayit not posted yet — held back from the flexible money. */
  vaadReserve: number;
  /** budget − bills: the flexible money for the cycle. */
  flexBudget: number;
  /** Flexible spending so far (everything on the cap except the bills above). */
  flexSpent: number;
  flexLeft: number;
  /** Whole cap: budget − everything counted against it (same as the Money left card). */
  moneyLeft: number;
  dayIndex: number;
  cycleLength: number;
  /** Days left including today. */
  daysLeft: number;
  /** flexBudget ÷ cycle length — fixed for the whole cycle. */
  planPerDay: number;
  /** What the plan allowed through yesterday. */
  plannedSoFar: number;
  /** plannedSoFar − flexSpent. Positive = under plan (good). */
  buffer: number;
  /** flexLeft ÷ daysLeft (0 when nothing is left). */
  perDayLeft: number;
  /** perDayLeft ÷ planPerDay. */
  allowanceRatio: number;
  /** Where the plan says the cap bar should be today, 0–100. */
  planMarkerPct: number;
  /** Share of the cap used, 0–100. */
  usedPct: number;
}

function vaadPosted(transactions: Transaction[]): number {
  return roundMoney(
    transactions.filter(isVaadBayitTransaction).reduce((s, tx) => s + effectiveSpend(tx), 0),
  );
}

export function computeBudgetPlan(
  cycleTransactions: Transaction[],
  budget: number | null,
  cycle: { cycleStart: string; cycleDay: number; referenceDate: Date },
): BudgetPlan | null {
  if (budget == null || budget <= 0) return null;

  const { dayIndex, cycleLength } = billingCycleProgress(
    cycle.cycleStart,
    cycle.cycleDay,
    cycle.referenceDate,
  );
  const daysLeft = Math.max(0, cycleLength - dayIndex + 1);

  const breakdown = budgetSpendBreakdown(cycleTransactions);
  const vaadSpent = vaadPosted(cycleTransactions);
  const vaadReserve = hasVaadBayitCharge(cycleTransactions) ? 0 : VAAD_BAYIT_RESERVE;
  const fixedBills = roundMoney(breakdown.rent + breakdown.carLoan + breakdown.devInstitute);
  const bills = roundMoney(fixedBills + vaadSpent + vaadReserve);

  const moneyLeft = roundMoney(budget - breakdown.spent);
  const flexBudget = roundMoney(Math.max(0, budget - bills));
  const flexSpent = roundMoney(Math.max(0, breakdown.spent - fixedBills - vaadSpent));
  const flexLeft = roundMoney(flexBudget - flexSpent);

  const planPerDay = cycleLength > 0 ? roundMoney(flexBudget / cycleLength) : 0;
  const plannedSoFar = roundMoney(planPerDay * Math.max(0, dayIndex - 1));
  const buffer = roundMoney(plannedSoFar - flexSpent);
  const perDayLeft = daysLeft > 0 ? roundMoney(Math.max(0, flexLeft) / daysLeft) : 0;
  const allowanceRatio = planPerDay > 0 ? perDayLeft / planPerDay : flexLeft >= 0 ? 1 : 0;

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

  const plannedCapToday = fixedBills + vaadSpent + plannedSoFar;
  const planMarkerPct = Math.max(0, Math.min(100, (plannedCapToday / budget) * 100));
  const usedPct = Math.max(0, Math.min(100, (breakdown.spent / budget) * 100));

  return {
    tone,
    status,
    budget,
    bills,
    vaadReserve,
    flexBudget,
    flexSpent,
    flexLeft,
    moneyLeft,
    dayIndex,
    cycleLength,
    daysLeft,
    planPerDay,
    plannedSoFar,
    buffer,
    perDayLeft,
    allowanceRatio: Math.round(allowanceRatio * 1000) / 1000,
    planMarkerPct: Math.round(planMarkerPct * 10) / 10,
    usedPct: Math.round(usedPct * 10) / 10,
  };
}

/** "₪420 under plan" / "₪310 over plan" / "Right on plan". */
export function budgetPlanBufferLabel(plan: BudgetPlan, format: (n: number) => string): string {
  if (Math.abs(plan.buffer) < 1) return "Right on plan";
  return plan.buffer > 0
    ? `${format(plan.buffer)} under plan`
    : `${format(Math.abs(plan.buffer))} over plan`;
}

export function budgetPlanToneClass(tone: BudgetPlanTone): string {
  if (tone === "good") return "metric-card-budget--ok";
  if (tone === "warn") return "metric-card-budget--low";
  return "metric-card-budget--over";
}
