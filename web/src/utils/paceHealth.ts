import type { Transaction } from "../types";
import type { ConfiguredCharge } from "./fixedCharges";
import { everydaySpendingComposition } from "./householdBudget";
import type { LivingBudgetMonthTopup, LivingBudgetSegment } from "./livingBudget";
import {
  computePace,
  cycleStartForDate,
  effectiveManualCycleSpend,
  getBillingCycle,
  loadPaceAvgCycles,
  type PaceAvgCycles,
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
  /** Match PaceCard — defaults to 3 (same as loadPaceAvgCycles). */
  avgCycles?: PaceAvgCycles;
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
    avgCycles: options.avgCycles ?? 3,
    configuredCharges: options.configuredCharges ?? [],
    cycleTransactions,
    configuredEverydayCompare: everydaySpendingComposition(cycleTransactions).configuredTotal,
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

/** Single entry point for live-cycle pace coloring — keeps Home, Overview, and PaceCard in sync. */
export interface LivePaceHealthInput {
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
  cycleStart: string;
  statementSavedAt?: string | null;
  hasStatementSpend: boolean;
  partialStatementActive: boolean;
  cycleEverydaySpend?: number | null;
  avgCycles?: PaceAvgCycles;
}

export function computeLivePaceHealth(input: LivePaceHealthInput): PaceHealthTone | null {
  if (input.livingBudget == null || input.livingBudget <= 0) return null;

  return computePaceHealth({
    transactions: input.transactions,
    cycleTransactions: input.cycleTransactions,
    cycleDay: input.cycleDay,
    referenceDate: input.referenceDate,
    livingBudget: input.livingBudget,
    livingBudgetBase: input.livingBudgetBase,
    livingBudgetTopup: input.livingBudgetTopup,
    budgetSegments: input.budgetSegments,
    budgetMonthTopups: input.budgetMonthTopups,
    latestBillingDate: input.latestBillingDate,
    configuredCharges: input.configuredCharges,
    avgCycles: input.avgCycles ?? loadPaceAvgCycles(),
    cycleStart: input.cycleStart,
    cycleEverydaySpend: input.cycleEverydaySpend,
    manualSpend: input.partialStatementActive
      ? null
      : effectiveManualCycleSpend(input.cycleStart, {
          statementSavedAt: input.statementSavedAt ?? null,
          hasStatementSpend: input.hasStatementSpend,
        }),
  });
}

export type { PaceHealthTone };
