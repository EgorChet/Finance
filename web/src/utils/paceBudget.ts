import type { Transaction } from "../types";
import { budgetSpendBreakdown, moneyLeft } from "./householdBudget";
import type { LivingBudgetMonthTopup, LivingBudgetSegment } from "./livingBudget";
import { livingBudgetForMonth } from "./livingBudget";
import { formatAboutIls, formatIls, roundMoney } from "./format";
import { getCycleRangeForStart } from "./pace";

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
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

export function previousBillingCycleStart(cycleStart: string): string {
  const d = parseIsoDate(cycleStart);
  return isoDate(new Date(d.getFullYear(), d.getMonth() - 1, d.getDate()));
}

/** Discretionary spend on cap through day N of a billing cycle. */
export function spentOnCapThroughDay(
  transactions: Transaction[],
  cycleStart: string,
  cycleEnd: string,
  dayIndex: number,
): number {
  if (dayIndex <= 0) return 0;
  const start = parseIsoDate(cycleStart);
  const end = parseIsoDate(cycleEnd);
  const capped: Transaction[] = [];
  for (const tx of transactions) {
    const d = parseIsoDate(tx.date);
    if (d < start || d > end) continue;
    const day = daysBetween(start, d) + 1;
    if (day > dayIndex) continue;
    capped.push(tx);
  }
  return budgetSpendBreakdown(capped).spent;
}

export interface PaceBudgetContext {
  livingBudget: number;
  baseBudget: number;
  topupExtra: number;
  spentOnCap: number;
  moneyLeft: number;
  projectedEveryday: number;
  projectedSpentOnCap: number;
  projectedMoneyLeft: number;
  usualEverydayMonth: number;
  usualProjectedSpentOnCap: number;
  usualProjectedMoneyLeft: number;
  /** Last billing cycle cap (from budget settings that month). */
  lastCycleBudget: number | null;
  lastCycleSpentAtDay: number | null;
  lastCycleMoneyLeftAtDay: number | null;
  spentVsLastCycleAtDay: number | null;
  budgetVsLastCycle: number | null;
  /** Money left now minus money left at the same day last cycle. */
  moneyLeftVsLastCycle: number | null;
  projectedMoneyLeftAtLastCycleBudget: number | null;
  headroomFromHigherBudget: number | null;
  /** Month-end: projected left vs projected left at last cycle's cap. */
  projectedMoneyLeftVsLastCycleCap: number | null;
}

export function computePaceBudgetContext(
  cycleTransactions: Transaction[],
  livingBudget: number | null,
  projectedEveryday: number,
  usualEverydayMonth: number,
  options: {
    baseBudget?: number | null;
    topupExtra?: number;
    allTransactions?: Transaction[];
    cycleStart?: string;
    cycleDay?: number;
    dayIndex?: number;
    budgetSegments?: LivingBudgetSegment[];
    budgetMonthTopups?: LivingBudgetMonthTopup[];
  } = {},
): PaceBudgetContext | null {
  if (livingBudget === null || livingBudget <= 0) return null;

  const breakdown = budgetSpendBreakdown(cycleTransactions);
  const spentOnCap = breakdown.spent;
  const left = moneyLeft(cycleTransactions, livingBudget);
  const topupExtra = options.topupExtra ?? 0;
  const baseBudget =
    options.baseBudget != null && options.baseBudget > 0
      ? options.baseBudget
      : roundMoney(livingBudget - topupExtra);

  const projectedSpentOnCap = roundMoney(
    projectedEveryday + breakdown.devInstitute + breakdown.carLoan,
  );
  const projectedMoneyLeft = roundMoney(livingBudget - projectedSpentOnCap);

  const usualProjectedSpentOnCap = roundMoney(
    usualEverydayMonth + breakdown.devInstitute + breakdown.carLoan,
  );
  const usualProjectedMoneyLeft = roundMoney(livingBudget - usualProjectedSpentOnCap);

  let lastCycleBudget: number | null = null;
  let lastCycleSpentAtDay: number | null = null;
  let lastCycleMoneyLeftAtDay: number | null = null;
  let spentVsLastCycleAtDay: number | null = null;
  let budgetVsLastCycle: number | null = null;
  let moneyLeftVsLastCycle: number | null = null;
  let projectedMoneyLeftAtLastCycleBudget: number | null = null;
  let headroomFromHigherBudget: number | null = null;
  let projectedMoneyLeftVsLastCycleCap: number | null = null;

  const {
    allTransactions,
    cycleStart,
    cycleDay = 10,
    dayIndex = 0,
    budgetSegments = [],
    budgetMonthTopups = [],
  } = options;

  if (allTransactions?.length && cycleStart && dayIndex > 0) {
    const prevStart = previousBillingCycleStart(cycleStart);
    const { end: prevEnd } = getCycleRangeForStart(prevStart, cycleDay);
    const prevYm = prevStart.slice(0, 7);
    lastCycleBudget = livingBudgetForMonth(prevYm, budgetSegments, budgetMonthTopups);
    lastCycleSpentAtDay = spentOnCapThroughDay(allTransactions, prevStart, prevEnd, dayIndex);

    if (lastCycleBudget != null && lastCycleBudget > 0) {
      lastCycleMoneyLeftAtDay = roundMoney(lastCycleBudget - lastCycleSpentAtDay);
      spentVsLastCycleAtDay = roundMoney(spentOnCap - lastCycleSpentAtDay);
      budgetVsLastCycle = roundMoney(livingBudget - lastCycleBudget);
      moneyLeftVsLastCycle = roundMoney(left - lastCycleMoneyLeftAtDay);
      projectedMoneyLeftAtLastCycleBudget = roundMoney(lastCycleBudget - projectedSpentOnCap);
      headroomFromHigherBudget = roundMoney(projectedMoneyLeft - projectedMoneyLeftAtLastCycleBudget);
      projectedMoneyLeftVsLastCycleCap = headroomFromHigherBudget;
    }
  }

  return {
    livingBudget,
    baseBudget,
    topupExtra,
    spentOnCap,
    moneyLeft: left,
    projectedEveryday,
    projectedSpentOnCap,
    projectedMoneyLeft,
    usualEverydayMonth,
    usualProjectedSpentOnCap,
    usualProjectedMoneyLeft,
    lastCycleBudget,
    lastCycleSpentAtDay,
    lastCycleMoneyLeftAtDay,
    spentVsLastCycleAtDay,
    budgetVsLastCycle,
    moneyLeftVsLastCycle,
    projectedMoneyLeftAtLastCycleBudget,
    headroomFromHigherBudget,
    projectedMoneyLeftVsLastCycleCap,
  };
}

