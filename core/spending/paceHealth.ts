import type { Transaction } from "../types.js";
import { computeBudgetPlan, type BudgetPlan, type BudgetPlanTone } from "./budgetPlan.js";

export type PaceHealthTone = BudgetPlanTone;

/** Single entry point for live-cycle coloring — keeps Home, Overview, PaceCard and the API in sync. */
export interface LivePaceHealthInput {
  /** Transactions of the open cycle (incl. merged fixed charges / manual entry) — same list as Money left. */
  cycleTransactions: Transaction[];
  cycleDay: number;
  cycleStart: string;
  referenceDate: Date;
  livingBudget: number | null;
}

export function computeLiveBudgetPlan(input: LivePaceHealthInput): BudgetPlan | null {
  return computeBudgetPlan(input.cycleTransactions, input.livingBudget, {
    cycleStart: input.cycleStart,
    cycleDay: input.cycleDay,
    referenceDate: input.referenceDate,
  });
}

export function computeLivePaceHealth(input: LivePaceHealthInput): PaceHealthTone | null {
  return computeLiveBudgetPlan(input)?.tone ?? null;
}
