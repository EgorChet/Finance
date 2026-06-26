<template>
  <section class="spending-period">
    <p class="spending-period-lead">
      {{ analysis.current.label }}
      <span class="spending-period-lead-sep">·</span>
      {{ formatRange(analysis.current) }}
      <span class="spending-period-lead-sep">·</span>
      vs {{ analysis.prior.label.toLowerCase() }}
    </p>

    <div class="spending-period-metrics">
      <div class="spending-period-metric spending-period-metric--hero">
        <span class="spending-period-metric-label">Total spent</span>
        <span class="spending-period-metric-value">{{ formatIls(analysis.currentTotal) }}</span>
        <span class="spending-period-metric-sub" :class="trendClass(analysis.totalDelta)">
          {{ formatPeriodDelta(analysis.totalDelta, analysis.totalDeltaPct) }} vs prior period
        </span>
      </div>
      <div class="spending-period-metric">
        <span class="spending-period-metric-label">Avg / month</span>
        <span class="spending-period-metric-value spending-period-metric-value--sm">
          {{ formatIls(analysis.avgPerMonth) }}
        </span>
        <span class="spending-period-metric-sub" :class="trendClass(analysis.avgPerMonth - analysis.priorAvgPerMonth)">
          was {{ formatIls(analysis.priorAvgPerMonth) }}
        </span>
      </div>
      <div class="spending-period-metric">
        <span class="spending-period-metric-label">Charges</span>
        <span class="spending-period-metric-value spending-period-metric-value--sm">
          {{ analysis.transactionCount.toLocaleString() }}
        </span>
        <span class="spending-period-metric-sub">in this window</span>
      </div>
    </div>

    <MonthlyTrendChart v-if="analysis.monthlyTotals.length > 1" :summary="chartSummary" />

    <div class="spending-period-grid">
      <section class="spending-period-card">
        <h3 class="spending-period-card-title">Top categories</h3>
        <ul v-if="topCategories.length" class="spending-period-list">
          <li v-for="row in topCategories" :key="row.category" class="spending-period-row">
            <div class="spending-period-row-main">
              <span class="spending-period-row-label">{{ row.category }}</span>
              <span class="spending-period-row-meta">{{ row.sharePct }}% of spend</span>
            </div>
            <div class="spending-period-row-values">
              <span class="spending-period-row-amount">{{ formatIls(row.current) }}</span>
              <span class="spending-period-row-delta" :class="trendClass(row.delta)">
                {{ formatPeriodDelta(row.delta, row.deltaPct) }}
              </span>
            </div>
          </li>
        </ul>
        <p v-else class="spending-period-empty">No categorized spending in this period.</p>
      </section>

      <section v-if="trendingUp.length" class="spending-period-card">
        <h3 class="spending-period-card-title">Spending up</h3>
        <ul class="spending-period-list">
          <li v-for="row in trendingUp" :key="`up-${row.category}`" class="spending-period-row">
            <span class="spending-period-row-label">{{ row.category }}</span>
            <span class="spending-period-row-delta spending-period-trend--up">
              +{{ formatIls(row.delta) }}
            </span>
          </li>
        </ul>
      </section>

      <section v-if="trendingDown.length" class="spending-period-card">
        <h3 class="spending-period-card-title">Spending down</h3>
        <ul class="spending-period-list">
          <li v-for="row in trendingDown" :key="`down-${row.category}`" class="spending-period-row">
            <span class="spending-period-row-label">{{ row.category }}</span>
            <span class="spending-period-row-delta spending-period-trend--down">
              {{ formatIls(row.delta) }}
            </span>
          </li>
        </ul>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import MonthlyTrendChart from "./MonthlyTrendChart.vue";
import { formatIls } from "../utils/format";
import {
  categoriesTrendingDown,
  categoriesTrendingUp,
  formatPeriodDelta,
  type SpendingPeriodAnalysis,
} from "../utils/spendingPeriod";

const props = defineProps<{
  analysis: SpendingPeriodAnalysis;
}>();

const topCategories = computed(() => props.analysis.categories.filter((r) => r.current > 0).slice(0, 8));
const trendingUp = computed(() => categoriesTrendingUp(props.analysis.categories).slice(0, 6));
const trendingDown = computed(() => categoriesTrendingDown(props.analysis.categories).slice(0, 6));

const chartSummary = computed(() =>
  props.analysis.monthlyTotals.map((m) => ({ month: m.label, total: m.total })),
);

function formatRange(window: { start: string; end: string }): string {
  const fmt = (iso: string) =>
    parseIsoDate(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${fmt(window.start)} – ${fmt(window.end)}`;
}

function parseIsoDate(dateStr: string): Date {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function trendClass(delta: number): string {
  if (delta > 50) return "spending-period-trend--up";
  if (delta < -50) return "spending-period-trend--down";
  return "spending-period-trend--flat";
}
</script>
