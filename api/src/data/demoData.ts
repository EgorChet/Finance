import type { MerchantRules, MonthCatalogItem, SpendingReport, Transaction } from "../types.js";

/** Fixed “today” so demo always opens on the Jun 2026 partial cycle. */
export const DEMO_AS_OF = "2026-06-13";

const FINAL_BILLINGS = [
  "2025-10-10",
  "2025-11-10",
  "2025-12-10",
  "2026-01-10",
  "2026-02-10",
  "2026-03-10",
  "2026-04-10",
  "2026-05-10",
  "2026-06-10",
] as const;

const PARTIAL_BILLING = "2026-07-10";

const TARGET_TOTALS: Record<string, number> = {
  "2025-10-10": 17_850,
  "2025-11-10": 18_420,
  "2025-12-10": 21_300,
  "2026-01-10": 19_150,
  "2026-02-10": 18_680,
  "2026-03-10": 20_100,
  "2026-04-10": 19_540,
  "2026-05-10": 20_850,
  "2026-06-10": 19_200,
  [PARTIAL_BILLING]: 4_720,
};

type MerchantTemplate = {
  he: string;
  en: string;
  cat: string;
  typical: number;
};

const MERCHANT_POOL: MerchantTemplate[] = [
  { he: "ארקפה רמת אביב", en: "Arcaffe", cat: "Coffee", typical: 52 },
  { he: "ארקפה הרצליה", en: "Arcaffe", cat: "Coffee", typical: 48 },
  { he: "סופר פארם", en: "Super Pharm", cat: "Groceries", typical: 165 },
  { he: "טיב טעם", en: "Tiv Taam", cat: "Groceries", typical: 420 },
  { he: "שופרסל שלי", en: "Shufersal", cat: "Groceries", typical: 380 },
  { he: "WOLT", en: "Wolt", cat: "Eating out", typical: 145 },
  { he: "מסעדת עלמה", en: "Alma Restaurant", cat: "Eating out", typical: 320 },
  { he: "GETT", en: "Gett", cat: "Transport", typical: 78 },
  { he: "פז YELLOW", en: "Paz", cat: "Transport", typical: 290 },
  { he: "נטפליקס", en: "Netflix", cat: "Subscriptions", typical: 49.9 },
  { he: "SPOTIFY", en: "Spotify", cat: "Subscriptions", typical: 29.9 },
  { he: "HOT mobile", en: "Hot Mobile", cat: "Subscriptions", typical: 49 },
  { he: "מכבי כושר", en: "Gym", cat: "Fitness", typical: 299 },
  { he: "זארה", en: "Zara", cat: "Clothes", typical: 380 },
  { he: "H&M", en: "H&M", cat: "Clothes", typical: 220 },
  { he: "KSP", en: "KSP", cat: "Home & Furniture", typical: 540 },
  { he: "IKEA", en: "IKEA", cat: "Home & Furniture", typical: 890 },
  { he: "איקאה ק. ביאליק", en: "IKEA", cat: "Home & Furniture", typical: 650 },
  { he: "חשמל", en: "Electricity", cat: "Housing", typical: 410 },
  { he: "גוד פארם", en: "Good Pharm", cat: "Groceries", typical: 95 },
  { he: "AMPM", en: "AM:PM", cat: "Groceries", typical: 38 },
  { he: "סushi רמת אביב", en: "Sushi Shop", cat: "Eating out", typical: 185 },
  { he: "OPENAI", en: "OpenAI", cat: "Subscriptions", typical: 75 },
  { he: "CURSOR", en: "Cursor", cat: "Subscriptions", typical: 80 },
  { he: "BIT העברה", en: "Bit transfer", cat: "Bit", typical: 200 },
  { he: "דמי כרטיס", en: "Bank fees", cat: "Bank fees", typical: 18 },
];

