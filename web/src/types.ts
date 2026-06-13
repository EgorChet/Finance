export interface Transaction {
  date: string;
  merchant_he: string;
  amount: number;
  charge_amount: number;
  transaction_type_he: string;
  category_he: string | null;
  notes: string | null;
  merchant_en: string;
  category_en: string;
  merchant_known: boolean;
  billing_month?: string | null;
}

export interface CategorySummary {
  category_en: string;
  category_he: string | null;
  total: number;
  count: number;
  share_pct: number;
}

export interface SpendingReport {
  metadata: Record<string, unknown>;
  total_spent: number;
  transaction_count: number;
  date_range: [string, string];
  by_category: CategorySummary[];
  top_merchants: unknown[];
  unknown_merchants: string[];
  transactions: Transaction[];
}

export interface MonthItem {
  key: string;
  label: string;
  billing_date: string;
  /** In-progress billing cycle — no uploaded statement yet. */
  inProgress?: boolean;
}

export interface MerchantRule {
  english: string;
  category?: string | null;
}

export type MerchantRules = Record<string, MerchantRule>;

export interface ReviewQueueItem {
  key: string;
  transaction: Transaction;
  display_english: string;
  occurrence_count: number;
}

export interface MerchantRow {
  Hebrew: string;
  English: string;
  Category: string;
}
