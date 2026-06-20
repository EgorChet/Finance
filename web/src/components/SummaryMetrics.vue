<template>
  <div class="summary-metrics">
    <div class="metric-grid">
      <div class="metric-card metric-card-budget" :class="budgetClass">
        <div class="metric-label">{{ budgetLabel }}</div>
        <div class="metric-value">{{ budgetDisplayValue }}</div>
        <p class="metric-budget-formula">{{ budgetFormula }}</p>
        <ul class="metric-budget-breakdown">
          <li>
            <span>Everyday</span>
            <span>{{ formatIls(budgetEveryday) }}</span>
          </li>
          <li v-if="budgetDevInstitute > 0">
            <span>Dev Institute</span>
            <span>{{ formatIls(budgetDevInstitute) }}</span>
          </li>
          <li v-if="budgetCarLoan > 0">
            <span>Car loan</span>
            <span>{{ formatIls(budgetCarLoan) }}</span>
          </li>
        </ul>
        <p class="metric-sub-note">
          Rent is not counted — paid outside this {{ formatIls(livingBudget) }} cap.
          <RouterLink class="metric-budget-edit-link" to="/app/recurring#living-budget">Edit budget</RouterLink>
        </p>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total spent</div>
        <div class="metric-value">{{ formatIls(report.total_spent) }}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Everyday spending</div>
        <div class="metric-value">{{ formatIls(everydayTotal) }}</div>
        <div class="metric-sub">{{ everydayPct }}% of card total</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Monthly bills</div>
        <div class="metric-value">{{ formatIls(monthlyBills) }}</div>
        <div class="metric-sub">{{ monthlyBillsPct }}% · rent, car loan, Dev Institute</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Transactions</div>
        <div class="metric-value">{{ report.transaction_count.toLocaleString() }}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Billing</div>
        <div class="metric-value metric-value-sm">
          {{ billingPeriod || "—" }}
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Statements</div>
        <div class="metric-value metric-value-sm">
          {{ (report.metadata.statement_count as number) || 1 }} month(s)
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { SpendingReport } from "../types";
import { formatBillingPeriod, formatIls } from "../utils/format";
import {
  budgetSpendBreakdown,
  everydaySpendingTotal,
  moneyLeft,
  monthlyBillsTotal,
} from "../utils/householdBudget";

const props = withDefaults(
  defineProps<{ report: SpendingReport; livingBudget: number; retrospective?: boolean }>(),
  { retrospective: false },
);

const billingPeriod = computed(() => formatBillingPeriod(props.report.metadata));

const budgetBreakdown = computed(() => budgetSpendBreakdown(props.report.transactions));
const budgetSpent = computed(() => budgetBreakdown.value.spent);
const budgetEveryday = computed(() => budgetBreakdown.value.everyday);
const budgetDevInstitute = computed(() => budgetBreakdown.value.devInstitute);
const budgetCarLoan = computed(() => budgetBreakdown.value.carLoan);
const budgetLeft = computed(() => moneyLeft(props.report.transactions, props.livingBudget));
const isOverBudget = computed(() => budgetLeft.value < 0);
const overAmount = computed(() => Math.abs(budgetLeft.value));

const budgetLabel = computed(() => {
  if (isOverBudget.value) return props.retrospective ? "Overspent" : "Over budget";
  if (props.retrospective) return "Under budget";
  return "Money left";
});

const budgetDisplayValue = computed(() =>
  isOverBudget.value ? formatIls(overAmount.value) : formatIls(budgetLeft.value),
);

const budgetFormula = computed(() => {
  const budget = formatIls(props.livingBudget);
  const spent = formatIls(budgetSpent.value);
  if (isOverBudget.value) {
    return `${budget} living budget − ${spent} used = ${formatIls(overAmount.value)} over`;
  }
  if (props.retrospective) {
    return `${budget} living budget − ${spent} used = ${formatIls(budgetLeft.value)} left`;
  }
  return `${budget} living budget − ${spent} used`;
});
const budgetClass = computed(() => {
  if (budgetLeft.value < 0) return "metric-card-budget--over";
  if (budgetLeft.value <= props.livingBudget * 0.2) return "metric-card-budget--low";
  return "metric-card-budget--ok";
});

const everydayTotal = computed(() => everydaySpendingTotal(props.report.transactions));
const monthlyBills = computed(() => monthlyBillsTotal(props.report.transactions));
const everydayPct = computed(() =>
  props.report.total_spent ? Math.round((everydayTotal.value / props.report.total_spent) * 100) : 0,
);
const monthlyBillsPct = computed(() =>
  props.report.total_spent ? Math.round((monthlyBills.value / props.report.total_spent) * 100) : 0,
);
</script>
