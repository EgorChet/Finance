<template>
  <div class="summary-metrics">
    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-label">Total spent</div>
        <div class="metric-value">{{ formatIls(report.total_spent) }}</div>
      </div>
      <button
        type="button"
        class="metric-card metric-card-clickable"
        :class="{ active: selectedBucket === 'fixed' }"
        @click="toggleBucket('fixed')"
      >
        <div class="metric-label">{{ COST_BUCKETS.fixed.label }}</div>
        <div class="metric-value">{{ formatIls(fixedTotal) }}</div>
        <div class="metric-sub">{{ fixedPct }}% · tap to see breakdown</div>
      </button>
      <button
        type="button"
        class="metric-card metric-card-clickable"
        :class="{ active: selectedBucket === 'variable' }"
        @click="toggleBucket('variable')"
      >
        <div class="metric-label">{{ COST_BUCKETS.variable.label }}</div>
        <div class="metric-value">{{ formatIls(variableTotal) }}</div>
        <div class="metric-sub">{{ variablePct }}% · tap to see breakdown</div>
      </button>
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

    <div v-if="selectedBucket" class="cost-breakdown">
      <div class="cost-breakdown-header">
        <div>
          <strong>{{ activeBucket.label }}</strong>
          <p class="cost-breakdown-hint">{{ activeBucket.hint }}</p>
        </div>
        <button type="button" class="btn btn-ghost" @click="selectedBucket = null">Close</button>
      </div>
      <p v-if="!breakdown.length" class="cost-breakdown-empty">Nothing in this group for this period.</p>
      <button
        v-for="row in breakdown"
        :key="row.category_en"
        type="button"
        class="cost-breakdown-row"
        @click="emit('selectCategory', row.category_en)"
      >
        <span>{{ row.category_en }}</span>
        <span class="cost-breakdown-amount">
          {{ formatIls(row.total) }}
          <span class="cost-breakdown-pct">{{ rowPct(row.total) }}%</span>
        </span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { COST_BUCKETS, categoriesForCostType, splitFixedVariable, type CostType } from "../categories";
import type { SpendingReport } from "../types";
import { formatBillingPeriod, formatIls, roundMoney } from "../utils/format";

const props = defineProps<{ report: SpendingReport }>();
const emit = defineEmits<{ selectCategory: [string] }>();

const selectedBucket = ref<CostType | null>(null);

const billingPeriod = computed(() => formatBillingPeriod(props.report.metadata));

const split = computed(() => splitFixedVariable(props.report.by_category));
const classifiedTotal = computed(() => roundMoney(split.value.fixed + split.value.variable));
const fixedTotal = computed(() => roundMoney(split.value.fixed));
const variableTotal = computed(() => roundMoney(split.value.variable));
const fixedPct = computed(() =>
  classifiedTotal.value ? Math.round((fixedTotal.value / classifiedTotal.value) * 100) : 0,
);
const variablePct = computed(() =>
  classifiedTotal.value ? Math.round((variableTotal.value / classifiedTotal.value) * 100) : 0,
);

const activeBucket = computed(() =>
  selectedBucket.value ? COST_BUCKETS[selectedBucket.value] : COST_BUCKETS.fixed,
);

const bucketTotal = computed(() =>
  selectedBucket.value === "fixed" ? fixedTotal.value : variableTotal.value,
);

const breakdown = computed(() =>
  selectedBucket.value
    ? categoriesForCostType(props.report.by_category, selectedBucket.value)
    : [],
);

function toggleBucket(type: CostType) {
  selectedBucket.value = selectedBucket.value === type ? null : type;
}

function rowPct(amount: number): number {
  return bucketTotal.value ? Math.round((roundMoney(amount) / bucketTotal.value) * 100) : 0;
}
</script>
