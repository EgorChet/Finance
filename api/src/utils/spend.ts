import type { Transaction } from "../types.js";

/** Net spend counted toward totals — after any user reimbursement. */
export function effectiveSpend(tx: Pick<Transaction, "charge_amount" | "effective_amount">): number {
  return tx.effective_amount ?? tx.charge_amount;
}
