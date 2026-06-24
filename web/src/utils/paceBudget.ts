import type { Transaction } from "../types";
import { budgetSpendBreakdown, moneyLeft } from "./householdBudget";
import { formatAboutIls, formatIls, roundMoney } from "./format";

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
}

export function computePaceBudgetContext(
  transactions: Transaction[],
  livingBudget: number | null,
  projectedEveryday: number,
  usualEverydayMonth: number,
  options: { baseBudget?: number | null; topupExtra?: number } = {},
): PaceBudgetContext | null {
  if (livingBudget === null || livingBudget <= 0) return null;

  const breakdown = budgetSpendBreakdown(transactions);
  const spentOnCap = breakdown.spent;
  const left = moneyLeft(transactions, livingBudget);
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
  };
}

/** Plain-language budget line under the pace verdict. */
export function paceBudgetNote(
  ctx: PaceBudgetContext,
  projectedVsUsualDelta: number,
): string {
  const { projectedMoneyLeft, topupExtra, livingBudget } = ctx;
  const overPace = projectedVsUsualDelta > 50;
  const injection =
    topupExtra > 0 ? ` (includes ${formatIls(topupExtra)} extra this month)` : "";

  if (!overPace) {
    if (projectedMoneyLeft >= 500) {
      return `On track for ~${formatAboutIls(projectedMoneyLeft)} left in your ${formatIls(livingBudget)} budget${injection}.`;
    }
    if (projectedMoneyLeft < -50) {
      return `Would finish ~${formatAboutIls(Math.abs(projectedMoneyLeft))} over your ${formatIls(livingBudget)} budget.`;
    }
    return "";
  }

  if (projectedMoneyLeft >= 500) {
    return `Above your usual pace, but still ~${formatAboutIls(projectedMoneyLeft)} left in budget${injection}.`;
  }
  if (projectedMoneyLeft < -50) {
    return `Above usual pace and would finish ~${formatAboutIls(Math.abs(projectedMoneyLeft))} over your ${formatIls(livingBudget)} budget.`;
  }
  return `Above usual pace — only ~${formatAboutIls(Math.max(0, projectedMoneyLeft))} left in budget at month-end.`;
}
