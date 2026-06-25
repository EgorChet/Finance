import type { SpendingReport, Transaction, MonthItem } from "../types";
import { costTypeForCategory } from "../categories";
import { isMonthlyBillTransaction, isConfiguredChargeTransaction } from "./householdBudget";
import type { ConfiguredCharge } from "./fixedCharges";
import {
  configuredChargesForCycle,
  configuredEverydayFromConfigAtDay,
  mergeConfiguredChargeTransactions,
  sumConfiguredCharges,
  sumConfiguredMonthlyBills,
} from "./fixedCharges";
import { billingCycleLabel, openCycleTabLabel, roundMoney } from "./format";
import { dedupeTransactionSnapshots, filterSpendTransactions } from "./transaction";

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
  /** Rent, car loan, etc. — not everyday categories like Cibus groceries. */
  projectedMonthlyBills: number;
  configuredMonthlyBills: number;
  /** Subscriptions & other fixed on card — 3-mo avg minus configured recurring. */
  projectedOtherFixed: number;
  /** Variable spend extrapolated to cycle end (× second-half weight). */
  projectedEveryday: number;
  projectedEverydayAtUsualPace: number;
  /** Same × second-half formula applied to your usual everyday spend at this day. */
  projectedAtUsualPaceForecast: number;
  /** Actual average full-cycle total from recent history (informational). */
  historicalActualMonthAvg: number;
  historicalActualBillsAvg: number;
  historicalActualEverydayAvg: number;
  /** Actual average full-cycle everyday from recent history (excludes monthly bills when in everyday mode). */
  historicalFullCycleEverydayAvg: number;
  projectedAtUsualPace: number;
  projectedVsUsualDelta: number;
  score: number;
  scoreLabel: string;
  cyclesUsed: number;
  cyclesAvailable: number;
  avgCycles: number;
  vsAvgDelta: number;
  fixedBreakdown: PaceBreakdownLine[];
  variableBreakdown: PaceBreakdownLine[];
  recentCycles: PaceCycleSnapshot[];
  /** Variable spend in recent cycles through tomorrow's day index in the billing month. */
  avgCyclesTomorrowVariable: number;
  avgCyclesTomorrowLabel: string;
  /** Second-half daily weight vs first half (1.0 = flat; from completed cycles). */
  secondHalfMultiplier: number;
  secondHalfFromHistory: boolean;
  secondHalfCalibrationCycles: number;
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

/** e.g. 13 Jun → 14 May (tomorrow's calendar day, one month earlier). */
export function previousMonthTomorrowDate(today: Date): Date {
  const norm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const tomorrow = new Date(norm.getFullYear(), norm.getMonth(), norm.getDate() + 1);
  return new Date(tomorrow.getFullYear(), tomorrow.getMonth() - 1, tomorrow.getDate());
}

function cycleKey(start: Date): string {
  return isoDate(start);
}

