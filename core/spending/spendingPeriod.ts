import type { Transaction } from "../types.js";
import { rollupCategory } from "../categories.js";
import { formatIls, roundMoney } from "../utils/format.js";
import { effectiveSpend } from "../utils/transaction.js";
import { dateLocaleTag } from "../utils/displayLocale.js";
import { spendingSplit } from "./budgetPlan.js";
import { cycleStartForDate } from "./pace.js";

export type SpendingPeriodMode = "ytd" | "rolling12";

export interface PeriodWindow {
  start: string;
  end: string;
  label: string;
}

/** One billing cycle inside a period; the key is the cycle's start date. */
export interface CyclePeriodTotal {
  key: string;
  label: string;
  total: number;
}

export interface CategoryPeriodRow {
  category: string;
  current: number;
  prior: number;
  delta: number;
  deltaPct: number | null;
  sharePct: number;
}

export interface SpendingPeriodAnalysis {
  mode: SpendingPeriodMode;
  current: PeriodWindow;
  prior: PeriodWindow;
  currentTotal: number;
  priorTotal: number;
  totalDelta: number;
  totalDeltaPct: number | null;
  /** Average per billing cycle that has any charges. */
  avgPerCycle: number;
  priorAvgPerCycle: number;
  cycleTotals: CyclePeriodTotal[];
  categories: CategoryPeriodRow[];
  transactionCount: number;
  /** Billing cycles in the window that have any charges (statements don't cover every cycle). */
  cyclesWithData: number;
  priorCyclesWithData: number;
  /** The prior window has enough data for "vs before" to mean something. */
  priorComparable: boolean;
  /** Same split as the budget card. */
  everyday: number;
  fixed: number;
}

const CATEGORY_TREND_THRESHOLD = 50;

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

function normDate(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(dateLocaleTag(), { month: "short", year: "numeric" });
}

function deltaPct(current: number, prior: number): number | null {
  if (prior <= 0) return current > 0 ? null : 0;
  return roundMoney(((current - prior) / prior) * 100);
}

/**
 * Periods are whole billing cycles, not calendar months. A cycle starts on `cycleDay` and is named by
 * the month it starts in. "This year" runs from the first cycle that started in January; "12 cycles"
 * is the open cycle and the 11 before it. The comparison window is the same stretch one year earlier.
 */
function periodWindows(mode: SpendingPeriodMode, refDate: Date, cycleDay: number): { current: PeriodWindow; prior: PeriodWindow } {
  const end = normDate(refDate);
  const openStart = parseIsoDate(cycleStartForDate(end, cycleDay));
  const priorEnd = new Date(end.getFullYear() - 1, end.getMonth(), end.getDate());

  if (mode === "ytd") {
    const jan = new Date(end.getFullYear(), 0, cycleDay);
    // Early January, before the first cycle of the year has begun: show the cycle that is open.
    const start = jan <= end ? jan : openStart;
    const year = end.getFullYear();
    return {
      current: { start: isoDate(start), end: isoDate(end), label: `${year} (YTD)` },
      prior: {
        start: isoDate(new Date(start.getFullYear() - 1, start.getMonth(), start.getDate())),
        end: isoDate(priorEnd),
        label: `${year - 1} (same period)`,
      },
    };
  }

  const start = new Date(openStart.getFullYear(), openStart.getMonth() - 11, cycleDay);
  const priorStart = new Date(start.getFullYear() - 1, start.getMonth(), cycleDay);
  return {
    current: { start: isoDate(start), end: isoDate(end), label: "Last 12 cycles" },
    prior: { start: isoDate(priorStart), end: isoDate(priorEnd), label: "Prior 12 cycles" },
  };
}

export function transactionInWindow(tx: Transaction, window: PeriodWindow): boolean {
  const d = tx.date.slice(0, 10);
  return d >= window.start && d <= window.end;
}

function filterWindow(transactions: Transaction[], window: PeriodWindow): Transaction[] {
  return transactions.filter((tx) => transactionInWindow(tx, window));
}

function sumTransactions(transactions: Transaction[]): number {
  return roundMoney(transactions.reduce((sum, tx) => sum + effectiveSpend(tx), 0));
}

function categoryMap(transactions: Transaction[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const tx of transactions) {
    const cat = rollupCategory(tx.category_en);
    map.set(cat, roundMoney((map.get(cat) ?? 0) + effectiveSpend(tx)));
  }
  return map;
}

