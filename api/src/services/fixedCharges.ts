import { readFileSync } from "fs";
import path from "path";
import type { FixedCharge, FixedChargesData, SpendingReport, Transaction } from "../types.js";
import { readFixedCharges, writeFixedCharges } from "../storage/index.js";
import { monthLabelFromIso } from "../utils/dates.js";

const BUILTIN_PATH = path.resolve(
  process.env.DATA_DIR ? path.dirname(process.env.DATA_DIR) : path.join(process.cwd(), ".."),
  "data",
  "fixed_charges.json",
);

const ONGOING_THROUGH_MONTH = "2035-12";
const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isOneTime(charge: FixedCharge): boolean {
  return charge.schedule === "once";
}

/** Matches default pace card cycle start; configured charges land on this day each month. */
export const DEFAULT_BILLING_CYCLE_DAY = 10;

/** Inverse of statement billing date — cycle start for that statement (matches web pace utils). */
export function cycleStartForStatementBilling(billingDate: string, cycleDay = DEFAULT_BILLING_CYCLE_DAY): string {
  const [y, m] = billingDate.slice(0, 10).split("-").map(Number);
  const prev = new Date(y, m - 2, cycleDay);
  const day = Math.min(Math.max(cycleDay, 1), 28);
  const lastDay = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate();
  const safeDay = Math.min(day, lastDay);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

/** Billing-cycle month key (what users see as "Feb 2026"), not the statement charge month. */
export function cycleMonthKeyForBilling(billingDate: string, cycleDay = DEFAULT_BILLING_CYCLE_DAY): string {
  return cycleStartForStatementBilling(billingDate, cycleDay).slice(0, 7);
}
/** Pin recurring charges to the billing cycle start (e.g. 10th), not the statement close date. */
export function fixedChargeDateForBilling(
  billingDate: string,
  cycleDay = DEFAULT_BILLING_CYCLE_DAY,
): string {
  const [y, m] = billingDate.slice(0, 7).split("-").map(Number);
  const day = Math.min(Math.max(cycleDay, 1), 28);
  const lastDay = new Date(y, m, 0).getDate();
  const safeDay = Math.min(day, lastDay);
  return `${y}-${String(m).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

let cached: FixedCharge[] | null = null;

function loadBuiltinCharges(): FixedCharge[] {
  try {
    const raw = readFileSync(BUILTIN_PATH, "utf-8");
    const data = JSON.parse(raw) as { charges?: FixedCharge[] };
    return (data.charges || []).map(normalizeCharge);
  } catch {
    return [];
  }
}

function normalizeCharge(charge: FixedCharge): FixedCharge {
  const schedule = charge.schedule === "once" ? "once" : "monthly";
  const amount = Math.round(charge.amount * 100) / 100;
  let fromMonth = charge.from_month.trim();
  let throughMonth = charge.through_month.trim();
  let chargeDate = charge.charge_date?.trim().slice(0, 10);

  if (schedule === "once") {
    if (chargeDate && DATE_RE.test(chargeDate)) {
      const ym = chargeDate.slice(0, 7);
      fromMonth = ym;
      throughMonth = ym;
    }
  }

  return {
    id: charge.id.trim(),
    name_en: charge.name_en.trim(),
    name_he: charge.name_he?.trim() || undefined,
    amount,
    category_en: charge.category_en.trim(),
    from_month: fromMonth,
    through_month: throughMonth,
    schedule,
    charge_date: chargeDate,
  };
}

function mergeCharges(user: FixedChargesData): FixedCharge[] {
  if (user.charges?.length) return user.charges.map(normalizeCharge);
  return loadBuiltinCharges();
}

export async function refreshFixedChargesCache(): Promise<void> {
  const user = await readFixedCharges();
  cached = mergeCharges(user);
}

function ensureCache(): void {
  if (!cached) cached = loadBuiltinCharges();
}

export function loadFixedCharges(): FixedCharge[] {
  ensureCache();
  return cached!;
}

export function configuredChargesForMonth(billingYm: string): FixedCharge[] {
  const byId = new Map<string, FixedCharge>();
  for (const charge of loadFixedCharges()) {
    if (charge.from_month <= billingYm && billingYm <= charge.through_month) {
      byId.set(charge.id, charge);
    }
  }
  return [...byId.values()];
}

export function validateFixedCharges(charges: FixedCharge[]): string | null {
  for (const raw of charges) {
    const charge = normalizeCharge(raw);
    if (!charge.id) return "Each charge needs an id";
    if (!charge.name_en) return "Each charge needs an English name";
    if (!charge.category_en) return "Each charge needs a category";
    if (!Number.isFinite(charge.amount) || charge.amount <= 0) return "Amount must be positive";
    if (isOneTime(charge)) {
      if (!charge.charge_date || !DATE_RE.test(charge.charge_date)) {
        return `${charge.name_en}: one-time charges need a date (YYYY-MM-DD)`;
      }
      continue;
    }
    if (!MONTH_RE.test(charge.from_month) || !MONTH_RE.test(charge.through_month)) {
      return "Months must be YYYY-MM";
    }
    if (charge.from_month > charge.through_month) {
      return `${charge.name_en}: start month must be on or before end month`;
    }
  }
  return null;
}

export async function saveFixedCharges(charges: FixedCharge[]): Promise<FixedCharge[]> {
  const normalized = charges.map(normalizeCharge);
  const error = validateFixedCharges(normalized);
  if (error) throw new Error(error);
  await writeFixedCharges({ charges: normalized });
  cached = normalized;
  return normalized;
}


function chargesForBilling(billingDate: string | undefined, charges: FixedCharge[]): FixedCharge[] {
  const ym = billingDate ? cycleMonthKeyForBilling(billingDate) : null;
  if (!ym) return [];
  return charges.filter((c) => c.from_month <= ym && ym <= c.through_month);
}

function mergeCategorySummaries(report: SpendingReport): SpendingReport["by_category"] {
  const totals = new Map<string, { total: number; count: number; he: string | null }>();
  let grand = 0;
  for (const tx of report.transactions) {
    const cat = tx.category_en || "Uncategorized";
    grand += tx.charge_amount;
    const cur = totals.get(cat) || { total: 0, count: 0, he: tx.category_he };
    cur.total += tx.charge_amount;
    cur.count += 1;
    totals.set(cat, cur);
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

function topMerchants(report: SpendingReport): SpendingReport["top_merchants"] {
  const totals = new Map<string, { total: number; count: number; he: string; cat: string }>();
  for (const tx of report.transactions) {
    const key = tx.merchant_en || tx.merchant_he;
    const cur = totals.get(key) || {
      total: 0,
      count: 0,
      he: tx.merchant_he,
      cat: tx.category_en,
    };
    cur.total += tx.charge_amount;
    cur.count += 1;
    totals.set(key, cur);
  }
  return [...totals.entries()]
    .map(([merchant_en, v]) => ({
      merchant_en,
      merchant_he: v.he,
      category_en: v.cat,
      total: v.total,
      count: v.count,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);
}

export function augmentReport(report: SpendingReport): SpendingReport {
  const billingDate = report.metadata.billing_date as string | undefined;
  if (!billingDate) return report;

  const charges = chargesForBilling(billingDate, loadFixedCharges());
  if (!charges.length) return report;

  const cycleStart = cycleStartForStatementBilling(billingDate);
  const chargeById = new Map(charges.map((c) => [c.id, c]));
  const label = monthLabelFromIso(billingDate);

  const transactions = report.transactions.map((tx) => {
    if (!tx.notes?.startsWith("fixed_charge:")) return tx;
    const id = tx.notes.slice("fixed_charge:".length);
    const charge = chargeById.get(id);
    if (!charge) return tx;
    const chargeDate = isOneTime(charge) && charge.charge_date
      ? charge.charge_date
      : fixedChargeDateForBilling(cycleStart);
    return {
      ...tx,
      date: chargeDate,
      merchant_he: charge.name_he || charge.name_en,
      merchant_en: charge.name_en,
      amount: charge.amount,
      charge_amount: charge.amount,
      category_en: charge.category_en,
      billing_month: label,
    };
  });

  const existingIds = new Set(
    transactions
      .filter((tx) => tx.notes?.startsWith("fixed_charge:"))
      .map((tx) => tx.notes!.slice("fixed_charge:".length)),
  );

  const newTxs: Transaction[] = [];
  for (const charge of charges) {
    if (existingIds.has(charge.id)) continue;
    const chargeDate = isOneTime(charge) && charge.charge_date
      ? charge.charge_date
      : fixedChargeDateForBilling(cycleStart);
    newTxs.push({
      date: chargeDate,
      merchant_he: charge.name_he || charge.name_en,
      merchant_en: charge.name_en,
      amount: charge.amount,
      charge_amount: charge.amount,
      transaction_type_he: isOneTime(charge) ? "חיוב ידני" : "חיוב קבוע",
      category_he: null,
      category_en: charge.category_en,
      notes: `fixed_charge:${charge.id}`,
      merchant_known: true,
      billing_month: label,
    });
  }

  if (!newTxs.length && transactions.every((tx, i) => tx === report.transactions[i])) return report;

  const merged = [...transactions, ...newTxs].sort((a, b) => b.date.localeCompare(a.date));
  const dates = merged.map((t) => t.date).sort();
  const total = merged.reduce((s, t) => s + t.charge_amount, 0);
  const augmented: SpendingReport = {
    ...report,
    transactions: merged,
    total_spent: total,
    transaction_count: transactions.length,
    date_range: dates.length ? [dates[0], dates[dates.length - 1]] : report.date_range,
    by_category: [],
    top_merchants: [],
    unknown_merchants: report.unknown_merchants.filter(
      (m) => !newTxs.some((tx) => tx.merchant_he === m),
    ),
  };
  augmented.by_category = mergeCategorySummaries(augmented);
  augmented.top_merchants = topMerchants(augmented);
  return augmented;
}

/** Recompute totals and category/merchant summaries from current transactions. */
export function rebuildReportSummaries(report: SpendingReport): SpendingReport {
  const txs = report.transactions;
  const dates = txs.map((t) => t.date).sort();
  const total = txs.reduce((s, t) => s + t.charge_amount, 0);
  const updated: SpendingReport = {
    ...report,
    total_spent: total,
    transaction_count: txs.length,
    date_range: dates.length ? [dates[0], dates[dates.length - 1]] : report.date_range,
    by_category: [],
    top_merchants: [],
  };
  updated.by_category = mergeCategorySummaries(updated);
  updated.top_merchants = topMerchants(updated);
  return updated;
}

export { ONGOING_THROUGH_MONTH };
