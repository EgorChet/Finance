import type { SpendingReport, Transaction, MonthItem } from "../types";
import { costTypeForCategory } from "../categories";
import { monthLabelFromIso, roundMoney } from "./format";

export interface BillingCycle {
  start: Date;
  end: Date;
  dayIndex: number;
  cycleLength: number;
}

export interface PaceResult {
  currentSpend: number;
  statementSpend: number;
  manualSpend: number | null;
  dayIndex: number;
  cycleLength: number;
  historicalAvgAtDay: number;
  projectedTotal: number;
  score: number;
  scoreLabel: string;
  cyclesUsed: number;
  cycleStart: string;
  cycleEnd: string;
  dataStale: boolean;
  latestBillingDate: string | null;
}

function parseIsoDate(dateStr: string): Date {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / 86400000);
}

export function getBillingCycle(date: Date, cycleDay: number): BillingCycle {
  let startYear = date.getFullYear();
  let startMonth = date.getMonth();
  if (date.getDate() < cycleDay) {
    startMonth -= 1;
    if (startMonth < 0) {
      startMonth = 11;
      startYear -= 1;
    }
  }
  const start = new Date(startYear, startMonth, cycleDay);
  const nextStart = new Date(startYear, startMonth + 1, cycleDay);
  const end = new Date(nextStart);
  end.setDate(end.getDate() - 1);
  const dayIndex = daysBetween(start, date) + 1;
  const cycleLength = daysBetween(start, end) + 1;
  return { start, end, dayIndex, cycleLength };
}

/** ISO date string for the start of the billing cycle containing `date`. */
export function cycleStartForDate(date: Date, cycleDay: number): string {
  return isoDate(getBillingCycle(date, cycleDay).start);
}

function cycleKey(start: Date): string {
  return isoDate(start);
}

function includeTransaction(tx: Transaction, includeFixed: boolean): boolean {
  if (includeFixed) return true;
  return costTypeForCategory(tx.category_en || "Uncategorized") !== "fixed";
}

export function computePace(
  transactions: Transaction[],
  options: {
    cycleDay?: number;
    includeFixed?: boolean;
    today?: Date;
    latestBillingDate?: string | null;
    manualSpend?: number | null;
  } = {},
): PaceResult | null {
  const cycleDay = options.cycleDay ?? 10;
  const includeFixed = options.includeFixed ?? true;
  const today = options.today ?? new Date();
  const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const cycle = getBillingCycle(todayNorm, cycleDay);
  const currentKey = cycleKey(cycle.start);

  const byCycle = new Map<string, { start: Date; end: Date; txs: Transaction[] }>();

  for (const tx of transactions) {
    if (!includeTransaction(tx, includeFixed)) continue;
    const d = parseIsoDate(tx.date);
    const txCycle = getBillingCycle(d, cycleDay);
    const key = cycleKey(txCycle.start);
    let bucket = byCycle.get(key);
    if (!bucket) {
      bucket = { start: txCycle.start, end: txCycle.end, txs: [] };
      byCycle.set(key, bucket);
    }
    bucket.txs.push(tx);
  }

  const historicalAtDay: number[] = [];
  for (const [key, bucket] of byCycle.entries()) {
    if (key === currentKey) continue;
    if (bucket.end >= todayNorm) continue;
    let cum = 0;
    for (const tx of bucket.txs) {
      const d = parseIsoDate(tx.date);
      const day = daysBetween(bucket.start, d) + 1;
      if (day <= cycle.dayIndex) cum += tx.charge_amount;
    }
    if (cum > 0 || bucket.txs.length > 0) historicalAtDay.push(roundMoney(cum));
  }

  const currentBucket = byCycle.get(currentKey);
  let statementSpend = 0;
  if (currentBucket) {
    for (const tx of currentBucket.txs) {
      const d = parseIsoDate(tx.date);
      if (d <= todayNorm) statementSpend += tx.charge_amount;
    }
  }
  statementSpend = roundMoney(statementSpend);

  const manual =
    options.manualSpend != null && options.manualSpend >= 0
      ? roundMoney(options.manualSpend)
      : null;
  const currentSpend = manual !== null ? manual : statementSpend;

  const historicalAvgAtDay =
    historicalAtDay.length > 0
      ? roundMoney(historicalAtDay.reduce((s, v) => s + v, 0) / historicalAtDay.length)
      : 0;

  const projectedTotal =
    cycle.dayIndex > 0 ? roundMoney((currentSpend / cycle.dayIndex) * cycle.cycleLength) : currentSpend;

  let score = 50;
  if (historicalAvgAtDay > 0 && currentSpend > 0) {
    score = Math.round(Math.min(100, Math.max(0, 50 * (historicalAvgAtDay / currentSpend))));
  } else if (historicalAvgAtDay > 0 && currentSpend === 0) {
    score = 100;
  }

  let scoreLabel = "On pace";
  if (score >= 60) scoreLabel = "Under pace";
  else if (score <= 40) scoreLabel = "Above pace";
  else if (score >= 55) scoreLabel = "Slightly under pace";
  else if (score <= 45) scoreLabel = "Slightly above pace";

  const latestBilling = options.latestBillingDate ?? null;
  const dataStale = latestBilling
    ? parseIsoDate(latestBilling) < cycle.start
    : false;

  if (historicalAtDay.length === 0 && currentSpend === 0 && manual === null) return null;

  return {
    currentSpend,
    statementSpend,
    manualSpend: manual,
    dayIndex: cycle.dayIndex,
    cycleLength: cycle.cycleLength,
    historicalAvgAtDay,
    projectedTotal,
    score,
    scoreLabel,
    cyclesUsed: historicalAtDay.length,
    cycleStart: isoDate(cycle.start),
    cycleEnd: isoDate(cycle.end),
    dataStale,
    latestBillingDate: latestBilling,
  };
}

