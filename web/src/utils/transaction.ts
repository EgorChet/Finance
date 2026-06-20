/** Leumi refund / credit transaction types (column 4 in Visa export). */
const REFUND_TYPE_MARKERS = ["זיכוי", "השבת מכירה"] as const;

export function isRefundTypeHe(transactionTypeHe: string | null | undefined): boolean {
  if (!transactionTypeHe) return false;
  return REFUND_TYPE_MARKERS.some((m) => transactionTypeHe.includes(m));
}

/** Bank credit / refund row. */
export function isRefundTransaction(tx: {
  charge_amount: number;
  amount?: number;
  transaction_type_he?: string;
}): boolean {
  if (isRefundTypeHe(tx.transaction_type_he)) return true;
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
