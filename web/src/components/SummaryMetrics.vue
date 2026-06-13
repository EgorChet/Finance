<template>
  <div class="summary-metrics">
    <div class="metric-grid">
      <div class="metric-card metric-card-budget" :class="budgetClass">
        <div class="metric-label">Money left</div>
        <div class="metric-value">{{ formatIls(budgetLeft) }}</div>
        <p class="metric-budget-formula">
          {{ formatIls(MONTHLY_DISCRETIONARY_BUDGET) }} living budget − {{ formatIls(budgetSpent) }} used
        </p>
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
        <p class="metric-sub-note">Rent is not counted — paid outside this ₪12k.</p>
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
  MONTHLY_DISCRETIONARY_BUDGET,
} from "../utils/householdBudget";

const props = defineProps<{ report: SpendingReport }>();

const billingPeriod = computed(() => formatBillingPeriod(props.report.metadata));

const budgetBreakdown = computed(() => budgetSpendBreakdown(props.report.transactions));
const budgetSpent = computed(() => budgetBreakdown.value.spent);
const budgetEveryday = computed(() => budgetBreakdown.value.everyday);
const budgetDevInstitute = computed(() => budgetBreakdown.value.devInstitute);
const budgetCarLoan = computed(() => budgetBreakdown.value.carLoan);
const budgetLeft = computed(() => moneyLeft(props.report.transactions));
const budgetClass = computed(() => {
  if (budgetLeft.value < 0) return "metric-card-budget--over";
  if (budgetLeft.value <= MONTHLY_DISCRETIONARY_BUDGET * 0.2) return "metric-card-budget--low";
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
