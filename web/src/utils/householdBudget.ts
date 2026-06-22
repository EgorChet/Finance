import { rollupCategory } from "../categories";
import type { Transaction } from "../types";
import { roundMoney } from "./format";

const RENT_NAME_RE = /\b(flat rent|rent\b|שכירות)/i;
const CAR_LOAN_NAME_RE = /\b(car loan|הלוואת רכב)/i;
const DEV_INST_NAME_RE = /developers?\s*institute|מכון המפתחים/i;

function chargeId(tx: Transaction): string | null {
  if (!tx.notes?.startsWith("fixed_charge:")) return null;
  return tx.notes.slice("fixed_charge:".length);
}

function merchantLabel(tx: Transaction): string {
  return `${tx.merchant_en || ""} ${tx.merchant_he || ""}`;
}

export function isRentTransaction(tx: Transaction): boolean {
  const id = chargeId(tx);
  if (id === "flat-rent" || id === "rent") return true;
  return RENT_NAME_RE.test(merchantLabel(tx)) && !CAR_LOAN_NAME_RE.test(merchantLabel(tx));
}

export function isCarLoanTransaction(tx: Transaction): boolean {
  const id = chargeId(tx);
  if (id === "car-loan") return true;
  return CAR_LOAN_NAME_RE.test(merchantLabel(tx));
}

export function isDevInstituteTransaction(tx: Transaction): boolean {
  const id = chargeId(tx);
  if (id === "developers-institute") return true;
  return DEV_INST_NAME_RE.test(merchantLabel(tx));
}

/** Rent, car loan, or Developers Institute — the “Monthly bills” bucket. */
export function isMonthlyBillTransaction(tx: Transaction): boolean {
  return isRentTransaction(tx) || isCarLoanTransaction(tx) || isDevInstituteTransaction(tx);
}

/** Flat rent only — not counted against the ₪12k. */
export function isBudgetExcludedTransaction(tx: Transaction): boolean {
  return isRentTransaction(tx);
}

export function monthlyBillsTotal(transactions: Transaction[]): number {
  return roundMoney(
    transactions.filter(isMonthlyBillTransaction).reduce((s, tx) => s + tx.charge_amount, 0),
  );
}

export function everydayTransactions(transactions: Transaction[]): Transaction[] {
  return transactions.filter((tx) => !isMonthlyBillTransaction(tx));
}

/** Everything on the card except rent, car loan, and Dev Institute. */
export function everydaySpendingTotal(transactions: Transaction[]): number {
  return roundMoney(everydayTransactions(transactions).reduce((s, tx) => s + tx.charge_amount, 0));
}

export function everydaySpendingByCategory(transactions: Transaction[]): {
  category_en: string;
  total: number;
  count: number;
}[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const tx of everydayTransactions(transactions)) {
    const cat = rollupCategory(tx.category_en?.trim() || "Uncategorized");
    const cur = map.get(cat) || { total: 0, count: 0 };
    cur.total += tx.charge_amount;
    cur.count += 1;
    map.set(cat, cur);
  }
  return [...map.entries()]
    .map(([category_en, { total, count }]) => ({
      category_en,
      total: roundMoney(total),
      count,
    }))
    .filter((row) => row.total !== 0)
    .sort((a, b) => b.total - a.total);
}

/** What counts against the ₪12k (all card spend except rent). */
export function budgetSpendBreakdown(transactions: Transaction[]): {
  spent: number;
  everyday: number;
  devInstitute: number;
  carLoan: number;
} {
  let everyday = 0;
  let devInstitute = 0;
  let carLoan = 0;
  for (const tx of transactions) {
    if (isBudgetExcludedTransaction(tx)) continue;
    const amt = tx.charge_amount;
    if (isCarLoanTransaction(tx)) carLoan += amt;
    else if (isDevInstituteTransaction(tx)) devInstitute += amt;
    else everyday += amt;
  }
  everyday = roundMoney(everyday);
  devInstitute = roundMoney(devInstitute);
  carLoan = roundMoney(carLoan);
  return { everyday, devInstitute, carLoan, spent: roundMoney(everyday + devInstitute + carLoan) };
}

export function discretionarySpent(transactions: Transaction[]): number {
  return budgetSpendBreakdown(transactions).spent;
}

export function moneyLeft(transactions: Transaction[], budget: number): number {
  return roundMoney(budget - discretionarySpent(transactions));
}
