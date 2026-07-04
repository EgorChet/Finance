import type { Transaction } from "@/shared/types";
import { rollupCategory } from "@/shared/categories";
import { formatIls, roundMoney } from "@/shared/utils/format";

export type SpendingPeriodMode = "ytd" | "rolling12";

export interface PeriodWindow {
  start: string;
  end: string;
  label: string;
}

export interface MonthlyPeriodTotal {
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
  avgPerMonth: number;
  priorAvgPerMonth: number;
  monthlyTotals: MonthlyPeriodTotal[];
  categories: CategoryPeriodRow[];
  transactionCount: number;
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
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function deltaPct(current: number, prior: number): number | null {
  if (prior <= 0) return current > 0 ? null : 0;
  return roundMoney(((current - prior) / prior) * 100);
}

function periodWindows(mode: SpendingPeriodMode, refDate: Date): { current: PeriodWindow; prior: PeriodWindow } {
  const end = normDate(refDate);
  if (mode === "ytd") {
    const start = new Date(end.getFullYear(), 0, 1);
    const priorEnd = new Date(end.getFullYear() - 1, end.getMonth(), end.getDate());
    const priorStart = new Date(end.getFullYear() - 1, 0, 1);
    const year = end.getFullYear();
    return {
      current: {
        start: isoDate(start),
        end: isoDate(end),
        label: `${year} (YTD)`,
      },
      prior: {
        start: isoDate(priorStart),
        end: isoDate(priorEnd),
        label: `${year - 1} (same period)`,
      },
    };
  }

  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 1);
  start.setDate(start.getDate() + 1);
  const priorEnd = new Date(start);
  priorEnd.setDate(priorEnd.getDate() - 1);
  const priorStart = new Date(priorEnd);
  priorStart.setFullYear(priorStart.getFullYear() - 1);
  priorStart.setDate(priorStart.getDate() + 1);

  return {
    current: {
      start: isoDate(start),
      end: isoDate(end),
      label: "Last 12 months",
    },
    prior: {
      start: isoDate(priorStart),
      end: isoDate(priorEnd),
      label: "Prior 12 months",
    },
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
  return roundMoney(transactions.reduce((sum, tx) => sum + tx.charge_amount, 0));
}

function categoryMap(transactions: Transaction[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const tx of transactions) {
    const cat = rollupCategory(tx.category_en);
    map.set(cat, roundMoney((map.get(cat) ?? 0) + tx.charge_amount));
  }
  return map;
}

function monthlyTotals(transactions: Transaction[], window: PeriodWindow): MonthlyPeriodTotal[] {
  const map = new Map<string, number>();
  for (const tx of transactions) {
    if (!transactionInWindow(tx, window)) continue;
    const key = tx.date.slice(0, 7);
    map.set(key, roundMoney((map.get(key) ?? 0) + tx.charge_amount));
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, total]) => ({ key, label: monthLabel(key), total }));
}

function monthsInWindow(window: PeriodWindow): number {
  const start = parseIsoDate(window.start);
  const end = parseIsoDate(window.end);
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  return Math.max(1, months);
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
): SpendingPeriodAnalysis {
  const { current, prior } = periodWindows(mode, refDate);
  const currentTxs = filterWindow(transactions, current);
  const priorTxs = filterWindow(transactions, prior);
  const currentTotal = sumTransactions(currentTxs);
  const priorTotal = sumTransactions(priorTxs);
  const currentMap = categoryMap(currentTxs);
  const priorMap = categoryMap(priorTxs);

  return {
    mode,
    current,
    prior,
    currentTotal,
    priorTotal,
    totalDelta: roundMoney(currentTotal - priorTotal),
    totalDeltaPct: deltaPct(currentTotal, priorTotal),
    avgPerMonth: roundMoney(currentTotal / monthsInWindow(current)),
    priorAvgPerMonth: roundMoney(priorTotal / monthsInWindow(prior)),
    monthlyTotals: monthlyTotals(transactions, current),
    categories: buildCategoryRows(currentMap, priorMap, currentTotal),
    transactionCount: currentTxs.length,
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
