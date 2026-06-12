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

export interface MerchantSummary {
  merchant_en: string;
  merchant_he: string;
  category_en: string;
  total: number;
  count: number;
}

export interface SpendingReport {
  metadata: Record<string, unknown>;
  total_spent: number;
  transaction_count: number;
  date_range: [string, string];
  by_category: CategorySummary[];
  top_merchants: MerchantSummary[];
  unknown_merchants: string[];
  transactions: Transaction[];
}

export interface StatementEntry {
  billing_key: string;
  month_label: string;
  source_file: string;
  source_path: string;
  file_hash: string;
  saved_at: string;
  report: SpendingReport;
}

export interface StatementsData {
  statements: Record<string, StatementEntry>;
  updated_at: string | null;
}

export interface MerchantRule {
  english: string;
  category?: string | null;
}

export type MerchantRules = Record<string, MerchantRule>;

export interface MonthCatalogItem {
  key: string;
  label: string;
  billing_date: string;
}

export interface ReviewProgressData {
  reviewed_transactions: string[];
  reviewed_merchants?: string[];
}

export interface ReviewQueueItem {
  key: string;
  transaction: Transaction;
  display_english: string;
  occurrence_count: number;
}
