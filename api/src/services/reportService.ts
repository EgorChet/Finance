import type {
  CategorySummary,
  MerchantRules,
  MonthCatalogItem,
  SpendingReport,
  StatementEntry,
  StatementsData,
  Transaction,
} from "../types.js";
import { monthLabelFromIso } from "../utils/dates.js";
import {
  billingCycleLabelFromIso,
  inferBillingDateFromTransactions,
} from "../utils/billingCycle.js";
import { canonicalMerchantEnglish } from "../utils/merchantVendor.js";
import { augmentReport, rebuildReportSummaries } from "./fixedCharges.js";
import { applyAdjustments } from "./adjustments.js";
import { applyExclusions } from "./exclusions.js";
import { dedupeTransactionSnapshots, normalizeForeignCharges, shouldSkipNonSpendRow } from "../utils/fx.js";
import { prefetchRatesForPending } from "../utils/fxRates.js";
import { getFinalizeVersion } from "./finalizeVersion.js";

/** Default billing keys for pace baseline: current + 3 past months. */
export const DEFAULT_PACE_MONTHS = 4;

/** Retired categories merged into another for display and totals. */
const CATEGORY_ALIASES: Record<string, string> = {
  "Sibus Flexi": "Groceries",
  "Home & Electronics": "Home & Furniture",
};

const finalizedMemo = new Map<string, SpendingReport>();

function memoKey(billingKey: string, version: string): string {
  return `${billingKey}:${version}`;
}

function remapLegacyCategories(report: SpendingReport): SpendingReport {
  let changed = false;
  const transactions = report.transactions.map((tx) => {
    const mapped = CATEGORY_ALIASES[tx.category_en];
    if (!mapped) return tx;
    changed = true;
    return { ...tx, category_en: mapped };
  });
  if (!changed) return report;
  return rebuildReportSummaries({ ...report, transactions });
}

function pendingCurrenciesFromMetadata(metadata: Record<string, unknown>): Record<string, string> | undefined {
  const raw = metadata.pending_currencies;
  if (!raw || typeof raw !== "object") return undefined;
  return raw as Record<string, string>;
}

export function finalizeReport(report: SpendingReport): SpendingReport {
  const pendingCurrencies = pendingCurrenciesFromMetadata(report.metadata);
  const kept = report.transactions.filter(
    (tx) => !shouldSkipNonSpendRow(tx.charge_amount, tx.merchant_he, tx.notes, tx.transaction_type_he),
  );
  const base = kept.length !== report.transactions.length
    ? rebuildReportSummaries({ ...report, transactions: kept })
    : report;
  const { transactions: normalizedTxs, changed } = normalizeForeignCharges(
    base.transactions,
    pendingCurrencies,
  );
  const withFx = changed
    ? rebuildReportSummaries({ ...base, transactions: normalizedTxs })
    : base;
  return applyAdjustments(applyExclusions(augmentReport(remapLegacyCategories(withFx))));
}

export async function finalizeReportAsync(report: SpendingReport): Promise<SpendingReport> {
  await prefetchRatesForPending(report.transactions);
  return finalizeReport(report);
}

export function getFinalizedReport(entry: StatementEntry, version: string): SpendingReport {
  if (entry.finalize_version === version) {
    const mk = memoKey(entry.billing_key, version);
    const cached = finalizedMemo.get(mk);
    if (cached) return cached;
    finalizedMemo.set(mk, entry.report);
    return entry.report;
  }
  const finalized = finalizeReport(entry.report);
  finalizedMemo.set(memoKey(entry.billing_key, version), finalized);
  return finalized;
}

export async function persistFinalizedStatementAsync(
  entry: StatementEntry,
  version: string,
): Promise<void> {
  entry.report = await finalizeReportAsync(entry.report);
  entry.finalize_version = version;
  entry.summary = {
    total: entry.report.total_spent,
    transaction_count: entry.report.transaction_count,
  };
  finalizedMemo.set(memoKey(entry.billing_key, version), entry.report);
}

function billingKey(dateStr: string | undefined): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return "unknown";
  return dateStr.slice(0, 10);
}

function resolveReportBillingDate(report: SpendingReport): string | undefined {
  const raw = report.metadata.billing_date as string | undefined;
  if (raw && /^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const inferred = inferBillingDateFromTransactions(report.transactions);
  if (inferred) {
    report.metadata.billing_date = inferred;
    return inferred;
  }
  return undefined;
}

/** Drop a stale statement bucket when the same file is re-saved under the correct billing key. */
export function removeStatementByKeyIfHash(
  data: StatementsData,
  key: string,
  fileHash: string,
): void {
  const entry = data.statements[key];
  if (entry?.file_hash === fileHash) {
    delete data.statements[key];
  }
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
      const billingIso = billing && /^\d{4}-\d{2}-\d{2}/.test(billing) ? billing.slice(0, 10) : key;
      const cycleLabel =
        billingIso !== "unknown" ? billingCycleLabelFromIso(billingIso) : entry.month_label || "Unknown cycle";
      return {
        key,
        label: entry.provisional ? `${cycleLabel} · partial` : cycleLabel,
        billing_date: billingIso !== "unknown" ? billingIso : billing || key,
        partial: entry.provisional === true,
        saved_at: entry.saved_at,
      };
    });
}

