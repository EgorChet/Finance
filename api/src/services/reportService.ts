import type {
  CategorySummary,
  MonthCatalogItem,
  SpendingReport,
  StatementEntry,
  StatementsData,
  Transaction,
} from "../types.js";
import { monthLabelFromIso } from "../utils/dates.js";
import { augmentReport } from "./fixedCharges.js";

function billingKey(dateStr: string | undefined): string {
  if (!dateStr) return "unknown";
  return dateStr.slice(0, 10);
}

function monthLabel(dateStr: string): string {
  return monthLabelFromIso(dateStr);
}

export function monthCatalog(data: StatementsData): MonthCatalogItem[] {
  return Object.keys(data.statements)
    .sort()
    .map((key) => {
      const entry = data.statements[key];
      const billing = entry.report.metadata.billing_date as string | undefined;
      return {
        key,
        label: entry.month_label || monthLabel(billing || key),
        billing_date: billing || key,
      };
    });
}

export function summaryRows(data: StatementsData) {
  return monthCatalog(data).map((m) => {
    const entry = data.statements[m.key];
    const report = augmentReport(entry.report);
    return {
      month: m.label,
      billing_date: m.billing_date,
      total: report.total_spent,
      transactions: report.transaction_count,
      source_file: entry.source_file,
    };
  });
}

function mergeCategorySummaries(reports: SpendingReport[]): CategorySummary[] {
  const totals = new Map<string, { total: number; count: number; he: string | null }>();
  let grand = 0;
  for (const r of reports) {
    for (const c of r.by_category) {
      grand += c.total;
      const cur = totals.get(c.category_en) || { total: 0, count: 0, he: c.category_he };
      cur.total += c.total;
      cur.count += c.count;
      totals.set(c.category_en, cur);
    }
  }
  return [...totals.entries()]
    .map(([category_en, v]) => ({
      category_en,
      category_he: v.he,
      total: v.total,
      count: v.count,
      share_pct: grand ? (v.total / grand) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

export function combineReports(reports: SpendingReport[], label: string): SpendingReport {
  const txs: Transaction[] = [];
  for (const r of reports) {
    const billing = r.metadata.billing_date as string | undefined;
    const month = billing ? monthLabel(billing) : undefined;
    for (const tx of r.transactions) {
      txs.push({ ...tx, billing_month: tx.billing_month || month });
    }
  }
  txs.sort((a, b) => b.date.localeCompare(a.date));
  const dates = txs.map((t) => t.date).sort();
  const total = txs.reduce((s, t) => s + t.charge_amount, 0);
  const combinedDates = reports.flatMap((r) => r.metadata.combined_billing_dates as string[] || []);
  const billingDates = reports.map((r) => r.metadata.billing_date as string).filter(Boolean);

  return {
    metadata: {
      ...reports[reports.length - 1].metadata,
      combined_label: label,
      combined_billing_dates: combinedDates.length ? combinedDates : billingDates,
      statement_count: reports.length,
    },
    total_spent: total,
    transaction_count: txs.length,
    date_range: dates.length ? [dates[0], dates[dates.length - 1]] : [new Date().toISOString().slice(0, 10), new Date().toISOString().slice(0, 10)],
    by_category: mergeCategorySummaries(reports),
    top_merchants: reports.flatMap((r) => r.top_merchants).slice(0, 15),
    unknown_merchants: [...new Set(reports.flatMap((r) => r.unknown_merchants))],
    transactions: txs,
  };
}

export function getCombinedReport(
  data: StatementsData,
  keys: string[] | null,
): SpendingReport | null {
  const entries = Object.values(data.statements).sort((a, b) =>
    a.billing_key.localeCompare(b.billing_key),
  );
  if (!entries.length) return null;

  let selected: StatementEntry[];
  if (keys && keys.length) {
    const set = new Set(keys);
    selected = entries.filter((e) => set.has(e.billing_key));
  } else {
    selected = entries;
  }
  if (!selected.length) return null;
  if (selected.length === 1) {
    return augmentReport(selected[0].report);
  }

  const labels = selected.map((e) => e.month_label);
  const label = `${labels[0]} – ${labels[labels.length - 1]} (${selected.length} months)`;
  return combineReports(
    selected.map((e) => augmentReport(e.report)),
    label,
  );
}

export function rememberReport(
  data: StatementsData,
  report: SpendingReport,
  sourcePath: string,
  sourceFile: string,
  hash: string,
): string {
  const billing = report.metadata.billing_date as string | undefined;
  const key = billingKey(billing);
  data.statements[key] = {
    billing_key: key,
    month_label: billing ? monthLabel(billing) : "Unknown",
    source_file: sourceFile,
    source_path: sourcePath,
    file_hash: hash,
    saved_at: new Date().toISOString(),
    report,
  };
  return key;
}

export function isCachedFile(data: StatementsData, hash: string): boolean {
  return Object.values(data.statements).some((e) => e.file_hash === hash);
}