function cycleTotals(transactions: Transaction[], window: PeriodWindow, cycleDay: number): CyclePeriodTotal[] {
  const map = new Map<string, number>();
  for (const tx of transactions) {
    if (!transactionInWindow(tx, window)) continue;
    const key = cycleStartForDate(parseIsoDate(tx.date), cycleDay);
    map.set(key, roundMoney((map.get(key) ?? 0) + effectiveSpend(tx)));
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, total]) => ({ key, label: monthLabel(key.slice(0, 7)), total }));
}

/** Billing cycles that touch the window, whether or not they have charges. */
function cyclesInWindow(window: PeriodWindow, cycleDay: number): number {
  const first = parseIsoDate(cycleStartForDate(parseIsoDate(window.start), cycleDay));
  const last = parseIsoDate(cycleStartForDate(parseIsoDate(window.end), cycleDay));
  return Math.max(1, (last.getFullYear() - first.getFullYear()) * 12 + (last.getMonth() - first.getMonth()) + 1);
}

function cycleKeys(transactions: Transaction[], cycleDay: number): Set<string> {
  return new Set(transactions.map((tx) => cycleStartForDate(parseIsoDate(tx.date), cycleDay)));
}

function buildCategoryRows(
  currentMap: Map<string, number>,
  priorMap: Map<string, number>,
  currentTotal: number,
): CategoryPeriodRow[] {
  const names = new Set([...currentMap.keys(), ...priorMap.keys()]);
  return [...names]
    .map((category) => {
      const current = currentMap.get(category) ?? 0;
      const prior = priorMap.get(category) ?? 0;
      return {
        category,
        current,
        prior,
        delta: roundMoney(current - prior),
        deltaPct: deltaPct(current, prior),
        sharePct: currentTotal > 0 ? roundMoney((current / currentTotal) * 100) : 0,
      };
    })
    .sort((a, b) => b.current - a.current);
}

export function analyzeSpendingPeriod(
  transactions: Transaction[],
  mode: SpendingPeriodMode,
  refDate: Date,
  cycleDay = 10,
): SpendingPeriodAnalysis {
  const { current, prior } = periodWindows(mode, refDate, cycleDay);
  const currentTxs = filterWindow(transactions, current);
  const priorTxs = filterWindow(transactions, prior);
  const currentTotal = sumTransactions(currentTxs);
  const priorTotal = sumTransactions(priorTxs);
  const currentMap = categoryMap(currentTxs);
  const priorMap = categoryMap(priorTxs);
  const cyclesWithData = cycleKeys(currentTxs, cycleDay).size;
  const priorCyclesWithData = cycleKeys(priorTxs, cycleDay).size;
  const priorComparable = priorTotal > 0 && priorCyclesWithData >= Math.max(1, cyclesWithData * 0.75);
  const split = spendingSplit(currentTxs);

  return {
    mode,
    current,
    prior,
    currentTotal,
    priorTotal,
    totalDelta: roundMoney(currentTotal - priorTotal),
    totalDeltaPct: deltaPct(currentTotal, priorTotal),
    // Per cycle with data: a window the statements only partly cover isn't padded with zeros.
    avgPerCycle: roundMoney(currentTotal / Math.max(1, cyclesWithData || cyclesInWindow(current, cycleDay))),
    priorAvgPerCycle: roundMoney(priorTotal / Math.max(1, priorCyclesWithData || cyclesInWindow(prior, cycleDay))),
    cycleTotals: cycleTotals(transactions, current, cycleDay),
    categories: buildCategoryRows(currentMap, priorMap, currentTotal),
    transactionCount: currentTxs.length,
    cyclesWithData,
    priorCyclesWithData,
    priorComparable,
    everyday: split.everyday,
    fixed: split.fixed,
  };
}

export function formatPeriodDelta(delta: number, deltaPct: number | null): string {
  const amount = delta > 0 ? `+${formatIls(delta)}` : formatIls(delta);
  if (deltaPct == null) return amount;
  const pctSign = deltaPct > 0 ? "+" : "";
  return `${amount} (${pctSign}${Math.round(deltaPct)}%)`;
}

export function categoryTrendThreshold(): number {
  return CATEGORY_TREND_THRESHOLD;
}

export function categoriesTrendingUp(rows: CategoryPeriodRow[]): CategoryPeriodRow[] {
  return rows
    .filter((r) => r.current > 0 && r.delta >= CATEGORY_TREND_THRESHOLD)
    .sort((a, b) => b.delta - a.delta);
}

export function categoriesTrendingDown(rows: CategoryPeriodRow[]): CategoryPeriodRow[] {
  return rows
    .filter((r) => r.prior > 0 && r.delta <= -CATEGORY_TREND_THRESHOLD)
    .sort((a, b) => a.delta - b.delta);
}