function includeTransaction(tx: Transaction, includeFixed: boolean): boolean {
  if (includeFixed) return true;
  return !isMonthlyBillTransaction(tx);
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

function fullCycleFixedTotal(bucket: CycleBucket): number {
  const cycleLength = daysBetween(bucket.start, bucket.end) + 1;
  return spendAtDay(bucket, cycleLength).fixed;
}

function fullCycleVariableTotal(bucket: CycleBucket): number {
  const cycleLength = daysBetween(bucket.start, bucket.end) + 1;
  const atEnd = spendAtDay(bucket, cycleLength);
  return roundMoney(atEnd.total - atEnd.fixed);
}

function fullCycleTotal(bucket: CycleBucket): number {
  return roundMoney(fullCycleFixedTotal(bucket) + fullCycleVariableTotal(bucket));
}

function variableThroughDay(bucket: CycleBucket, dayIndex: number): number {
  if (dayIndex <= 0) return 0;
  const at = spendAtDay(bucket, dayIndex);
  return roundMoney(at.total - at.fixed);
}

/** Visa export everyday spend through dayIndex — excludes configured extras and monthly bills. */
function statementEverydayAtDay(bucket: CycleBucket, dayIndex: number): number {
  if (dayIndex <= 0) return 0;
  let sum = 0;
  for (const tx of bucket.txs) {
    if (isMonthlyBillTransaction(tx) || isConfiguredChargeTransaction(tx)) continue;
    const d = parseIsoDate(tx.date);
    const day = daysBetween(bucket.start, d) + 1;
    if (day <= dayIndex) sum += tx.charge_amount;
  }
  return roundMoney(sum);
}

function everydaySpendAtDay(
  bucket: CycleBucket,
  dayIndex: number,
  charges: ConfiguredCharge[],
  cycleDay: number,
): number {
  const cycleStartIso = isoDate(bucket.start);
  const cycleEndIso = isoDate(bucket.end);
  return roundMoney(
    statementEverydayAtDay(bucket, dayIndex) +
      configuredEverydayFromConfigAtDay(cycleStartIso, cycleEndIso, dayIndex, charges, cycleDay),
  );
}

/** Fallback when no completed cycles to learn from — flat (linear) extrapolation. */
export const DEFAULT_SECOND_HALF_MULTIPLIER = 1;

/** Always learn second-half shape from this many most recent completed cycles. */
export const SECOND_HALF_CALIBRATION_CYCLES = 3;

function midpointDay(cycleLength: number): number {
  return Math.ceil(cycleLength / 2);
}

function dayWeight(dayIndex: number, cycleLength: number, secondHalfMultiplier: number): number {
  return dayIndex <= midpointDay(cycleLength) ? 1 : secondHalfMultiplier;
}

function totalCycleWeight(cycleLength: number, secondHalfMultiplier: number): number {
  const mid = midpointDay(cycleLength);
  const secondDays = cycleLength - mid;
  return mid + secondDays * secondHalfMultiplier;
}

function weightThroughDay(dayIndex: number, cycleLength: number, secondHalfMultiplier: number): number {
  if (dayIndex <= 0) return 0;
  const mid = midpointDay(cycleLength);
  if (dayIndex <= mid) return dayIndex;
  return mid + (dayIndex - mid) * secondHalfMultiplier;
}

/** Project variable spend to cycle end using first/second-half day weights. */
export function projectVariableWithCycleShape(
  spendSoFar: number,
  dayIndex: number,
  cycleLength: number,
  secondHalfMultiplier: number,
): number {
  if (dayIndex <= 0 || spendSoFar <= 0) return spendSoFar;
  const through = weightThroughDay(dayIndex, cycleLength, secondHalfMultiplier);
  if (through <= 0) return spendSoFar;
  const total = totalCycleWeight(cycleLength, secondHalfMultiplier);
  return roundMoney((spendSoFar / through) * total);
}

/** Learn second-half vs first-half daily rate from completed cycles. */
export function calibrateSecondHalfMultiplier(
  buckets: CycleBucket[],
  cycleLength: number,
): { multiplier: number; fromHistory: boolean } {
  const mid = midpointDay(cycleLength);
  const secondDays = cycleLength - mid;
  if (secondDays <= 0) {
    return { multiplier: DEFAULT_SECOND_HALF_MULTIPLIER, fromHistory: false };
  }

  const ratios: number[] = [];
  for (const bucket of buckets) {
    const len = daysBetween(bucket.start, bucket.end) + 1;
    const midB = midpointDay(len);
    const secondDaysB = len - midB;
    if (secondDaysB <= 0) continue;

    const firstSpend = variableThroughDay(bucket, midB);
    const fullVar = variableThroughDay(bucket, len);
    const secondSpend = roundMoney(fullVar - firstSpend);
    if (firstSpend <= 0 || secondSpend <= 0) continue;

    const firstDaily = firstSpend / midB;
    const secondDaily = secondSpend / secondDaysB;
    const ratio = secondDaily / firstDaily;
    if (Number.isFinite(ratio) && ratio > 0) ratios.push(ratio);
  }

  if (!ratios.length) {
    return { multiplier: DEFAULT_SECOND_HALF_MULTIPLIER, fromHistory: false };
  }
  const avg = ratios.reduce((s, v) => s + v, 0) / ratios.length;
  return { multiplier: roundMoney(avg * 100) / 100, fromHistory: true };
}

function extrapolateToFullCycle(
  spendAtDay: number,
  dayIndex: number,
  cycleLength: number,
  secondHalfMultiplier: number,
): number {
  if (dayIndex <= 0) return spendAtDay;
  return projectVariableWithCycleShape(spendAtDay, dayIndex, cycleLength, secondHalfMultiplier);
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
    /** When set (e.g. partial export totals), replaces cycle-bucket statement spend. */
    statementSpendOverride?: number | null;
    /** Everyday portion for projection when override total includes fixed categories. */
    statementVariableOverride?: number | null;
  } = {},
): PaceResult | null {
  const cycleDay = options.cycleDay ?? 10;
  const includeFixed = options.includeFixed ?? true;
  const today = options.today ?? new Date();
  const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const cycle = getBillingCycle(todayNorm, cycleDay);
  const currentKey = cycleKey(cycle.start);
  const configuredList = options.configuredCharges ?? [];

  const byCycle = new Map<string, { start: Date; end: Date; txs: Transaction[] }>();
  const byCycleAll = new Map<string, { start: Date; end: Date; txs: Transaction[] }>();

  for (const tx of transactions) {
    const d = parseIsoDate(tx.date);
    const txCycle = getBillingCycle(d, cycleDay);
    const key = cycleKey(txCycle.start);
    let bucketAll = byCycleAll.get(key);
    if (!bucketAll) {
      bucketAll = { start: txCycle.start, end: txCycle.end, txs: [] };
      byCycleAll.set(key, bucketAll);
    }
    bucketAll.txs.push(tx);
    if (!includeTransaction(tx, includeFixed)) continue;
    let bucket = byCycle.get(key);
    if (!bucket) {
      bucket = { start: txCycle.start, end: txCycle.end, txs: [] };
      byCycle.set(key, bucket);
    }
    bucket.txs.push(tx);
  }

  function historicalSnapshotsFrom(
    buckets: Map<string, { start: Date; end: Date; txs: Transaction[] }>,
  ) {
    const rows: { start: Date; bucket: CycleBucket; total: number; fixed: number }[] = [];
    for (const [key, bucket] of buckets.entries()) {
      if (key === currentKey) continue;
      if (bucket.end >= todayNorm) continue;
      const total = !includeFixed
        ? everydaySpendAtDay(bucket, cycle.dayIndex, configuredList, cycleDay)
        : spendAtDay(bucket, cycle.dayIndex).total;
      const atDay = spendAtDay(bucket, cycle.dayIndex);
      if (total > 0 || bucket.txs.length > 0) {
        rows.push({
          start: bucket.start,
          bucket,
          total,
          fixed: atDay.fixed,
        });
      }
    }
    rows.sort((a, b) => b.start.getTime() - a.start.getTime());
    return rows;
  }

  const historicalSnapshots = historicalSnapshotsFrom(byCycle);
  const historicalSnapshotsAll = historicalSnapshotsFrom(byCycleAll);
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

  const tomorrowNorm = new Date(todayNorm.getFullYear(), todayNorm.getMonth(), todayNorm.getDate() + 1);
  const tomorrowCycle = getBillingCycle(tomorrowNorm, cycleDay);
  const tomorrowDayIndex = tomorrowCycle.dayIndex;
  const tomorrowVariables = usedSnapshots.map((s) => {
    if (!includeFixed) {
      return everydaySpendAtDay(s.bucket, tomorrowDayIndex, configuredList, cycleDay);
    }
    const atDay = spendAtDay(s.bucket, tomorrowDayIndex);
    return roundMoney(atDay.total - atDay.fixed);
  });
  const avgCyclesTomorrowVariable =
    tomorrowVariables.length > 0
      ? roundMoney(tomorrowVariables.reduce((s, v) => s + v, 0) / tomorrowVariables.length)
      : 0;
  const avgCyclesTomorrowLabel = tomorrowNorm.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

  const currentBucket = byCycle.get(currentKey);
  let statementSpend = 0;
  if (currentBucket) {
    for (const tx of currentBucket.txs) {
      const d = parseIsoDate(tx.date);
      if (d <= todayNorm) statementSpend += tx.charge_amount;
    }
  }
  statementSpend = roundMoney(statementSpend);

  const manualEveryday =
    options.manualSpend != null && options.manualSpend >= 0
      ? roundMoney(options.manualSpend)
      : null;

  if (
    manualEveryday === null &&
    options.statementSpendOverride != null &&
    options.statementSpendOverride >= 0
  ) {
    statementSpend = roundMoney(options.statementSpendOverride);
  }

  const cycleStartIso = isoDate(cycle.start);
  const cycleEndIso = isoDate(cycle.end);
  const configuredCharges = configuredChargesForCycle(cycleStartIso, configuredList, cycleEndIso).map((c) => ({
    name_en: c.name_en,
    amount: c.amount,
  }));
  const configuredChargesTotal = sumConfiguredCharges(cycleStartIso, configuredList, cycleEndIso);
  const configuredMonthlyBills = sumConfiguredMonthlyBills(cycleStartIso, configuredList, cycleEndIso);

  let currentSpend = statementSpend;
  if (manualEveryday !== null) {
    currentSpend = includeFixed
      ? roundMoney(manualEveryday + configuredChargesTotal)
      : manualEveryday;
  } else if (
    includeFixed &&
    options.statementSpendOverride != null &&
    configuredChargesTotal > 0
  ) {
    currentSpend = roundMoney(statementSpend + configuredChargesTotal);
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

  const compareAvg = historicalAvgAtDay;
  const vsAvgDelta = roundMoney(currentSpend - compareAvg);

  // Fixed bills (rent, loans) land at cycle start — extrapolate variable spend only.
  let currentFixedAtDay = 0;
  let currentVariableAtDay = 0;
  if (manualEveryday !== null) {
    currentVariableAtDay = manualEveryday;
    currentFixedAtDay = includeFixed ? configuredChargesTotal : 0;
  } else if (options.statementVariableOverride != null) {
    currentVariableAtDay = roundMoney(options.statementVariableOverride);
    currentFixedAtDay = includeFixed
      ? roundMoney(Math.max(0, statementSpend - currentVariableAtDay))
      : 0;
  } else if (options.statementSpendOverride != null) {
    if (includeFixed) {
      currentFixedAtDay = roundMoney(Math.max(0, statementSpend - configuredChargesTotal));
      currentVariableAtDay = roundMoney(statementSpend - currentFixedAtDay);
    } else {
      currentVariableAtDay = statementSpend;
      currentFixedAtDay = 0;
    }
  } else if (currentBucket) {
    const atDay = spendAtDay(currentBucket, cycle.dayIndex);
    if (includeFixed) {
      currentFixedAtDay = atDay.fixed;
      currentVariableAtDay = roundMoney(atDay.total - atDay.fixed);
    } else {
      currentFixedAtDay = 0;
      currentVariableAtDay = atDay.total;
    }
  } else {
    currentVariableAtDay = currentSpend;
  }

  const fullCycleFixed = includeFixed
    ? manualEveryday !== null
      ? configuredChargesTotal
      : Math.max(currentFixedAtDay, configuredMonthlyBills)
    : 0;

  const calibrationSnapshots = historicalSnapshots.slice(0, SECOND_HALF_CALIBRATION_CYCLES);
  const calibrationBuckets = calibrationSnapshots.map((s) => s.bucket);
  const { multiplier: secondHalfMultiplier, fromHistory: secondHalfFromHistory } =
    calibrateSecondHalfMultiplier(calibrationBuckets, cycle.cycleLength);

  const projectedVariable =
    cycle.dayIndex > 0
      ? projectVariableWithCycleShape(
          currentVariableAtDay,
          cycle.dayIndex,
          cycle.cycleLength,
          secondHalfMultiplier,
        )
      : currentVariableAtDay;

  const usedFullSnapshots =
    avgCycles > 0 ? historicalSnapshotsAll.slice(0, avgCycles) : historicalSnapshotsAll;
  const historicalFullAvgFixedAtDay =
    usedFullSnapshots.length > 0
      ? roundMoney(
          usedFullSnapshots.reduce((s, row) => s + row.fixed, 0) / usedFullSnapshots.length,
        )
      : 0;
  const historicalFullCycleAvg =
    usedFullSnapshots.length > 0
      ? roundMoney(
          usedFullSnapshots.reduce((s, row) => s + fullCycleTotal(row.bucket), 0) /
            usedFullSnapshots.length,
        )
      : 0;
  const historicalFullCycleAvgFixed =
    usedFullSnapshots.length > 0
      ? roundMoney(
          usedFullSnapshots.reduce((s, row) => s + fullCycleFixedTotal(row.bucket), 0) /
            usedFullSnapshots.length,
        )
      : 0;
  const historicalFullCycleAvgEveryday =
    historicalFullCycleAvg > 0
      ? roundMoney(historicalFullCycleAvg - historicalFullCycleAvgFixed)
      : 0;

  function extrapolateHistoricalVariable(spendAtDay: number): number {
    return extrapolateToFullCycle(
      spendAtDay,
      cycle.dayIndex,
      cycle.cycleLength,
      secondHalfMultiplier,
    );
  }

  /** Recurring bills — configured charges, or typical full-cycle fixed if higher (incl. card subscriptions). */
  const projectionFixed = includeFixed
    ? fullCycleFixed
    : Math.max(configuredMonthlyBills, historicalFullCycleAvgFixed);

  const historicalFullCycleEverydayAvg =
    !includeFixed && usedSnapshots.length > 0
      ? roundMoney(
          usedSnapshots.reduce((s, row) => {
            const cycleLength = daysBetween(row.bucket.start, row.bucket.end) + 1;
            return s + everydaySpendAtDay(row.bucket, cycleLength, configuredList, cycleDay);
          }, 0) / usedSnapshots.length,
        )
      : 0;

  const projectedEveryday = projectedVariable;
  const usualAtDayBaseline = includeFixed ? historicalAvgVariableAtDay : historicalAvgAtDay;
  const projectedEverydayAtUsualPace = extrapolateHistoricalVariable(usualAtDayBaseline);

  let projectedTotal: number;
  if (!includeFixed && historicalFullCycleEverydayAvg > 0 && compareAvg > 0 && currentSpend > 0) {
    // Scale typical full-cycle everyday by how far ahead/behind you are now — avoids
    // extrapolating front-loaded subscriptions as if they repeat all month.
    projectedTotal = roundMoney(historicalFullCycleEverydayAvg * (currentSpend / compareAvg));
  } else if (includeFixed) {
    projectedTotal = roundMoney(projectionFixed + projectedEveryday);
  } else {
    projectedTotal = projectedEveryday;
  }

  const projectedOtherFixed = roundMoney(Math.max(0, projectionFixed - configuredMonthlyBills));

  const projectedAtUsualPaceForecast = includeFixed
    ? roundMoney(historicalAvgFixedAtDay + projectedEverydayAtUsualPace)
    : historicalFullCycleEverydayAvg > 0
      ? historicalFullCycleEverydayAvg
      : projectedEverydayAtUsualPace;
  const projectedVsUsualDelta = roundMoney(projectedTotal - projectedAtUsualPaceForecast);
  const historicalActualMonthAvg = historicalFullCycleAvg;
  const historicalActualEverydayAvg =
    !includeFixed && historicalFullCycleEverydayAvg > 0
      ? historicalFullCycleEverydayAvg
      : historicalFullCycleAvgEveryday;

  /** @deprecated Use projectedAtUsualPaceForecast for forecast comparisons. */
  const projectedAtUsualPace =
    !includeFixed && historicalFullCycleEverydayAvg > 0
      ? historicalFullCycleEverydayAvg
      : historicalFullCycleAvg > 0
        ? historicalFullCycleAvg
        : projectedAtUsualPaceForecast;

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
    projectedMonthlyBills: projectionFixed,
    configuredMonthlyBills,
    projectedOtherFixed,
    projectedEveryday,
    projectedEverydayAtUsualPace,
    projectedAtUsualPaceForecast,
    historicalFullCycleEverydayAvg,
    historicalActualMonthAvg,
    historicalActualBillsAvg: historicalFullCycleAvgFixed,
    historicalActualEverydayAvg,
    projectedAtUsualPace,
    projectedVsUsualDelta,
    score,
    scoreLabel,
    cyclesUsed: historicalAtDay.length,
    cyclesAvailable,
    avgCycles,
    vsAvgDelta,
    fixedBreakdown,
    variableBreakdown,
    recentCycles,
    avgCyclesTomorrowVariable,
    avgCyclesTomorrowLabel,
    secondHalfMultiplier,
    secondHalfFromHistory,
    secondHalfCalibrationCycles: SECOND_HALF_CALIBRATION_CYCLES,
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

/** Legacy plain-number entries are treated as older than any uploaded statement. */
const LEGACY_MANUAL_SAVED_AT = "1970-01-01T00:00:00.000Z";

export interface ManualCycleSpendEntry {
  amount: number;
  savedAt: string;
}

function parseManualCycleSpendEntry(raw: string): ManualCycleSpendEntry | null {
  if (!raw) return null;
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as { amount?: unknown; savedAt?: unknown };
      const amount = typeof parsed.amount === "number" ? parsed.amount : parseFloat(String(parsed.amount));
      const savedAt = typeof parsed.savedAt === "string" ? parsed.savedAt : "";
      if (Number.isNaN(amount) || amount < 0 || !savedAt) return null;
      return { amount: roundMoney(amount), savedAt };
    } catch {
      return null;
    }
  }
  const amount = parseFloat(raw);
  if (Number.isNaN(amount) || amount < 0) return null;
  return { amount: roundMoney(amount), savedAt: LEGACY_MANUAL_SAVED_AT };
}

