export function transactionKey(tx: {
  date: string;
  merchant_he: string;
  charge_amount: number;
}): string {
  return `${tx.date}|${tx.merchant_he}|${tx.charge_amount.toFixed(2)}`;
}
