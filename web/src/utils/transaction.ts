/** Bank credit / refund row (Leumi: transaction type contains זיכוי). */
export function isRefundTransaction(tx: {
  charge_amount: number;
  amount?: number;
  transaction_type_he?: string;
}): boolean {
  if (tx.transaction_type_he?.includes("זיכוי")) return true;
  if (tx.charge_amount < 0) return true;
  if (tx.amount != null && tx.amount < 0) return true;
  return false;
}

/** Stable key for list rendering — includes type so charge/refund rows stay distinct. */
export function transactionRowKey(tx: {
  date: string;
  merchant_he: string;
  charge_amount: number;
  transaction_type_he?: string;
}): string {
  const type = tx.transaction_type_he?.trim() || "";
  return `${tx.date}|${tx.merchant_he}|${tx.charge_amount.toFixed(2)}|${type}`;
}
