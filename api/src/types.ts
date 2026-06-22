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
  /** Original transaction currency when different from ILS. */
  original_currency?: string | null;
  /** True when charge_amount was estimated from FX rates (pending export). */
  charge_estimated?: boolean;
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
  /** Mid-cycle export — does not close the billing cycle until a final upload. */
  provisional?: boolean;
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
  /** True for mid-cycle snapshot uploads. */
  partial?: boolean;
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

export interface ExcludedEntry {
  key: string;
  note?: string;
  added_at?: string;
  source?: "builtin" | "user";
}

export interface ExclusionsData {
  entries: ExcludedEntry[];
  /** Keys restored via UI — skips built-in defaults for that key. */
  restored_keys?: string[];
  updated_at?: string | null;
}

export interface ExcludedItemView extends ExcludedEntry {
  date?: string;
  merchant_he?: string;
  amount?: number;
  can_restore: boolean;
}

export type ChargeSchedule = "monthly" | "once";

export interface FixedCharge {
  id: string;
  name_en: string;
  name_he?: string;
  amount: number;
  category_en: string;
  from_month: string;
  through_month: string;
  /** Defaults to monthly for legacy entries. */
  schedule?: ChargeSchedule;
  /** Required for one-time charges — shown on this date in spending. */
  charge_date?: string;
}

export interface FixedChargesData {
  charges: FixedCharge[];
  updated_at?: string | null;
}

export interface LivingBudgetSegment {
  amount: number;
  from_month: string;
  through_month: string;
}

/** One-off extra cap for a single calendar month (added on top of the active period). */
export interface LivingBudgetMonthTopup {
  month: string;
  extra: number;
  note?: string;
}

export interface LivingBudgetData {
  segments: LivingBudgetSegment[];
  month_topups?: LivingBudgetMonthTopup[];
  updated_at?: string | null;
}

export interface FxFallbackData {
  updated: string;
  rates: Record<string, number>;
}

export interface KaspaPriceCache {
  updated_at: string;
  price_usdt: number;
  source?: string;
}

export interface FxcnPriceCache {
  updated_at: string;
  nav_usd: number;
  source?: string;
}

export type CalendarRecurrence = "none" | "weekly" | "monthly" | "yearly";

/** How much time the event blocks — drives default duration. */
export type CalendarImportance = "quick" | "normal" | "important" | "all_day";

export type HouseholdUserId = "egor" | "julia";

export interface CalendarEvent {
  id: string;
  title: string;
  /** First occurrence date (YYYY-MM-DD). */
  date: string;
  all_day?: boolean;
  start_time?: string;
  end_time?: string;
  importance?: CalendarImportance;
  description?: string;
  recurrence?: CalendarRecurrence;
  created_by?: HouseholdUserId;
  created_at?: string;
  updated_at?: string;
}

export interface CalendarData {
  events: CalendarEvent[];
  /** Secret token for the public ICS subscription URL. */
  feed_token?: string;
  updated_at?: string | null;
}
