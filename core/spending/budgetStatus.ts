import type { Transaction } from "../types.js";
import {
  isCarLoanTransaction,
  isDevInstituteTransaction,
  isRentTransaction,
  isVaadBayitTransaction,
  VAAD_BAYIT_RESERVE,
} from "../household/householdBudget.js";
import { effectiveSpend } from "../utils/transaction.js";
import { roundMoney } from "../utils/format.js";
import { billingCycleProgress, getCycleRangeForStart } from "./pace.js";
import { previousBillingCycleStart } from "./paceBudget.js";

/**
 * One rule for "how am I doing" this cycle.
 *
 * 1. Bills (rent, car loan, Dev Institute, vaad bayit) are set aside first, even
 *    before they are charged, using last cycle's amount. So the everyday number
 *    no longer jumps when rent posts.
 * 2. What is left is the everyday budget, spread evenly over the cycle: that is
 *    the daily plan.
 * 3. Today's allowance = everyday money left ÷ days left (today included).
 *    It only moves when you spend more or less than the allowance.
 * 4. Colour compares today's allowance with the plan:
 *    green  — at or above plan (or less than half a day's allowance ahead),
 *    yellow — behind, but a small cut catches up,
 *    red    — more than 3 days' allowance ahead of plan AND the daily
 *             allowance is down more than 25%, or the everyday money is gone.
 *    (Both conditions for red, so a small slip near the end of the cycle,
 *    when few days are left, stays yellow.)
 */

export type BudgetTone = "good" | "warn" | "bad";

export type BillKind = "rent" | "carLoan" | "devInstitute" | "vaadBayit";

export interface BudgetBill {
  kind: BillKind;
  label: string;
  amount: number;
  /** true once it is on this cycle's statement; false = set aside from last cycle. */
  charged: boolean;
}

export interface BudgetStatus {
  tone: BudgetTone;
  /** Short headline: "On track", "A bit ahead of plan", "Over plan", "Over budget". */
  title: string;
  /** One plain sentence explaining the colour. */
  message: string;

  livingBudget: number;
  bills: BudgetBill[];
  billsTotal: number;
  billsUpcoming: number;

  everydayBudget: number;
  everydaySpent: number;
  everydayLeft: number;

  dayIndex: number;
  cycleLength: number;
  daysLeft: number;

  /** Everyday budget ÷ cycle days — the same every day of the cycle. */
  plannedDaily: number;
  /** What the plan allowed through yesterday. */
  planToDate: number;
  /** Spent minus plan: positive = ahead of plan (spent more), negative = saved. */
  aheadOfPlan: number;
  /** Everyday left ÷ days left — what you can spend per day from today. */
  allowanceToday: number;
  /** Share of the everyday budget used, 0–100. */
  usedPct: number;
  /** Where the plan says you should be today, 0–100. */
  planPct: number;
}

const BILL_LABELS: Record<BillKind, string> = {
  rent: "Rent",
  carLoan: "Car loan",
  devInstitute: "Dev Institute",
  vaadBayit: "Vaad bayit",
};

function billKind(tx: Transaction): BillKind | null {
  if (isRentTransaction(tx)) return "rent";
  if (isCarLoanTransaction(tx)) return "carLoan";
  if (isDevInstituteTransaction(tx)) return "devInstitute";
  if (isVaadBayitTransaction(tx)) return "vaadBayit";
  return null;
}

function sumBills(transactions: Transaction[], from?: string, to?: string): Map<BillKind, number> {
  const out = new Map<BillKind, number>();
  for (const tx of transactions) {
    const d = tx.date.slice(0, 10);
    if (from && d < from) continue;
    if (to && d > to) continue;
    const kind = billKind(tx);
    if (!kind) continue;
    out.set(kind, roundMoney((out.get(kind) ?? 0) + effectiveSpend(tx)));
  }
  return out;
}

export interface BudgetStatusInput {
  livingBudget: number | null;
  /** This cycle's transactions (statement + extra charges). */
  cycleTransactions: Transaction[];
  /** Older transactions, used only to guess bills that have not been charged yet. */
  historyTransactions?: Transaction[];
  cycleStart: string;
  cycleDay: number;
  referenceDate: Date;
}