export function recentBillingKeys(data: StatementsData, count: number): string[] {
  return monthCatalog(data)
    .sort((a, b) => b.key.localeCompare(a.key))
    .slice(0, Math.max(1, count))
    .map((m) => m.key);
}

export function summaryRows(data: StatementsData, version: string) {
  return monthCatalog(data).map((m) => {
    const entry = data.statements[m.key];
    if (entry.finalize_version === version && entry.summary) {
      return {
        month: m.label,
        billing_date: m.billing_date,
        total: entry.summary.total,
        transactions: entry.summary.transaction_count,
        source_file: entry.source_file,
        partial: entry.provisional === true,
      };
    }
    const report = getFinalizedReport(entry, version);
    return {
      month: m.label,
      billing_date: m.billing_date,
      total: report.total_spent,
      transactions: report.transaction_count,
      source_file: entry.source_file,
      partial: entry.provisional === true,
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
  const deduped = dedupeTransactionSnapshots(txs);
  deduped.sort((a, b) => b.date.localeCompare(a.date));
  const dates = deduped.map((t) => t.date).sort();
  const total = deduped.reduce((s, t) => s + t.charge_amount, 0);
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
    transaction_count: deduped.length,
    date_range: dates.length ? [dates[0], dates[dates.length - 1]] : [new Date().toISOString().slice(0, 10), new Date().toISOString().slice(0, 10)],
    by_category: mergeCategorySummaries(reports),
    top_merchants: reports.flatMap((r) => r.top_merchants).slice(0, 15),
    unknown_merchants: [...new Set(reports.flatMap((r) => r.unknown_merchants))],
    transactions: deduped,
  };
}

export async function getPaceBundleAsync(
  data: StatementsData,
  keys: string[],
  version?: string,
): Promise<{ report: SpendingReport | null; scopedReports: Record<string, SpendingReport> }> {
  if (!keys.length) return { report: null, scopedReports: {} };

  const finalizeVersion = version ?? await getFinalizeVersion();
  const orderedKeys = [...keys].sort();
  const entries = orderedKeys
    .map((k) => data.statements[k])
    .filter((e): e is StatementEntry => !!e);
  if (!entries.length) return { report: null, scopedReports: {} };

  await prefetchRatesForPending(entries.flatMap((e) => e.report.transactions));

  const scopedReports: Record<string, SpendingReport> = {};
  const finalized: SpendingReport[] = [];
  for (const key of orderedKeys) {
    const entry = data.statements[key];
    if (!entry) continue;
    const report = getFinalizedReport(entry, finalizeVersion);
    scopedReports[key] = report;
    finalized.push(report);
  }

  if (!finalized.length) return { report: null, scopedReports: {} };
  if (finalized.length === 1) {
    return { report: finalized[0], scopedReports };
  }

  const labels = orderedKeys.map((k) => data.statements[k]?.month_label).filter(Boolean);
  const label = `${labels[0]} – ${labels[labels.length - 1]} (${orderedKeys.length} months)`;
  return { report: combineReports(finalized, label), scopedReports };
}

export async function getCombinedReportAsync(
  data: StatementsData,
  keys: string[] | null,
  version?: string,
): Promise<SpendingReport | null> {
  const finalizeVersion = version ?? await getFinalizeVersion();
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

  await prefetchRatesForPending(selected.flatMap((e) => e.report.transactions));

  if (selected.length === 1) {
    return getFinalizedReport(selected[0], finalizeVersion);
  }

  const labels = selected.map((e) => e.month_label);
  const label = `${labels[0]} – ${labels[labels.length - 1]} (${selected.length} months)`;
  return combineReports(
    selected.map((e) => getFinalizedReport(e, finalizeVersion)),
    label,
  );
}

export function getCombinedReport(
  data: StatementsData,
  keys: string[] | null,
  version: string,
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
    return getFinalizedReport(selected[0], version);
  }

  const labels = selected.map((e) => e.month_label);
  const label = `${labels[0]} – ${labels[labels.length - 1]} (${selected.length} months)`;
  return combineReports(
    selected.map((e) => getFinalizedReport(e, version)),
    label,
  );
}

/** Pending charges in mid-cycle exports often have purchase amount but zero charge. */
export async function normalizeProvisionalChargesAsync(report: SpendingReport): Promise<SpendingReport> {
  await prefetchRatesForPending(report.transactions);
  return normalizeProvisionalCharges(report);
}

export function normalizeProvisionalCharges(report: SpendingReport): SpendingReport {
  const pendingCurrencies = pendingCurrenciesFromMetadata(report.metadata);
  const { transactions, changed } = normalizeForeignCharges(report.transactions, pendingCurrencies);
  if (!changed) return report;
  return rebuildReportSummaries({ ...report, transactions });
}

export function rememberReport(
  data: StatementsData,
  report: SpendingReport,
  sourcePath: string,
  sourceFile: string,
  hash: string,
  provisional = false,
): string {
  const billing = resolveReportBillingDate(report);
  const key = billingKey(billing);
  const storedReport: SpendingReport = {
    ...report,
    metadata: {
      ...report.metadata,
      provisional,
    },
  };
  data.statements[key] = {
    billing_key: key,
    month_label: billing ? billingCycleLabelFromIso(billing) : "Unknown cycle",
    source_file: sourceFile,
    source_path: sourcePath,
    file_hash: hash,
    saved_at: new Date().toISOString(),
    provisional,
    report: storedReport,
  };
  return key;
}

/** Move legacy `unknown` buckets onto the inferred billing key (partial exports without header). */
export function repairMiskeyedStatements(data: StatementsData): number {
  let repaired = 0;
  for (const key of [...Object.keys(data.statements)]) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    const entry = data.statements[key];
    if (!entry) continue;
    const report: SpendingReport = {
      ...entry.report,
      metadata: { ...entry.report.metadata },
      transactions: [...entry.report.transactions],
    };
    const billing = resolveReportBillingDate(report);
    if (!billing) continue;
    const newKey = billingKey(billing);
    if (newKey === "unknown" || newKey === key) continue;
    rememberReport(
      data,
      report,
      entry.source_path,
      entry.source_file,
      entry.file_hash,
      entry.provisional === true,
    );
    delete data.statements[key];
    repaired += 1;
  }
  return repaired;
}