export function loadManualCycleSpendEntry(cycleStart: string): ManualCycleSpendEntry | null {
  const raw = localStorage.getItem(manualSpendKey(cycleStart));
  if (raw === null || raw === "") return null;
  return parseManualCycleSpendEntry(raw);
}

export function loadManualCycleSpend(cycleStart: string): number | null {
  return loadManualCycleSpendEntry(cycleStart)?.amount ?? null;
}

export function saveManualCycleSpend(cycleStart: string, amount: number | null): void {
  if (amount === null || amount <= 0) {
    localStorage.removeItem(manualSpendKey(cycleStart));
    return;
  }
  const entry: ManualCycleSpendEntry = {
    amount: roundMoney(amount),
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(manualSpendKey(cycleStart), JSON.stringify(entry));
}

/** Manual bank-app entry only applies when no newer statement snapshot exists for this cycle. */
export function effectiveManualCycleSpend(
  cycleStart: string,
  options: {
    statementSavedAt?: string | null;
    hasStatementSpend?: boolean;
  } = {},
): number | null {
  const entry = loadManualCycleSpendEntry(cycleStart);
  if (!entry) return null;
  if (!options.hasStatementSpend) return entry.amount;

  const statementAt = options.statementSavedAt?.trim();
  if (!statementAt) return null;

  return entry.savedAt > statementAt ? entry.amount : null;
}

/** Drop manual entries superseded by a newer partial or final upload. */
export function pruneStaleManualCycleSpend(
  cycleStart: string,
  options: {
    statementSavedAt?: string | null;
    hasStatementSpend?: boolean;
  } = {},
): void {
  const entry = loadManualCycleSpendEntry(cycleStart);
  if (!entry) return;
  if (effectiveManualCycleSpend(cycleStart, options) !== null) return;
  localStorage.removeItem(manualSpendKey(cycleStart));
}

export function partialStatementSavedAtForCycle(
  months: MonthItem[],
  cycleStart: string,
  cycleDay = 10,
): string | null {
  return findPartialMonth(months, cycleStart, cycleDay)?.saved_at ?? null;
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

/** Statement billing date (charge date) for a cycle that starts on `cycleStart`. */
export function statementBillingDateForCycle(cycleStart: string, cycleDay = 10): string {
  return nextCycleStart(cycleStart, cycleDay);
}

/** Inverse of `statementBillingDateForCycle` — which cycle a statement bill belongs to. */
export function cycleStartForStatementBilling(billingDate: string, cycleDay = 10): string {
  const d = parseIsoDate(billingDate);
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, cycleDay);
  return isoDate(prev);
}

export function findPartialMonth(
  months: MonthItem[],
  cycleStart: string,
  cycleDay = 10,
): MonthItem | undefined {
  const billing = statementBillingDateForCycle(cycleStart, cycleDay);
  return months.find((m) => !isCycleMonthKey(m.key) && m.billing_date === billing && m.partial);
}

/** Skip the synthetic · now tab when a partial statement already covers that cycle. */
export function openCycleTabRedundant(
  openCycle: MonthItem,
  months: MonthItem[],
  cycleDay = 10,
): boolean {
  if (!openCycle.inProgress) return false;
  return !!findPartialMonth(months, openCycle.billing_date, cycleDay);
}

export function cycleHasFinalStatement(
  months: MonthItem[],
  cycleStart: string,
  cycleDay = 10,
): boolean {
  const billing = statementBillingDateForCycle(cycleStart, cycleDay);
  const stmt = months.find((m) => !isCycleMonthKey(m.key) && m.billing_date === billing);
  return !!stmt && !stmt.partial;
}

/** Latest billing date from a final (non-partial) uploaded statement. */
export function latestFinalBillingDate(months: MonthItem[]): string | null {
  const finals = months.filter((m) => !isCycleMonthKey(m.key) && !m.partial);
  if (!finals.length) return null;
  return [...finals].sort((a, b) => b.billing_date.localeCompare(a.billing_date))[0]!.billing_date;
}

/** True when no final uploaded statement has closed this billing cycle yet. */
export function cycleNeedsOpenTab(cycleStart: string, cycleDay: number, months: MonthItem[]): boolean {
  return !cycleHasFinalStatement(months, cycleStart, cycleDay);
}

/** @deprecated Pass `months` — partial statements no longer close the cycle. */
export function cycleNeedsOpenTabFromLatestBilling(
  latestBillingDate: string | null,
  cycleStart: string,
  cycleDay = 10,
): boolean {
  if (!latestBillingDate) return true;
  return parseIsoDate(latestBillingDate) < parseIsoDate(nextCycleStart(cycleStart, cycleDay));
}

/** True when no final uploaded statement covers this billing cycle yet. */
export function shouldShowCurrentCycleMonth(cycleStart: string, cycleDay: number, months: MonthItem[]): boolean {
  return cycleNeedsOpenTab(cycleStart, cycleDay, months);
}

export function getOpenCycleMonthItems(
  cycleDay: number,
  months: MonthItem[],
  today = new Date(),
): MonthItem[] {
  const norm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const currentStart = cycleStartForDate(norm, cycleDay);
  const starts: string[] = [];
  let start = currentStart;

  while (cycleNeedsOpenTab(start, cycleDay, months)) {
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
  today = new Date(),
): MonthItem[] {
  const openItems = getOpenCycleMonthItems(cycleDay, months, today);
  if (!openItems.length) return months;

  const toAdd = openItems.filter((open) => {
    if (months.some((m) => m.key === open.key)) return false;
    if (openCycleTabRedundant(open, months, cycleDay)) return false;
    return true;
  });
  if (!toAdd.length) return months;
  return [...toAdd, ...months];
}

/** Which month pill to select on load — newest activity first, partial counts as latest. */
export function defaultOverviewMonthKey(
  months: MonthItem[],
  cycleDay: number,
  today = new Date(),
): string | null {
  const merged = mergeMonthsWithOpenCycles(months, cycleDay, today);
  const todayStart = cycleStartForDate(today, cycleDay);

  if (cycleNeedsOpenTab(todayStart, cycleDay, months)) {
    const partial = findPartialMonth(months, todayStart, cycleDay);
    if (partial) return partial.key;
    const openTab = merged.find((m) => m.inProgress);
    if (openTab) return openTab.key;
  }

  const statements = months.filter((m) => !isCycleMonthKey(m.key));
  if (statements.length) {
    const latest = [...statements].sort((a, b) => b.billing_date.localeCompare(a.billing_date))[0];
    if (latest) return latest.key;
  }

  return merged[0]?.key ?? null;
}

/** @deprecated Use mergeMonthsWithOpenCycles(months, cycleDay) */
export function mergeMonthsWithCurrentCycle(
  months: MonthItem[],
  cycleDay: number,
  _latestBillingDate: string | null,
): MonthItem[] {
  return mergeMonthsWithOpenCycles(months, cycleDay);
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
  const label = openCycleTabLabel(cycleStart);
  let txs = dedupeTransactionSnapshots(
    filterSpendTransactions(
      transactionsInCycle(allTransactions, cycleStart, cycleEnd, todayNorm, includeFixed),
    ),
  );
  txs = mergeConfiguredChargeTransactions(
    txs,
    cycleStart,
    cycleEnd,
    options.configuredCharges ?? [],
    label,
  );
  txs = transactionsInCycle(txs, cycleStart, cycleEnd, todayNorm, includeFixed);

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
  const configuredChargesTotal = sumConfiguredCharges(cycleStart, options.configuredCharges ?? [], cycleEnd);
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
