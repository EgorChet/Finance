<template>
  <section class="home-card home-card-spending">
    <header class="home-card-head">
      <h3 class="home-card-title">Spending</h3>
      <span v-if="cycleLabel" class="home-card-meta">{{ cycleLabel }}</span>
    </header>
    <AppLoader v-if="loading" title="Loading spending" subtitle="Fetching this cycle" />
    <template v-else>
      <p v-if="error" class="home-card-error">{{ error }}</p>
      <template v-else-if="report">
        <div class="home-spend-metrics">
          <div class="home-spend-metric home-spend-metric--primary">
            <span class="home-spend-metric-label">Spent this cycle</span>
            <span class="home-spend-metric-value">
              {{ formatIls(report.total_spent) }}
              <span v-if="partial" class="home-spend-badge">partial</span>
            </span>
          </div>
          <div v-if="paceDayLabel" class="home-spend-metric">
            <span class="home-spend-metric-label">Cycle progress</span>
            <span class="home-spend-metric-value home-spend-metric-value--sm">{{ paceDayLabel }}</span>
          </div>
          <div v-if="paceUsualLabel" class="home-spend-metric">
            <span class="home-spend-metric-label">Your usual by now</span>
            <span class="home-spend-metric-value home-spend-metric-value--sm">{{ paceUsualLabel }}</span>
          </div>
          <div v-if="livingBudget != null" class="home-spend-metric">
            <span class="home-spend-metric-label">Living budget left</span>
            <span class="home-spend-metric-value home-spend-metric-value--sm" :class="budgetValueClass">
              {{ budgetDisplay }}
            </span>
          </div>
          <div v-else class="home-spend-metric">
            <span class="home-spend-metric-label">Living budget</span>
            <span class="home-spend-metric-value home-spend-metric-value--sm home-spend-metric-value--muted">
              Not set —
              <RouterLink class="home-spend-budget-link" to="/app/recurring#living-budget">configure</RouterLink>
            </span>
          </div>
        </div>

        <div v-if="paceLabel" class="home-spend-pace-box">
          <span class="home-spend-pace-badge" :class="paceBadgeClass">{{ paceLabel }}</span>
          <p class="home-spend-pace-detail">{{ paceDetail }}</p>
        </div>

        <div class="home-card-actions">
          <RouterLink class="btn btn-primary" :to="overviewLink">View full spending →</RouterLink>
          <RouterLink class="btn" to="/app/browse">Browse charges</RouterLink>
        </div>
      </template>
      <p v-else class="home-card-empty">Upload a statement to see spending for this cycle.</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppLoader from "../AppLoader.vue";
import type { SpendingReport } from "../../types";
import { formatIls } from "../../utils/format";
import { moneyLeft } from "../../utils/householdBudget";
import type { PaceResult } from "../../utils/pace";
import { paceDetailLine, paceShortLabel } from "../../utils/paceHero";

const props = defineProps<{
  loading: boolean;
  error?: string;
  report: SpendingReport | null;
  cycleLabel?: string;
  partial?: boolean;
  monthKey?: string | null;
  livingBudget?: number | null;
  pace?: PaceResult | null;
}>();

const overviewLink = computed(() => {
  if (!props.monthKey) return { name: "overview" as const };
  return { name: "overview" as const, query: { month: props.monthKey } };
});

const paceDayLabel = computed(() => {
  if (!props.pace) return "";
  return `Day ${props.pace.dayIndex} of ${props.pace.cycleLength}`;
});

const paceUsualLabel = computed(() => {
  if (!props.pace || props.pace.historicalAvgVariableAtDay <= 0) return "";
  return formatIls(props.pace.historicalAvgVariableAtDay);
});

const budgetLeft = computed(() => {
  if (props.livingBudget == null || !props.report) return null;
  return moneyLeft(props.report.transactions, props.livingBudget);
});

const budgetDisplay = computed(() => {
  if (budgetLeft.value == null || props.livingBudget == null) return "—";
  if (budgetLeft.value < 0) return `${formatIls(Math.abs(budgetLeft.value))} over`;
  return formatIls(budgetLeft.value);
});

const budgetValueClass = computed(() => {
  if (budgetLeft.value == null || props.livingBudget == null) return "";
  if (budgetLeft.value < 0) return "home-spend-metric-value--bad";
  if (budgetLeft.value <= props.livingBudget * 0.2) return "home-spend-metric-value--warn";
  return "";
});

const paceShort = computed(() => paceShortLabel(props.pace ?? null));
const paceLabel = computed(() => paceShort.value.label);
const paceBadgeClass = computed(() => `home-spend-pace-badge--${paceShort.value.tone}`);
const paceDetail = computed(() => paceDetailLine(props.pace ?? null));
</script>