/** Plain-language budget line under the pace verdict. */
export function paceBudgetNote(
  ctx: PaceBudgetContext,
  projectedVsUsualDelta: number,
  dayIndex: number,
): string {
  const { projectedMoneyLeft, livingBudget, moneyLeftVsLastCycle, spentVsLastCycleAtDay, budgetVsLastCycle } =
    ctx;

  if (
    moneyLeftVsLastCycle != null &&
    spentVsLastCycleAtDay != null &&
    budgetVsLastCycle != null &&
    Math.abs(budgetVsLastCycle) >= 50
  ) {
    const spentPart =
      Math.abs(spentVsLastCycleAtDay) >= 50
        ? spentVsLastCycleAtDay > 0
          ? `${formatAboutIls(spentVsLastCycleAtDay)} more spent than day ${dayIndex} last cycle`
          : `${formatAboutIls(Math.abs(spentVsLastCycleAtDay))} less spent than day ${dayIndex} last cycle`
        : `about the same spend as day ${dayIndex} last cycle`;
    const budgetPart = `${formatAboutIls(Math.abs(budgetVsLastCycle))} higher budget`;
    if (moneyLeftVsLastCycle >= 50) {
      return `${spentPart}, but ${budgetPart} — ${formatAboutIls(moneyLeftVsLastCycle)} more left than last cycle at this point.`;
    }
    if (moneyLeftVsLastCycle <= -50) {
      return `${spentPart} and only ${formatAboutIls(Math.abs(budgetVsLastCycle))} higher budget — ${formatAboutIls(Math.abs(moneyLeftVsLastCycle))} less left than last cycle at this point.`;
    }
  }

  const overPace = projectedVsUsualDelta > 50;
  const injection =
    ctx.topupExtra > 0 ? ` (includes ${formatIls(ctx.topupExtra)} extra this month)` : "";

  if (!overPace) {
    if (projectedMoneyLeft >= 500) {
      return `On track for ~${formatAboutIls(projectedMoneyLeft)} left in your ${formatIls(livingBudget)} budget${injection}.`;
    }
    if (projectedMoneyLeft < -50) {
      if (ctx.headroomFromHigherBudget != null && ctx.headroomFromHigherBudget > 0) {
        return `Would finish ~${formatAboutIls(Math.abs(projectedMoneyLeft))} over this cycle's cap — ${formatAboutIls(ctx.headroomFromHigherBudget)} more room than last cycle's budget.`;
      }
      return `Would finish ~${formatAboutIls(Math.abs(projectedMoneyLeft))} over your ${formatIls(livingBudget)} budget.`;
    }
    return "";
  }

  if (projectedMoneyLeft >= 500) {
    return `Above your usual pace, but still ~${formatAboutIls(projectedMoneyLeft)} left in budget${injection}.`;
  }
  if (projectedMoneyLeft < -50) {
    if (ctx.headroomFromHigherBudget != null && ctx.headroomFromHigherBudget > 0) {
      return `Above usual pace — ~${formatAboutIls(Math.abs(projectedMoneyLeft))} over at month-end, but ${formatAboutIls(ctx.headroomFromHigherBudget)} more room than last cycle's ${formatIls(ctx.lastCycleBudget!)} cap.`;
    }
    return `Above usual pace and would finish ~${formatAboutIls(Math.abs(projectedMoneyLeft))} over your ${formatIls(livingBudget)} budget.`;
  }
  return `Above usual pace — only ~${formatAboutIls(Math.max(0, projectedMoneyLeft))} left in budget at month-end.`;
}
