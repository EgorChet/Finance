import type { SpendingReport, Transaction } from "../types.js";
import { dedupeTransactionSnapshots, effectiveSpend } from "../utils/transaction.js";
import { monthLabelFromIso, roundMoney } from "../utils/format.js";

/**
 * Rebuild the multi-month history from per-month reports on the client, so the API
 * doesn't have to send every transaction twice (once per month, once combined).
 */
export function combineScopedReports(reports: SpendingReport[]): SpendingReport | null {
  if (!reports.length) return null;
  const ordered = [...reports].sort((a, b) =>
    String(a.metadata.billing_date ?? "").localeCompare(String(b.metadata.billing_date ?? "")),
  );
  if (ordered.length === 1) return ordered[0];

  const txs: Transaction[] = [];
  for (const r of ordered) {
    const billing = r.metadata.billing_date as string | undefined;
    const label = billing ? monthLabelFromIso(billing) : undefined;
    for (const tx of r.transactions) txs.push({ ...tx, billing_month: tx.billing_month || label });
  }
  const deduped = dedupeTransactionSnapshots(txs);
  deduped.sort((a, b) => b.date.localeCompare(a.date));

  const byCat = new Map<string, { he: string | null; total: number; count: number }>();
  let total = 0;
  for (const tx of deduped) {
    const amt = effectiveSpend(tx);
    total += amt;
    const cur = byCat.get(tx.category_en) ?? { he: tx.category_he, total: 0, count: 0 };
    cur.total += amt;
    cur.count += 1;
    byCat.set(tx.category_en, cur);
  }
  const dates = deduped.map((t) => t.date).sort();
  return {
    metadata: { ...ordered[ordered.length - 1].metadata, combined_client_side: true },
    total_spent: roundMoney(total),
    transaction_count: deduped.length,
    date_range: dates.length ? [dates[0], dates[dates.length - 1]] : ["", ""],
    by_category: [...byCat.entries()]
      .map(([category_en, v]) => ({
        category_en,
        category_he: v.he,
        total: roundMoney(v.total),
        count: v.count,
        share_pct: total ? roundMoney((v.total / total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total),
    top_merchants: [],
    unknown_merchants: [],
    transactions: deduped,
  };
}
