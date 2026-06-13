import type { Transaction } from "../types";
import { costTypeForCategory } from "../categories";
import { roundMoney } from "./format";

export interface BillingCycle {
  start: Date;
  end: Date;
  dayIndex: number;
  cycleLength: number;
}

export interface PaceResult {
  currentSpend: number;
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

/** Billing cycle from cycleDay to day before next cycleDay (e.g. 10th–9th). */
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
  let currentSpend = 0;
  if (currentBucket) {
    for (const tx of currentBucket.txs) {
      const d = parseIsoDate(tx.date);
      if (d <= todayNorm) currentSpend += tx.charge_amount;
    }
  }
  currentSpend = roundMoney(currentSpend);

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

  if (historicalAtDay.length === 0 && currentSpend === 0) return null;

  return {
    currentSpend,
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
