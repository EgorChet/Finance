import type { Transaction } from "@/shared/types";

/** Note on a split that says how much of a hold will really be charged. */
export const HOLD_NOTE = "Hold";

/** Still being received (קליטה) or an estimated amount — the real charge may differ (EV charging, parking). */
export function isHold(tx: Transaction): boolean {
  return tx.charge_amount > 0 && (tx.charge_estimated === true || /קליטה/.test(`${tx.notes ?? ""} ${tx.transaction_type_he ?? ""}`));
}

/** A hold you already gave the real amount for. */
export function isSettledHold(tx: Transaction): boolean {
  return !!tx.reimbursement_note?.startsWith(HOLD_NOTE);
}