export const CYCLE_DAY_KEY = "finance-cycle-day";
export const PACE_INCLUDE_FIXED_KEY = "finance-pace-include-fixed";

export function manualSpendKey(cycleStart: string): string {
  return `finance-pace-manual-${cycleStart}`;
}

export function loadManualCycleSpend(cycleStart: string): number | null {
  const raw = localStorage.getItem(manualSpendKey(cycleStart));
  if (raw === null || raw === "") return null;
  const n = parseFloat(raw);
  if (Number.isNaN(n) || n < 0) return null;
  return roundMoney(n);
}

export function saveManualCycleSpend(cycleStart: string, amount: number | null): void {
  if (amount === null || amount <= 0) {
    localStorage.removeItem(manualSpendKey(cycleStart));
  } else {
    localStorage.setItem(manualSpendKey(cycleStart), String(amount));
  }
}

export function loadCycleDay(): number {
  const raw = localStorage.getItem(CYCLE_DAY_KEY);
  const n = raw ? parseInt(raw, 10) : 10;
  return n >= 1 && n <= 28 ? n : 10;
}

export function saveCycleDay(day: number): void {
  localStorage.setItem(CYCLE_DAY_KEY, String(day));
}

export function loadPaceIncludeFixed(): boolean {
  const raw = localStorage.getItem(PACE_INCLUDE_FIXED_KEY);
  return raw === null ? true : raw === "true";
}

export function savePaceIncludeFixed(value: boolean): void {
  localStorage.setItem(PACE_INCLUDE_FIXED_KEY, String(value));
}

/** Prefix for month-picker keys that represent the live billing cycle (no statement yet). */
export const CYCLE_MONTH_PREFIX = "cycle:";

export function isCycleMonthKey(key: string | null): boolean {
  return !!key && key.startsWith(CYCLE_MONTH_PREFIX);
}

export function cycleStartFromMonthKey(key: string): string {
  return key.slice(CYCLE_MONTH_PREFIX.length);
}

export function currentCycleMonthKey(cycleDay: number, today = new Date()): string {
  const norm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return `${CYCLE_MONTH_PREFIX}${cycleStartForDate(norm, cycleDay)}`;
}

