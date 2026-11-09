/**
 * The Home screen's spending summary, as one pure function.
 *
 * The web app and the API (`GET /api/summary`) both call this, so the Telegram assistant
 * gets exactly the numbers the app shows: same cycle, same budget cap (salary + Cibus +
 * rent cover + one-off top-ups), same split into everyday spending and monthly bills,
 * same pace verdict.
 */
import type { MonthItem, SpendingReport, Transaction } from "./types.js";
import type { ConfiguredCharge } from "./household/fixedCharges.js";
import {
  budgetSpendBreakdown,
  dailyBudgetLeft,
  moneyLeft,
} from "./household/householdBudget.js";
import {
  cycleMonthYmForOverview,
  livingBudgetBaseForMonth,
  monthTopupExtraForMonth,
  normalizeLivingBudgetMonthTopup,
  normalizeLivingBudgetSegment,
  resolvedLivingBudget,
  type LivingBudgetMonthTopup,
  type LivingBudgetSegment,
} from "./household/livingBudget.js";
import {
  buildCycleReport,
  cycleNeedsOpenTab,
  cycleStartForDate,
  cycleStartForStatementBilling,
  cycleStartFromMonthKey,
  defaultOverviewMonthKey,
  findPartialMonth,
  formatOverviewMonthLabel,
  getBillingCycle,
  getCycleRangeForStart,
  isCycleMonthKey,
  mergeMonthsWithOpenCycles,
} from "./spending/pace.js";
import {
  effectiveManualCycleSpend,
  loadCycleDay,
  loadPaceIncludeFixed,
} from "./spending/paceSettings.js";
import { computeLiveBudgetPlan, type PaceHealthTone } from "./spending/paceHealth.js";
import type { BudgetPlan } from "./spending/budgetPlan.js";
import { roundMoney } from "./utils/format.js";

export interface SummaryInputs {
  months: MonthItem[];
  /** Multi-month report used for the usual-pace baseline (home-data `report`). */
  paceReport: SpendingReport | null;
  fixedCharges: ConfiguredCharge[];
  livingBudget: { segments: LivingBudgetSegment[]; month_topups?: LivingBudgetMonthTopup[] };
  referenceDate: Date;
  /** Month or open-cycle key; defaults to the one Home opens on. */
  monthKey?: string | null;
  /** Statement reports by month key (must include the requested month and any partial snapshot). */
  reports: Record<string, SpendingReport | undefined>;
}

export interface SpendingSummary {
  month_key: string | null;
  label: string;
  /** True while the billing cycle is still running. */
  open_cycle: boolean;
  cycle_start: string | null;
  cycle_end: string | null;
  days_left_in_cycle: number | null;
  living_budget: {
    cap: number | null;
    base: number | null;
    top_up: number;
  };
  spent: {
    total_on_card: number;
    counted_against_budget: number;
    everyday: number;
    rent: number;
    car_loan: number;
    dev_institute: number;
  };
  money_left: number | null;
  over_budget: boolean;
  daily_budget_left: number | null;
  /**
   * good = can keep spending the planned daily amount, warn = trim a little,
   * bad = cut hard or already over. See core/spending/budgetPlan.ts.
   */
  pace: PaceHealthTone | null;
  /** Headline for the colour, e.g. "On track" / "Slow down a little". */
  pace_status: string | null;
  /** Flexible money spread evenly over the cycle (budget − rent, loans, vaad bayit). */
  plan_per_day: number | null;
  /** Plan through yesterday − flexible spent. Positive = under plan. */
  plan_buffer: number | null;
  transaction_count: number;
  manual_spend_used: number | null;
}

function emptyReport(): SpendingReport {
  return {
    metadata: {},
    total_spent: 0,
    transaction_count: 0,
    date_range: ["", ""],
    by_category: [],
    top_merchants: [],
    unknown_merchants: [],
    transactions: [],
  };
}

