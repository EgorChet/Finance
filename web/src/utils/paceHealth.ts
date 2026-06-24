import type { Transaction } from "../types";
import type { ConfiguredCharge } from "./fixedCharges";
import type { LivingBudgetMonthTopup, LivingBudgetSegment } from "./livingBudget";
import {
  computePace,
  cycleStartForDate,
  getBillingCycle,
} from "./pace";
import {
  computePaceBudgetContext,
  paceHealthTone,
  type PaceHealthTone,
} from "./paceBudget";

export interface PaceHealthOptions {
  transactions: Transaction[];
  cycleTransactions: Transaction[];
  cycleDay: number;
  referenceDate: Date;
  livingBudget: number | null;
  livingBudgetBase?: number | null;
  livingBudgetTopup?: number;
  budgetSegments?: LivingBudgetSegment[];
  budgetMonthTopups?: LivingBudgetMonthTopup[];
  latestBillingDate?: string | null;
  configuredCharges?: ConfiguredCharge[];
  manualSpend?: number | null;
  cycleEverydaySpend?: number | null;
  cycleStart?: string;
}

export function computePaceHealth(options: PaceHealthOptions): PaceHealthTone | null {
  const { livingBudget, transactions, cycleTransactions, cycleDay, referenceDate } = options;
  if (livingBudget == null || livingBudget <= 0) return null;

  const norm = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const cycle = getBillingCycle(norm, cycleDay);
  const cycleStart = options.cycleStart ?? cycleStartForDate(norm, cycleDay);

  const statementOverride =
    options.cycleEverydaySpend != null && options.cycleEverydaySpend > 0
      ? options.cycleEverydaySpend
      : undefined;

  const pace = computePace(transactions, {
    cycleDay,
    includeFixed: false,
    latestBillingDate: options.latestBillingDate ?? null,
    manualSpend: options.manualSpend ?? null,
    configuredCharges: options.configuredCharges ?? [],
    statementSpendOverride: statementOverride,
    statementVariableOverride: statementOverride,
    today: referenceDate,
  });

  if (!pace || pace.historicalAvgAtDay <= 0 || pace.currentSpend <= 0) return null;

  const ctx = computePaceBudgetContext(
    cycleTransactions,
    livingBudget,
    pace.projectedTotal,
    pace.projectedAtUsualPaceForecast,
    {
      baseBudget: options.livingBudgetBase,
      topupExtra: options.livingBudgetTopup ?? 0,
      allTransactions: transactions,
      cycleStart,
      cycleDay,
      dayIndex: cycle.dayIndex,
      budgetSegments: options.budgetSegments ?? [],
      budgetMonthTopups: options.budgetMonthTopups ?? [],
    },
  );

  return paceHealthTone(ctx, pace.projectedVsUsualDelta);
}

export type { PaceHealthTone };