function parseIso(dateStr: string): Date {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(iso: string, days: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

function cycleStartForBilling(billingDate: string): string {
  const [y, m] = billingDate.slice(0, 10).split("-").map(Number);
  return isoDate(new Date(y, m - 2, 10));
}

function billingCycleLabel(billingDate: string): string {
  const d = parseIso(billingDate);
  d.setMonth(d.getMonth() - 1);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function tx(
  date: string,
  merchantHe: string,
  merchantEn: string,
  amount: number,
  category: string,
  month: string,
): Transaction {
  const rounded = Math.round(amount * 100) / 100;
  return {
    date,
    merchant_he: merchantHe,
    merchant_en: merchantEn,
    amount: rounded,
    charge_amount: rounded,
    transaction_type_he: "רגילה",
    category_he: null,
    notes: null,
    category_en: category,
    merchant_known: true,
    billing_month: month,
  };
}

function seededAmount(billingKey: string, index: number, typical: number): number {
  const seed = billingKey.split("").reduce((s, c) => s + c.charCodeAt(0), 0) + index * 17;
  const jitter = 0.72 + (seed % 45) / 100;
  return Math.round(typical * jitter * 100) / 100;
}

function generateCycleTransactions(
  billingKey: string,
  targetTotal: number,
  maxDayOffset = 28,
): Transaction[] {
  const cycleStart = cycleStartForBilling(billingKey);
  const label = billingCycleLabel(billingKey);
  const txs: Transaction[] = [];
  let total = 0;
  let day = 0;
  let i = 0;

  while (total < targetTotal * 0.92 && day <= maxDayOffset && i < 120) {
    const m = MERCHANT_POOL[i % MERCHANT_POOL.length];
    let amount = seededAmount(billingKey, i, m.typical);
    const remaining = targetTotal - total;
    if (amount > remaining) amount = Math.max(18, Math.round(remaining * 100) / 100);
    if (amount < 12) break;

    txs.push(tx(addDays(cycleStart, day), m.he, m.en, amount, m.cat, label));
    total += amount;
    day += 1 + (i % 2);
    i += 1;
  }

  if (total < targetTotal && txs.length) {
    const last = txs[txs.length - 1]!;
    const bump = Math.round((targetTotal - total) * 100) / 100;
    last.amount = Math.round((last.amount + bump) * 100) / 100;
    last.charge_amount = last.amount;
  }

  return txs;
}

function topMerchantsFromTxs(txs: Transaction[]): SpendingReport["top_merchants"] {
  const map = new Map<string, { merchant_he: string; category_en: string; total: number; count: number }>();
  for (const t of txs) {
    const key = t.merchant_en || t.merchant_he;
    const cur = map.get(key) || {
      merchant_he: t.merchant_he,
      category_en: t.category_en,
      total: 0,
      count: 0,
    };
    cur.total += t.charge_amount;
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([merchant_en, v]) => ({
      merchant_en,
      merchant_he: v.merchant_he,
      category_en: v.category_en,
      total: Math.round(v.total * 100) / 100,
      count: v.count,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);
}

function buildMonthReport(
  billingKey: string,
  txs: Transaction[],
  options: { partial?: boolean } = {},
): SpendingReport {
  const total = Math.round(txs.reduce((s, t) => s + t.charge_amount, 0) * 100) / 100;
  const byCat = new Map<string, { total: number; count: number }>();
  for (const t of txs) {
    const c = byCat.get(t.category_en) || { total: 0, count: 0 };
    c.total += t.charge_amount;
    c.count += 1;
    byCat.set(t.category_en, c);
  }
  const dates = txs.map((t) => t.date).sort();
  return {
    metadata: {
      billing_date: billingKey,
      source_file: options.partial
        ? `demo-partial-${billingKey.slice(0, 7)}.xlsx`
        : `demo-${billingKey.slice(0, 7)}.xlsx`,
      demo: true,
      provisional: options.partial === true,
    },
    total_spent: total,
    transaction_count: txs.length,
    date_range: [dates[0] ?? billingKey, dates[dates.length - 1] ?? billingKey],
    by_category: [...byCat.entries()]
      .map(([category_en, v]) => ({
        category_en,
        category_he: null,
        total: Math.round(v.total * 100) / 100,
        count: v.count,
        share_pct: total ? (v.total / total) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total),
    top_merchants: topMerchantsFromTxs(txs),
    unknown_merchants: [],
    transactions: txs.sort((a, b) => b.date.localeCompare(a.date)),
  };
}

const monthReports = new Map<string, SpendingReport>();

for (const billing of FINAL_BILLINGS) {
  const txs = generateCycleTransactions(billing, TARGET_TOTALS[billing] ?? 19_000);
  monthReports.set(billing, buildMonthReport(billing, txs));
}

const partialTxs = generateCycleTransactions(PARTIAL_BILLING, TARGET_TOTALS[PARTIAL_BILLING], 3);
monthReports.set(PARTIAL_BILLING, buildMonthReport(PARTIAL_BILLING, partialTxs, { partial: true }));

export function demoMonthCatalog(): MonthCatalogItem[] {
  const finals: MonthCatalogItem[] = FINAL_BILLINGS.map((billing) => ({
    key: billing,
    label: billingCycleLabel(billing),
    billing_date: billing,
    partial: false,
  }));
  finals.push({
    key: PARTIAL_BILLING,
    label: `${billingCycleLabel(PARTIAL_BILLING)} · partial`,
    billing_date: PARTIAL_BILLING,
    partial: true,
  });
  return finals;
}

export function demoSummaryRows() {
  return [...FINAL_BILLINGS, PARTIAL_BILLING].map((billing) => {
    const r = monthReports.get(billing)!;
    return {
      month: billing === PARTIAL_BILLING ? billingCycleLabel(billing) : billingCycleLabel(billing),
      billing_date: billing,
      total: r.total_spent,
      transactions: r.transaction_count,
      source_file: String(r.metadata.source_file),
      partial: billing === PARTIAL_BILLING,
    };
  });
}

export function getDemoReport(month?: string): SpendingReport {
  if (month && monthReports.has(month)) {
    return monthReports.get(month)!;
  }
  const allTxs = [...monthReports.values()].flatMap((r) => r.transactions);
  const total = Math.round(allTxs.reduce((s, t) => s + t.charge_amount, 0) * 100) / 100;
  const byCat = new Map<string, { total: number; count: number }>();
  for (const t of allTxs) {
    const c = byCat.get(t.category_en) || { total: 0, count: 0 };
    c.total += t.charge_amount;
    c.count += 1;
    byCat.set(t.category_en, c);
  }
  const dates = allTxs.map((t) => t.date).sort();
  const billingDates = [...FINAL_BILLINGS, PARTIAL_BILLING];
  return {
    metadata: {
      combined_label: `${billingCycleLabel(FINAL_BILLINGS[0])} – ${billingCycleLabel(PARTIAL_BILLING)}`,
      combined_billing_dates: billingDates,
      statement_count: billingDates.length,
      demo: true,
    },
    total_spent: total,
    transaction_count: allTxs.length,
    date_range: [dates[0], dates[dates.length - 1]],
    by_category: [...byCat.entries()]
      .map(([category_en, v]) => ({
        category_en,
        category_he: null,
        total: Math.round(v.total * 100) / 100,
        count: v.count,
        share_pct: total ? (v.total / total) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total),
    top_merchants: topMerchantsFromTxs(allTxs).slice(0, 15),
    unknown_merchants: [],
    transactions: allTxs.sort((a, b) => b.date.localeCompare(a.date)),
  };
}

export function demoFixedCharges() {
  return {
    charges: [
      {
        id: "rent",
        name_en: "Rent",
        name_he: "שכירות",
        amount: 5200,
        category_en: "Housing",
        from_month: "2024-01",
        through_month: "2035-12",
      },
      {
        id: "car-loan",
        name_en: "Car loan",
        name_he: "הלוואת רכב",
        amount: 980,
        category_en: "Housing",
        from_month: "2023-06",
        through_month: "2028-06",
      },
      {
        id: "cibus-card",
        name_en: "Cibus card",
        name_he: "כרטיס סיבוס",
        amount: 600,
        category_en: "Groceries",
        from_month: "2024-01",
        through_month: "2035-12",
      },
    ],
  };
}

export function demoLivingBudget() {
  return {
    segments: [
      { amount: 8400, from_month: "2024-01", through_month: "2024-12" },
      { amount: 9600, from_month: "2025-01", through_month: "2025-08" },
      { amount: 10800, from_month: "2025-09", through_month: "2025-12" },
      { amount: 12000, from_month: "2026-01", through_month: "2026-06" },
      { amount: 13250, from_month: "2026-07", through_month: "2035-12" },
    ],
  };
}

export function demoRules(): MerchantRules {
  return {
    "ארקפה רמת אביב": { english: "Arcaffe", category: "Coffee" },
    "ארקפה הרצליה": { english: "Arcaffe", category: "Coffee" },
    "סופר פארם": { english: "Super Pharm", category: "Groceries" },
    "טיב טעם": { english: "Tiv Taam", category: "Groceries" },
    "שופרסל שלי": { english: "Shufersal", category: "Groceries" },
    "גוד פארם": { english: "Good Pharm", category: "Groceries" },
    WOLT: { english: "Wolt", category: "Eating out" },
    "מסעדת עלמה": { english: "Alma Restaurant", category: "Eating out" },
    GETT: { english: "Gett", category: "Transport" },
    "פז YELLOW": { english: "Paz", category: "Transport" },
    "נטפליקס": { english: "Netflix", category: "Subscriptions" },
    SPOTIFY: { english: "Spotify", category: "Subscriptions" },
    "HOT mobile": { english: "Hot Mobile", category: "Subscriptions" },
    "מכבי כושר": { english: "Gym", category: "Fitness" },
    "זארה": { english: "Zara", category: "Clothes" },
    "H&M": { english: "H&M", category: "Clothes" },
    KSP: { english: "KSP", category: "Home & Furniture" },
    IKEA: { english: "IKEA", category: "Home & Furniture" },
    "איקאה ק. ביאליק": { english: "IKEA", category: "Home & Furniture" },
    "חשמל": { english: "Electricity", category: "Housing" },
    OPENAI: { english: "OpenAI", category: "Subscriptions" },
    CURSOR: { english: "Cursor", category: "Subscriptions" },
  };
}

export function demoReviewQueue() {
  return {
    queue: [
      {
        key: "demo|2026-06-12|מספרה חדשה|180.00",
        transaction: tx("2026-06-12", "מספרה חדשה", "", 180, "Uncategorized", "Jun 2026"),
        display_english: "",
        occurrence_count: 2,
      },
      {
        key: "demo|2026-06-11|CHARGES.COM|42.00",
        transaction: tx("2026-06-11", "CHARGES.COM", "", 42, "Uncategorized", "Jun 2026"),
        display_english: "",
        occurrence_count: 1,
      },
      {
        key: "demo|2026-05-28|קפה לא מזוהה|38.00",
        transaction: tx("2026-05-28", "קפה לא מזוהה", "", 38, "Uncategorized", "May 2026"),
        display_english: "",
        occurrence_count: 1,
      },
    ],
    total: 3,
    reviewed_count: 0,
  };
}

export function demoExclusions() {
  return {
    entries: [
      {
        key: "2026-05-15|OPENAI|75.00",
        date: "2026-05-15",
        merchant_he: "OPENAI",
        merchant_en: "OpenAI",
        amount: 75,
        category_en: "Subscriptions",
        reason: "Work account — reimbursed",
      },
    ],
    total: 1,
  };
}

export function demoMerchants() {
  const report = getDemoReport();
  const seen = new Map<string, { Hebrew: string; English: string; Category: string }>();
  for (const t of report.transactions) {
    if (!seen.has(t.merchant_he)) {
      seen.set(t.merchant_he, {
        Hebrew: t.merchant_he,
        English: t.merchant_en,
        Category: t.category_en,
      });
    }
  }
  return [...seen.values()].sort((a, b) => a.English.localeCompare(b.English));
}

export function demoCalendar() {
  return {
    events: [
      {
        id: "demo-nails",
        title: "Nail appointment",
        date: "2026-06-18",
        importance: "normal" as const,
        start_time: "14:00",
        end_time: "16:00",
        description: "Ramat Aviv",
        recurrence: "none" as const,
        created_by: "julia" as const,
      },
      {
        id: "demo-birthday",
        title: "Maya birthday",
        date: "1990-08-22",
        importance: "all_day" as const,
        all_day: true,
        description: "Family dinner",
        recurrence: "yearly" as const,
        created_by: "egor" as const,
      },
      {
        id: "demo-rent",
        title: "Rent reminder",
        date: "2026-01-10",
        importance: "all_day" as const,
        all_day: true,
        recurrence: "monthly" as const,
        created_by: "egor" as const,
      },
    ],
    feed_token: null as string | null,
    updated_at: null as string | null,
    demo: true,
  };
}
