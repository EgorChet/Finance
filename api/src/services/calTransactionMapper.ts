/** Map israeli-bank-scrapers Cal transactions → analyzer input dicts. */

export interface CalScraperTransaction {
  date: string;
  processedDate?: string;
  description: string;
  chargedAmount: number;
  originalAmount?: number;
  originalCurrency?: string;
  status?: string;
  category?: string;
  memo?: string;
  type?: string;
}

export interface CalTransactionInput {
  date: string;
  merchant_he: string;
  amount: number;
  charge_amount: number;
  transaction_type_he: string;
  category_he: string | null;
  notes: string | null;
  original_currency?: string | null;
  charge_estimated?: boolean;
}

export function mapCalTransactions(txns: CalScraperTransaction[]): CalTransactionInput[] {
  return txns
    .filter((tx) => tx.chargedAmount !== 0)
    .map((tx) => {
      const pending = tx.status === "pending";
      const merchant = (tx.description || "").trim() || "Unknown";
      const chargeAmount = Math.abs(tx.chargedAmount);
      const amount = Math.abs(tx.originalAmount ?? tx.chargedAmount);
      const currency = tx.originalCurrency?.trim() || null;
      const ils = !currency || currency === "₪" || currency.toUpperCase() === "ILS";

      return {
        date: (tx.date || tx.processedDate || "").slice(0, 10),
        merchant_he: merchant,
        amount,
        charge_amount: chargeAmount,
        transaction_type_he: pending ? "בתהליך קליטה" : tx.type === "installments" ? "תשלומים" : "רגיל",
        category_he: tx.category?.trim() || null,
        notes: pending ? "pending" : tx.memo?.trim() || null,
        original_currency: ils ? null : currency,
        charge_estimated: pending && !ils,
      };
    })
    .filter((tx) => tx.date && tx.merchant_he);
}