/** True when no uploaded statement covers this billing cycle yet. */
export function shouldShowCurrentCycleMonth(
  latestBillingDate: string | null,
  cycleStart: string,
): boolean {
  if (!latestBillingDate) return true;
  return parseIsoDate(latestBillingDate) < parseIsoDate(cycleStart);
}

export function getCurrentCycleMonthItem(
  cycleDay: number,
  today = new Date(),
): { key: string; label: string; billing_date: string; inProgress: true } {
  const norm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = cycleStartForDate(norm, cycleDay);
  return {
    key: `${CYCLE_MONTH_PREFIX}${start}`,
    label: monthLabelFromIso(start),
    billing_date: start,
    inProgress: true,
  };
}

export function mergeMonthsWithCurrentCycle(
  months: MonthItem[],
  cycleDay: number,
  latestBillingDate: string | null,
): MonthItem[] {
  const current = getCurrentCycleMonthItem(cycleDay);
  if (!shouldShowCurrentCycleMonth(latestBillingDate, current.billing_date)) {
    return months;
  }
  const exists = months.some(
    (m) => m.key === current.key || m.billing_date === current.billing_date,
  );
  if (exists) return months;
  return [current, ...months];
}

function transactionsInCycle(
  transactions: Transaction[],
  cycleStart: string,
  cycleEnd: string,
  today: Date,
  includeFixed: boolean,
): Transaction[] {
  const start = parseIsoDate(cycleStart);
  const end = parseIsoDate(cycleEnd);
  const cap = today < end ? today : end;
  return transactions.filter((tx) => {
    if (!includeTransaction(tx, includeFixed)) return false;
    const d = parseIsoDate(tx.date);
    return d >= start && d <= cap;
  });
}

export function getCycleRangeForStart(
  cycleStart: string,
  cycleDay: number,
): { start: string; end: string } {
  const cycle = getBillingCycle(parseIsoDate(cycleStart), cycleDay);
  return { start: isoDate(cycle.start), end: isoDate(cycle.end) };
}

/** Build an overview report for the in-progress billing cycle (client-side). */
export function buildCycleReport(
  allTransactions: Transaction[],
  cycleStart: string,
  cycleEnd: string,
  options: {
    includeFixed?: boolean;
    manualSpend?: number | null;
    today?: Date;
  } = {},
): SpendingReport {
  const includeFixed = options.includeFixed ?? true;
  const today = options.today ?? new Date();
  const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const txs = transactionsInCycle(allTransactions, cycleStart, cycleEnd, todayNorm, includeFixed);
  const label = monthLabelFromIso(cycleStart);

  const catTotals = new Map<string, { total: number; count: number; he: string | null }>();
  let statementTotal = 0;
  for (const tx of txs) {
    statementTotal += tx.charge_amount;
    const cat = tx.category_en || "Uncategorized";
    const cur = catTotals.get(cat) || { total: 0, count: 0, he: tx.category_he };
    cur.total += tx.charge_amount;
    cur.count += 1;
    catTotals.set(cat, cur);
  }
  statementTotal = roundMoney(statementTotal);

  const manual =
    options.manualSpend != null && options.manualSpend >= 0
      ? roundMoney(options.manualSpend)
      : null;
  const total = manual !== null ? manual : statementTotal;

  const by_category = [...catTotals.entries()]
    .map(([category_en, v]) => ({
      category_en,
      category_he: v.he,
      total: roundMoney(v.total),
      count: v.count,
      share_pct: total ? roundMoney((v.total / total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const dates = txs.map((t) => t.date).sort();

  return {
    metadata: {
      billing_date: cycleStart,
      in_progress: true,
      cycle_end: cycleEnd,
      month_label: label,
    },
    total_spent: total,
    transaction_count: txs.length,
    date_range: dates.length
      ? [dates[0], dates[dates.length - 1]]
      : [cycleStart, isoDate(todayNorm)],
    by_category,
    top_merchants: [],
    unknown_merchants: [],
    transactions: txs.map((tx) => ({ ...tx, billing_month: label })),
  };
}