export function computeSpendingSummary(input: SummaryInputs): SpendingSummary {
  const cycleDay = loadCycleDay();
  const refDate = input.referenceDate;
  const months = input.months;
  const segments = input.livingBudget.segments.map(normalizeLivingBudgetSegment);
  const topups = (input.livingBudget.month_topups || []).map(normalizeLivingBudgetMonthTopup);
  const monthKey = input.monthKey ?? defaultOverviewMonthKey(months, cycleDay, refDate);

  // Same report Home shows: an open cycle is rebuilt from the partial snapshot + manual entry.
  let report: SpendingReport = emptyReport();
  let cycleStart: string | null = null;
  let manualUsed: number | null = null;
  let partialSnapshot = false;
  if (monthKey && isCycleMonthKey(monthKey)) {
    cycleStart = cycleStartFromMonthKey(monthKey);
    const { end } = getCycleRangeForStart(cycleStart, cycleDay);
    const partial = findPartialMonth(months, cycleStart, cycleDay);
    const partialReport = partial ? input.reports[partial.key] : undefined;
    const txs: Transaction[] = partialReport?.transactions ?? [];
    manualUsed = effectiveManualCycleSpend(cycleStart, {
      statementSavedAt: partial?.saved_at ?? null,
      hasStatementSpend: Boolean(partialReport),
    });
    report = buildCycleReport(txs, cycleStart, end, {
      includeFixed: loadPaceIncludeFixed(),
      manualSpend: manualUsed,
      configuredCharges: input.fixedCharges,
    });
  } else if (monthKey) {
    report = input.reports[monthKey] ?? emptyReport();
    const month = months.find((m) => m.key === monthKey);
    if (month?.partial) {
      cycleStart = cycleStartForStatementBilling(month.billing_date, cycleDay);
      partialSnapshot = cycleNeedsOpenTab(cycleStart, cycleDay, months);
    }
  }

  const openCycle = Boolean(monthKey && (isCycleMonthKey(monthKey) || partialSnapshot));
  const cap = resolvedLivingBudget(monthKey, report, segments, cycleDay, topups, input.fixedCharges);
  const budgetYm = cycleMonthYmForOverview(monthKey, report, cycleDay);
  const base = livingBudgetBaseForMonth(budgetYm, segments, input.fixedCharges);
  const topUp = monthTopupExtraForMonth(budgetYm, topups);
  const breakdown = budgetSpendBreakdown(report.transactions);
  const left = cap !== null ? moneyLeft(report.transactions, cap) : null;

  let daysLeft: number | null = null;
  let cycleEnd: string | null = null;
  if (openCycle) {
    const { dayIndex, cycleLength } = getBillingCycle(refDate, cycleDay);
    daysLeft = cycleLength - dayIndex + 1;
    if (cycleStart) cycleEnd = getCycleRangeForStart(cycleStart, cycleDay).end;
  }

  let plan: BudgetPlan | null = null;
  if (openCycle && cap !== null) {
    plan = computeLiveBudgetPlan({
      cycleTransactions: report.transactions,
      cycleDay,
      cycleStart: cycleStart ?? cycleStartForDate(refDate, cycleDay),
      referenceDate: refDate,
      livingBudget: cap,
      history: input.paceReport?.transactions,
    });
  }

  const labels = mergeMonthsWithOpenCycles(months, cycleDay, refDate).map((m) =>
    formatOverviewMonthLabel(m, months, cycleDay, refDate),
  );

  return {
    month_key: monthKey,
    label: labels.find((m) => m.key === monthKey)?.label ?? monthKey ?? "",
    open_cycle: openCycle,
    cycle_start: cycleStart,
    cycle_end: cycleEnd,
    days_left_in_cycle: daysLeft,
    living_budget: { cap, base, top_up: roundMoney(topUp) },
    spent: {
      total_on_card: roundMoney(report.total_spent),
      counted_against_budget: breakdown.spent,
      everyday: breakdown.everyday,
      rent: breakdown.rent,
      car_loan: breakdown.carLoan,
      dev_institute: breakdown.devInstitute,
    },
    money_left: left,
    over_budget: left !== null && left < 0,
    daily_budget_left: plan
      ? plan.perDayLeft
      : left !== null && daysLeft
        ? dailyBudgetLeft(left, report.transactions, daysLeft)
        : null,
    pace: plan?.tone ?? null,
    pace_status: plan?.status ?? null,
    plan_per_day: plan?.planPerDay ?? null,
    plan_buffer: plan?.buffer ?? null,
    transaction_count: report.transaction_count,
    manual_spend_used: manualUsed,
  };
}
