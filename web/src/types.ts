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
  original_currency?: string | null;
  charge_estimated?: boolean;
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
  /** Live billing cycle — pace tracking. */
  inProgress?: boolean;
  /** Cycle ended; waiting for statement upload. */
  pendingStatement?: boolean;
  /** Mid-cycle snapshot upload for this billing period. */
  partial?: boolean;
  /** Partial tab for the live open cycle (single-tab UX). */
  isCurrentCycle?: boolean;
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

export interface ExcludedItem {
  key: string;
  note?: string;
  added_at?: string;
  source?: "builtin" | "user";
  date?: string;
  merchant_he?: string;
  amount?: number;
  can_restore: boolean;
}
