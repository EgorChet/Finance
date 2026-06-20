<template>
  <section class="home-card">
    <header class="home-card-head">
      <h3 class="home-card-title">Spending</h3>
      <span v-if="cycleLabel" class="home-card-meta">{{ cycleLabel }}</span>
    </header>
    <AppLoader v-if="loading" title="Loading spending" subtitle="Fetching this cycle" />
    <template v-else>
      <p v-if="error" class="home-card-error">{{ error }}</p>
      <template v-else-if="report">
        <p class="home-spend-total">
          <span class="home-spend-amount">{{ formatIls(report.total_spent) }}</span>
          <span class="home-spend-label"> so far</span>
          <span v-if="partial" class="home-spend-badge">partial</span>
        </p>
        <p class="home-pace-line" :class="paceToneClass">{{ paceLine }}</p>
        <p v-if="paceSub" class="home-pace-sub">{{ paceSub }}</p>
        <p v-if="budgetLine" class="home-budget-line" :class="budgetClass">{{ budgetLine }}</p>
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
import type { PaceHeroTone } from "../../utils/paceHero";

const props = defineProps<{
  loading: boolean;
  error?: string;
  report: SpendingReport | null;
  cycleLabel?: string;
  partial?: boolean;
  monthKey?: string | null;
  livingBudget?: number | null;
  paceLine: string;
  paceSub?: string;
  paceTone?: PaceHeroTone;
}>();

const overviewLink = computed(() => {
  if (!props.monthKey) return "/app/overview";
  return `/app/overview?month=${encodeURIComponent(props.monthKey)}`;
});

const budgetLine = computed(() => {
  if (props.livingBudget == null || !props.report) return "";
  const left = moneyLeft(props.report.transactions, props.livingBudget);
  if (left < 0) return `Over living budget by ${formatIls(Math.abs(left))}`;
  return `${formatIls(left)} left of ${formatIls(props.livingBudget)} living budget`;
});

const budgetClass = computed(() => {
  if (props.livingBudget == null || !props.report) return "";
  const left = moneyLeft(props.report.transactions, props.livingBudget);
  if (left < 0) return "home-budget-line--over";
  if (left <= props.livingBudget * 0.2) return "home-budget-line--low";
  return "home-budget-line--ok";
});

const paceToneClass = computed(() => {
  const tone = props.paceTone ?? "ok";
  return `home-pace-line--${tone}`;
});
</script>