export function isCachedFile(data: StatementsData, hash: string): boolean {
  return Object.values(data.statements).some((e) => e.file_hash === hash);
}

export function findStatementByHash(
  data: StatementsData,
  hash: string,
): { key: string; entry: StatementEntry } | null {
  for (const [key, entry] of Object.entries(data.statements)) {
    if (entry.file_hash === hash) {
      return { key, entry };
    }
  }
  return null;
}

/** Mark a stored partial statement as final without re-uploading the xlsx. */
export function promoteStatementToFinal(entry: StatementEntry): void {
  entry.provisional = false;
  entry.report = {
    ...entry.report,
    metadata: {
      ...entry.report.metadata,
      provisional: false,
    },
  };
}

/** Storage keys must be safe path segments — billing dates or legacy buckets like `unknown`. */
export function isSafeStatementKey(key: string): boolean {
  if (!key || key.length > 64) return false;
  if (key.includes("/") || key.includes("\\") || key.includes("..")) return false;
  return true;
}

export function deleteStatementByKey(data: StatementsData, key: string): boolean {
  if (!data.statements[key]) return false;
  delete data.statements[key];
  return true;
}

/** Patch merchant/category fields on one report (no finalize). */
export function patchMerchantRulesOnReport(report: SpendingReport, rules: MerchantRules): number {
  let changed = 0;
  for (const tx of report.transactions) {
    const rule = rules[tx.merchant_he];
    if (rule?.english) {
      const fromRule = rule.english.trim();
      if (tx.merchant_en !== fromRule) {
        tx.merchant_en = fromRule;
        changed += 1;
      }
    } else if (tx.merchant_en) {
      const canon = canonicalMerchantEnglish(tx.merchant_en, tx.merchant_he);
      if (tx.merchant_en !== canon) {
        tx.merchant_en = canon;
        changed += 1;
      }
    }
    if (rule?.category && tx.category_en !== rule.category) {
      tx.category_en = rule.category;
      changed += 1;
    }
  }
  return changed;
}

/** Finalize one statement after upload — does not touch other months. */
export async function finalizeStatementByKey(
  data: StatementsData,
  key: string,
  rules: MerchantRules,
  version: string,
): Promise<number> {
  const entry = data.statements[key];
  if (!entry) return 0;
  const changed = patchMerchantRulesOnReport(entry.report, rules);
  await persistFinalizedStatementAsync(entry, version);
  return changed;
}

/** Apply saved merchant rules to all statements and rebuild summaries (no Python call). */
export async function applyMerchantRules(
  data: StatementsData,
  rules: MerchantRules,
  version: string,
): Promise<number> {
  let changed = 0;
  for (const entry of Object.values(data.statements)) {
    changed += patchMerchantRulesOnReport(entry.report, rules);
    await persistFinalizedStatementAsync(entry, version);
  }
  return changed;
}

/** Re-run FX/refund normalization and rebuild summaries for all stored statements. */
export async function reprocessAllStatements(data: StatementsData): Promise<{ updated: number }> {
  const version = await getFinalizeVersion();
  let updated = 0;
  for (const entry of Object.values(data.statements)) {
    const before = JSON.stringify(entry.report.transactions);
    await persistFinalizedStatementAsync(entry, version);
    if (JSON.stringify(entry.report.transactions) !== before) {
      updated += 1;
    }
  }
  return { updated };
}