export function computeBudgetStatus(input: BudgetStatusInput): BudgetStatus | null {
  const { livingBudget, cycleTransactions, cycleStart, cycleDay, referenceDate } = input;
  if (livingBudget == null || livingBudget <= 0) return null;

  const { dayIndex, cycleLength } = billingCycleProgress(cycleStart, cycleDay, referenceDate);
  const daysLeft = Math.max(1, cycleLength - dayIndex + 1);

  // Bills: charged this cycle, or expected from last cycle (vaad bayit falls back to a fixed reserve).
  const charged = sumBills(cycleTransactions);
  const prevStart = previousBillingCycleStart(cycleStart);
  const prevEnd = getCycleRangeForStart(prevStart, cycleDay).end;
  const lastCycle = sumBills(input.historyTransactions ?? [], prevStart, prevEnd);

  const bills: BudgetBill[] = [];
  for (const kind of ["rent", "carLoan", "devInstitute", "vaadBayit"] as BillKind[]) {
    const now = charged.get(kind) ?? 0;
    if (now > 0) {
      bills.push({ kind, label: BILL_LABELS[kind], amount: now, charged: true });
      continue;
    }
    const expected = kind === "vaadBayit" ? lastCycle.get(kind) || VAAD_BAYIT_RESERVE : lastCycle.get(kind) ?? 0;
    if (expected > 0) bills.push({ kind, label: BILL_LABELS[kind], amount: expected, charged: false });
  }
  const billsTotal = roundMoney(bills.reduce((s, b) => s + b.amount, 0));
  const billsUpcoming = roundMoney(bills.filter((b) => !b.charged).reduce((s, b) => s + b.amount, 0));

  let everydaySpent = 0;
  for (const tx of cycleTransactions) {
    if (!billKind(tx)) everydaySpent += effectiveSpend(tx);
  }
  everydaySpent = roundMoney(everydaySpent);

  const everydayBudget = roundMoney(Math.max(0, livingBudget - billsTotal));
  const everydayLeft = roundMoney(everydayBudget - everydaySpent);
  const plannedDaily = roundMoney(everydayBudget / cycleLength);
  const planToDate = roundMoney(plannedDaily * (dayIndex - 1));
  const aheadOfPlan = roundMoney(everydaySpent - planToDate);
  const allowanceToday = everydayLeft > 0 ? roundMoney(everydayLeft / daysLeft) : 0;

  const usedPct = everydayBudget > 0 ? Math.min(100, Math.max(0, Math.round((everydaySpent / everydayBudget) * 100))) : 100;
  const planPct = Math.round(((dayIndex - 1) / cycleLength) * 100);

  let tone: BudgetTone;
  let title: string;
  let message: string;
  const ratio = plannedDaily > 0 ? allowanceToday / plannedDaily : 0;
  const daysAhead = plannedDaily > 0 ? aheadOfPlan / plannedDaily : 0;

  if (everydayLeft <= 0) {
    tone = "bad";
    title = "Over budget";
    message =
      everydayLeft < 0
        ? `Everyday spending is ${fmt(-everydayLeft)} over what's left after bills.`
        : "The everyday budget for this cycle is used up.";
  } else if (aheadOfPlan <= plannedDaily / 2 || ratio >= 0.95) {
    tone = "good";
    title = "On track";
    message =
      aheadOfPlan < -plannedDaily / 2
        ? `${fmt(-aheadOfPlan)} under plan so far. You can spend a bit more each day.`
        : "Spending is in line with the plan.";
  } else if (ratio >= 0.75 || daysAhead <= 3) {
    tone = "warn";
    title = "A bit ahead of plan";
    message = `${fmt(aheadOfPlan)} more than planned so far. Keep to ${fmt(allowanceToday)} a day to finish on budget.`;
  } else {
    tone = "bad";
    title = "Over plan";
    message = `${fmt(aheadOfPlan)} more than planned so far. Only ${fmt(allowanceToday)} a day left instead of ${fmt(plannedDaily)}.`;
  }

  return {
    tone,
    title,
    message,
    livingBudget,
    bills,
    billsTotal,
    billsUpcoming,
    everydayBudget,
    everydaySpent,
    everydayLeft,
    dayIndex,
    cycleLength,
    daysLeft,
    plannedDaily,
    planToDate,
    aheadOfPlan,
    allowanceToday,
    usedPct,
    planPct,
  };
}

function fmt(n: number): string {
  return `₪${Math.round(n).toLocaleString("en-US")}`;
}
