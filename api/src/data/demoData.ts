import type { MerchantRules, MonthCatalogItem, SpendingReport, Transaction } from "../types.js";

function tx(
  date: string,
  merchantHe: string,
  merchantEn: string,
  amount: number,
  category: string,
  month: string,
): Transaction {
  return {
    date,
    merchant_he: merchantHe,
    merchant_en: merchantEn,
    amount,
    charge_amount: amount,
    transaction_type_he: "רגילה",
    category_he: null,
    notes: null,
    category_en: category,
    merchant_known: true,
    billing_month: month,
  };
}

const DEMO_MONTHS = [
  { key: "2025-11-01", label: "Nov 2025" },
  { key: "2025-12-01", label: "Dec 2025" },
  { key: "2026-01-01", label: "Jan 2026" },
  { key: "2026-02-01", label: "Feb 2026" },
];

function buildMonthReport(monthKey: string, label: string, txs: Transaction[]): SpendingReport {
  const total = txs.reduce((s, t) => s + t.charge_amount, 0);
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
      billing_date: monthKey,
      source_file: `demo-${monthKey.slice(0, 7)}.xlsx`,
      demo: true,
    },
    total_spent: total,
    transaction_count: txs.length,
    date_range: [dates[0], dates[dates.length - 1]],
    by_category: [...byCat.entries()]
      .map(([category_en, v]) => ({
        category_en,
        category_he: null,
        total: v.total,
        count: v.count,
        share_pct: (v.total / total) * 100,
      }))
      .sort((a, b) => b.total - a.total),
    top_merchants: [],
    unknown_merchants: [],
    transactions: txs,
  };
}

const novTxs = [
  tx("2025-11-05", "סופר יוחננוף", "Yochananof", 420, "Groceries", "Nov 2025"),
  tx("2025-11-08", "ארקפה", "Arcaffe", 58, "Coffee", "Nov 2025"),
  tx("2025-11-10", "GETT", "Gett", 89, "Transport", "Nov 2025"),
  tx("2025-11-12", "נטפליקס", "Netflix", 49.9, "Subscriptions", "Nov 2025"),
  tx("2025-11-15", "זארה", "Zara", 310, "Clothes", "Nov 2025"),
  tx("2025-11-18", "WOLT", "Wolt", 125, "Eating out", "Nov 2025"),
  tx("2025-11-22", "פז", "Paz", 280, "Transport", "Nov 2025"),
];

const decTxs = [
  tx("2025-12-03", "שופרסל", "Shufersal", 512, "Groceries", "Dec 2025"),
  tx("2025-12-07", "סטארבקס", "Starbucks", 42, "Coffee", "Dec 2025"),
  tx("2025-12-10", "אמזון", "Amazon", 189, "Miscellaneous", "Dec 2025"),
  tx("2025-12-14", "ספotify", "Spotify", 29.9, "Subscriptions", "Dec 2025"),
  tx("2025-12-20", "מסעדת לולה", "Lola Restaurant", 340, "Eating out", "Dec 2025"),
  tx("2025-12-24", "KSP", "KSP", 890, "Electronics & computers", "Dec 2025"),
];

const janTxs = [
  tx("2026-01-05", "רמי לוי", "Rami Levy", 385, "Groceries", "Jan 2026"),
  tx("2026-01-09", "ארקפה", "Arcaffe", 62, "Coffee", "Jan 2026"),
  tx("2026-01-12", "UBER", "Uber", 76, "Transport", "Jan 2026"),
  tx("2026-01-18", "חשמל", "Electric Co", 420, "Housing", "Jan 2026"),
  tx("2026-01-25", "IKEA", "IKEA", 650, "Home & Furniture", "Jan 2026"),
];

const febTxs = [
  tx("2026-02-02", "סופר יוחננוף", "Yochananof", 445, "Groceries", "Feb 2026"),
  tx("2026-02-08", "WOLT", "Wolt", 98, "Eating out", "Feb 2026"),
  tx("2026-02-14", "זארה", "Zara", 275, "Clothes", "Feb 2026"),
  tx("2026-02-20", "נטפליקס", "Netflix", 49.9, "Subscriptions", "Feb 2026"),
  tx("2026-02-28", "פז", "Paz", 310, "Transport", "Feb 2026"),
];

const monthReports = new Map<string, SpendingReport>([
  ["2025-11-01", buildMonthReport("2025-11-01", "Nov 2025", novTxs)],
  ["2025-12-01", buildMonthReport("2025-12-01", "Dec 2025", decTxs)],
  ["2026-01-01", buildMonthReport("2026-01-01", "Jan 2026", janTxs)],
  ["2026-02-01", buildMonthReport("2026-02-01", "Feb 2026", febTxs)],
]);

export function demoMonthCatalog(): MonthCatalogItem[] {
  return DEMO_MONTHS.map((m) => ({
    key: m.key,
    label: m.label,
    billing_date: m.key,
  }));
}

export function demoSummaryRows() {
  return DEMO_MONTHS.map((m) => {
    const r = monthReports.get(m.key)!;
    return {
      month: m.label,
      billing_date: m.key,
      total: r.total_spent,
      transactions: r.transaction_count,
      source_file: r.metadata.source_file,
    };
  });
}

export function getDemoReport(month?: string): SpendingReport {
  if (month && monthReports.has(month)) {
    return monthReports.get(month)!;
  }
  const allTxs = [...novTxs, ...decTxs, ...janTxs, ...febTxs];
  const total = allTxs.reduce((s, t) => s + t.charge_amount, 0);
  const byCat = new Map<string, { total: number; count: number }>();
  for (const t of allTxs) {
    const c = byCat.get(t.category_en) || { total: 0, count: 0 };
    c.total += t.charge_amount;
    c.count += 1;
    byCat.set(t.category_en, c);
  }
  const dates = allTxs.map((t) => t.date).sort();
  return {
    metadata: {
      combined_label: "Nov 2025 – Feb 2026 (4 months)",
      combined_billing_dates: DEMO_MONTHS.map((m) => m.key),
      statement_count: 4,
      demo: true,
    },
    total_spent: total,
    transaction_count: allTxs.length,
    date_range: [dates[0], dates[dates.length - 1]],
    by_category: [...byCat.entries()]
      .map(([category_en, v]) => ({
        category_en,
        category_he: null,
        total: v.total,
        count: v.count,
        share_pct: (v.total / total) * 100,
      }))
      .sort((a, b) => b.total - a.total),
    top_merchants: [],
    unknown_merchants: [],
    transactions: allTxs.sort((a, b) => b.date.localeCompare(a.date)),
  };
}

export function demoRules(): MerchantRules {
  return {
    "ארקפה": { english: "Arcaffe", category: "Coffee" },
    "סופר יוחננוף": { english: "Yochananof", category: "Groceries" },
  };
}

export function demoReviewQueue() {
  return {
    queue: [
      {
        key: "demo|2026-02-28|חנות חדשה|120.00",
        transaction: tx("2026-02-28", "חנות חדשה", "", 120, "Uncategorized", "Feb 2026"),
        display_english: "",
        occurrence_count: 1,
      },
    ],
    total: 1,
    reviewed_count: 0,
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
  return [...seen.values()];
}
