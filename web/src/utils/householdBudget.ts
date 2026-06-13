import type { Transaction } from "../types";
import { roundMoney } from "./format";

/** Monthly living budget (excludes rent & car loan — those are paid separately). */
export const MONTHLY_DISCRETIONARY_BUDGET = 12000;

/** Recurring charge ids excluded from the ₪12k budget tally. */
const BUDGET_EXCLUDED_CHARGE_IDS = new Set(["flat-rent", "car-loan", "rent"]);

const RENT_NAME_RE = /\b(flat rent|rent\b|שכירות)/i;
const CAR_LOAN_NAME_RE = /\b(car loan|הלוואת רכב)/i;

export function isBudgetExcludedTransaction(tx: Transaction): boolean {
  if (tx.notes?.startsWith("fixed_charge:")) {
    const id = tx.notes.slice("fixed_charge:".length);
    if (BUDGET_EXCLUDED_CHARGE_IDS.has(id)) return true;
  }
  const label = `${tx.merchant_en || ""} ${tx.merchant_he || ""}`;
  if (RENT_NAME_RE.test(label) && !CAR_LOAN_NAME_RE.test(label)) return true;
  if (CAR_LOAN_NAME_RE.test(label)) return true;
  return false;
}

export function discretionarySpent(transactions: Transaction[]): number {
  return roundMoney(
    transactions.filter((tx) => !isBudgetExcludedTransaction(tx)).reduce((s, tx) => s + tx.charge_amount, 0),
  );
}

export function moneyLeft(transactions: Transaction[], budget = MONTHLY_DISCRETIONARY_BUDGET): number {
  return roundMoney(budget - discretionarySpent(transactions));
}
