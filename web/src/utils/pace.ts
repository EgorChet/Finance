import type { SpendingReport, Transaction, MonthItem } from "../types";
import { costTypeForCategory } from "../categories";
import type { ConfiguredCharge } from "./fixedCharges";
import { configuredChargesForCycle, sumConfiguredCharges } from "./fixedCharges";
import { billingCycleLabel, openCycleTabLabel, roundMoney } from "./format";

export interface BillingCycle {
  start: Date;
  end: Date;
  dayIndex: number;
  cycleLength: number;
}

export interface PaceBreakdownLine {
  label: string;
  amount: number;
  cyclesWith: number;
  configured: boolean;
}

export interface PaceCycleSnapshot {
  cycleStart: string;
  label: string;
  totalAtDay: number;
  fixedAtDay: number;
  variableAtDay: number;
}

export interface PaceConfiguredCharge {
  name_en: string;
  amount: number;
}

export interface PaceResult {
  currentSpend: number;
  statementSpend: number;
  manualSpend: number | null;
  manualEverydaySpend: number | null;
  configuredChargesTotal: number;
  configuredCharges: PaceConfiguredCharge[];
  dayIndex: number;
  cycleLength: number;
  historicalAvgAtDay: number;
  historicalAvgFixedAtDay: number;
  historicalAvgVariableAtDay: number;
  projectedTotal: number;
  score: number;
  scoreLabel: string;
  cyclesUsed: number;
  cyclesAvailable: number;
  avgCycles: number;
  vsAvgDelta: number;
  fixedBreakdown: PaceBreakdownLine[];
  variableBreakdown: PaceBreakdownLine[];
  recentCycles: PaceCycleSnapshot[];
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

function isFixedChargeTx(tx: Transaction): boolean {
  return costTypeForCategory(tx.category_en || "Uncategorized") === "fixed";
}

function isConfiguredCharge(tx: Transaction): boolean {
  return !!tx.notes?.startsWith("fixed_charge:");
}

interface CycleBucket {
  start: Date;
  end: Date;
  txs: Transaction[];
}

function spendAtDay(
  bucket: CycleBucket,
  dayIndex: number,
): {
  total: number;
  fixed: number;
  fixedByMerchant: Map<string, { amount: number; configured: boolean }>;
  variableByCategory: Map<string, number>;
} {
  let total = 0;
  let fixed = 0;
  const fixedByMerchant = new Map<string, { amount: number; configured: boolean }>();
  const variableByCategory = new Map<string, number>();

  for (const tx of bucket.txs) {
    const d = parseIsoDate(tx.date);
    const day = daysBetween(bucket.start, d) + 1;
    if (day > dayIndex) continue;
    total += tx.charge_amount;
    if (isFixedChargeTx(tx)) {
      fixed += tx.charge_amount;
      const label = tx.merchant_en || tx.merchant_he || "Unknown";
      const cur = fixedByMerchant.get(label) || { amount: 0, configured: isConfiguredCharge(tx) };
      cur.amount += tx.charge_amount;
      cur.configured = cur.configured || isConfiguredCharge(tx);
      fixedByMerchant.set(label, cur);
    } else {
      const cat = tx.category_en || "Uncategorized";
      variableByCategory.set(cat, (variableByCategory.get(cat) || 0) + tx.charge_amount);
    }
  }

  return {
    total: roundMoney(total),
    fixed: roundMoney(fixed),
    fixedByMerchant,
    variableByCategory,
  };
}

function averageBreakdown(
  buckets: CycleBucket[],
  dayIndex: number,
  kind: "fixed" | "variable",
  cyclesUsed: number,
): PaceBreakdownLine[] {
  const totals = new Map<string, { amount: number; cyclesWith: number; configured: boolean }>();

  for (const bucket of buckets) {
    const atDay = spendAtDay(bucket, dayIndex);
    const source =
      kind === "fixed" ? atDay.fixedByMerchant : atDay.variableByCategory;

    for (const [label, value] of source.entries()) {
      const amount = typeof value === "number" ? value : value.amount;
      const configured = typeof value === "number" ? false : value.configured;
      const cur = totals.get(label) || { amount: 0, cyclesWith: 0, configured: false };
      if (amount > 0) cur.cyclesWith += 1;
      cur.amount += amount;
      cur.configured = cur.configured || configured;
      totals.set(label, cur);
    }
  }

  return [...totals.entries()]
    .map(([label, v]) => ({
      label,
      amount: cyclesUsed ? roundMoney(v.amount / cyclesUsed) : 0,
      cyclesWith: v.cyclesWith,
      configured: v.configured,
    }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

export function computePace(
  transactions: Transaction[],
  options: {
    cycleDay?: number;
    includeFixed?: boolean;
    today?: Date;
    latestBillingDate?: string | null;
    manualSpend?: number | null;
    /** Most recent completed cycles to average; 0 = all available. */
    avgCycles?: number;
    configuredCharges?: ConfiguredCharge[];
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

  const historicalSnapshots: {
    start: Date;
    bucket: CycleBucket;
    total: number;
    fixed: number;
  }[] = [];
  for (const [key, bucket] of byCycle.entries()) {
    if (key === currentKey) continue;
    if (bucket.end >= todayNorm) continue;
    const atDay = spendAtDay(bucket, cycle.dayIndex);
    if (atDay.total > 0 || bucket.txs.length > 0) {
      historicalSnapshots.push({
        start: bucket.start,
        bucket,
        total: atDay.total,
        fixed: atDay.fixed,
      });
    }
  }

  historicalSnapshots.sort((a, b) => b.start.getTime() - a.start.getTime());
  const cyclesAvailable = historicalSnapshots.length;
  const avgCycles = options.avgCycles ?? 0;
  const usedSnapshots =
    avgCycles > 0 ? historicalSnapshots.slice(0, avgCycles) : historicalSnapshots;
  const usedBuckets = usedSnapshots.map((s) => s.bucket);
  const cyclesUsed = usedSnapshots.length;
  const historicalAtDay = usedSnapshots.map((s) => s.total);
  const historicalFixedAtDay = usedSnapshots.map((s) => s.fixed);
  const historicalVariableAtDay = usedSnapshots.map((s) => roundMoney(s.total - s.fixed));

  const fixedBreakdown = averageBreakdown(usedBuckets, cycle.dayIndex, "fixed", cyclesUsed);
  const variableBreakdown = averageBreakdown(usedBuckets, cycle.dayIndex, "variable", cyclesUsed);
  const recentCycles: PaceCycleSnapshot[] = usedSnapshots.map((s) => ({
    cycleStart: isoDate(s.start),
    label: billingCycleLabel(isoDate(s.start)),
    totalAtDay: s.total,
    fixedAtDay: s.fixed,
    variableAtDay: roundMoney(s.total - s.fixed),
  }));

  const currentBucket = byCycle.get(currentKey);
  let statementSpend = 0;
  if (currentBucket) {
    for (const tx of currentBucket.txs) {
      const d = parseIsoDate(tx.date);
      if (d <= todayNorm) statementSpend += tx.charge_amount;
    }
  }
  statementSpend = roundMoney(statementSpend);

  const cycleStartIso = isoDate(cycle.start);
  const configuredList = options.configuredCharges ?? [];
  const configuredCharges = configuredChargesForCycle(cycleStartIso, configuredList).map((c) => ({
    name_en: c.name_en,
    amount: c.amount,
  }));
  const configuredChargesTotal = sumConfiguredCharges(cycleStartIso, configuredList);

  const manualEveryday =
    options.manualSpend != null && options.manualSpend >= 0
      ? roundMoney(options.manualSpend)
      : null;

  let currentSpend = statementSpend;
  if (manualEveryday !== null) {
    currentSpend = includeFixed
      ? roundMoney(manualEveryday + configuredChargesTotal)
      : manualEveryday;
  }

  const historicalAvgAtDay =
    historicalAtDay.length > 0
      ? roundMoney(historicalAtDay.reduce((s, v) => s + v, 0) / historicalAtDay.length)
      : 0;
  const historicalAvgFixedAtDay =
    historicalFixedAtDay.length > 0
      ? roundMoney(historicalFixedAtDay.reduce((s, v) => s + v, 0) / historicalFixedAtDay.length)
      : 0;
  const historicalAvgVariableAtDay =
    historicalVariableAtDay.length > 0
      ? roundMoney(historicalVariableAtDay.reduce((s, v) => s + v, 0) / historicalVariableAtDay.length)
      : 0;

  const compareAvg = includeFixed ? historicalAvgAtDay : historicalAvgVariableAtDay;
  const vsAvgDelta = roundMoney(currentSpend - compareAvg);

  const projectedTotal =
    cycle.dayIndex > 0 ? roundMoney((currentSpend / cycle.dayIndex) * cycle.cycleLength) : currentSpend;

  let score = 50;
  if (compareAvg > 0 && currentSpend > 0) {
    score = Math.round(Math.min(100, Math.max(0, 50 * (compareAvg / currentSpend))));
  } else if (compareAvg > 0 && currentSpend === 0) {
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

  return {
    currentSpend,
    statementSpend,
    manualSpend: manualEveryday,
    manualEverydaySpend: manualEveryday,
    configuredChargesTotal,
    configuredCharges,
    dayIndex: cycle.dayIndex,
    cycleLength: cycle.cycleLength,
    historicalAvgAtDay,
    historicalAvgFixedAtDay,
    historicalAvgVariableAtDay,
    projectedTotal,
    score,
    scoreLabel,
    cyclesUsed: historicalAtDay.length,
    cyclesAvailable,
    avgCycles,
    vsAvgDelta,
    fixedBreakdown,
    variableBreakdown,
    recentCycles,
    cycleStart: isoDate(cycle.start),
    cycleEnd: isoDate(cycle.end),
    dataStale,
    latestBillingDate: latestBilling,
  };
}

export const CYCLE_DAY_KEY = "finance-cycle-day";
export const PACE_INCLUDE_FIXED_KEY = "finance-pace-include-fixed";
export const PACE_AVG_CYCLES_KEY = "finance-pace-avg-cycles";

/** 0 = average over all completed cycles. */
export const PACE_AVG_CYCLE_OPTIONS = [3, 6, 12, 0] as const;
export type PaceAvgCycles = (typeof PACE_AVG_CYCLE_OPTIONS)[number];

export function loadPaceAvgCycles(): PaceAvgCycles {
  const raw = localStorage.getItem(PACE_AVG_CYCLES_KEY);
  if (raw === null || raw === "") return 3;
  const n = parseInt(raw, 10);
  return (PACE_AVG_CYCLE_OPTIONS as readonly number[]).includes(n) ? (n as PaceAvgCycles) : 3;
}

export function savePaceAvgCycles(value: PaceAvgCycles): void {
  localStorage.setItem(PACE_AVG_CYCLES_KEY, String(value));
}

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

/** Statement for cycle starting `cycleStart` arrives on the next cycle's start date. */
export function nextCycleStart(cycleStart: string, cycleDay = 10): string {
  const d = parseIsoDate(cycleStart);
  const next = new Date(d.getFullYear(), d.getMonth() + 1, cycleDay);
  return isoDate(next);
}

/** True when no uploaded statement has closed this billing cycle yet. */
export function cycleNeedsOpenTab(
  latestBillingDate: string | null,
  cycleStart: string,
  cycleDay = 10,
): boolean {
  if (!latestBillingDate) return true;
  return parseIsoDate(latestBillingDate) < parseIsoDate(nextCycleStart(cycleStart, cycleDay));
}

/** True when no uploaded statement covers this billing cycle yet. */
export function shouldShowCurrentCycleMonth(
  latestBillingDate: string | null,
  cycleStart: string,
): boolean {
  return cycleNeedsOpenTab(latestBillingDate, cycleStart);
}

export function getOpenCycleMonthItems(
  cycleDay: number,
  latestBillingDate: string | null,
  today = new Date(),
): MonthItem[] {
  const norm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const currentStart = cycleStartForDate(norm, cycleDay);
  const starts: string[] = [];
  let start = currentStart;

  while (cycleNeedsOpenTab(latestBillingDate, start, cycleDay)) {
    starts.push(start);
    const prev = parseIsoDate(start);
    prev.setMonth(prev.getMonth() - 1);
    start = isoDate(prev);
    if (starts.length >= 3) break;
  }

  return starts
    .sort((a, b) => b.localeCompare(a))
    .map((s) => ({
      key: `${CYCLE_MONTH_PREFIX}${s}`,
      label: openCycleTabLabel(s),
      billing_date: s,
      inProgress: s === currentStart,
      pendingStatement: s !== currentStart,
    }));
}

export function getCurrentCycleMonthItem(
  cycleDay: number,
  today = new Date(),
): { key: string; label: string; billing_date: string; inProgress: true } {
  const norm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = cycleStartForDate(norm, cycleDay);
  return {
    key: `${CYCLE_MONTH_PREFIX}${start}`,
    label: openCycleTabLabel(start),
    billing_date: start,
    inProgress: true,
  };
}

export function isCycleEnded(cycleStart: string, cycleDay: number, today = new Date()): boolean {
  const norm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const { end } = getCycleRangeForStart(cycleStart, cycleDay);
  return norm > parseIsoDate(end);
}

export function mergeMonthsWithOpenCycles(
  months: MonthItem[],
  cycleDay: number,
  latestBillingDate: string | null,
): MonthItem[] {
  const openItems = getOpenCycleMonthItems(cycleDay, latestBillingDate);
  if (!openItems.length) return months;

  const toAdd = openItems.filter(
    (open) =>
      !months.some((m) => m.key === open.key || m.billing_date === open.billing_date),
  );
  if (!toAdd.length) return months;
  return [...toAdd, ...months];
}

/** @deprecated Use mergeMonthsWithOpenCycles */
export function mergeMonthsWithCurrentCycle(
  months: MonthItem[],
  cycleDay: number,
  latestBillingDate: string | null,
): MonthItem[] {
  return mergeMonthsWithOpenCycles(months, cycleDay, latestBillingDate);
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
    configuredCharges?: ConfiguredCharge[];
  } = {},
): SpendingReport {
  const includeFixed = options.includeFixed ?? true;
  const today = options.today ?? new Date();
  const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const { end: cycleEndIso } = getCycleRangeForStart(cycleStart, 10);
  const cycleEnded = todayNorm > parseIsoDate(cycleEndIso);
  const txs = transactionsInCycle(allTransactions, cycleStart, cycleEnd, todayNorm, includeFixed);
  const label = openCycleTabLabel(cycleStart);

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

  const manualEveryday =
    options.manualSpend != null && options.manualSpend >= 0
      ? roundMoney(options.manualSpend)
      : null;
  const configuredChargesTotal = sumConfiguredCharges(cycleStart, options.configuredCharges ?? []);
  const total =
    manualEveryday !== null
      ? cycleEnded || !includeFixed
        ? manualEveryday
        : roundMoney(manualEveryday + configuredChargesTotal)
      : statementTotal;

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
      in_progress: !cycleEnded,
      pending_statement: cycleEnded,
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
