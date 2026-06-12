<template>
  <div>
    <strong>{{ title }}</strong>
    <div class="charge-grid" style="margin-top: 0.5rem">
      <div v-for="row in rows" :key="row.date + row.merchant" class="charge-card" :title="row.merchant">
        <div class="charge-amount">{{ formatIls(row.amount) }}</div>
        <div class="charge-merchant">{{ row.merchant }}</div>
        <div v-if="showCategory && row.category" class="charge-merchant">{{ row.category }}</div>
        <div class="charge-date">{{ formatChargeDate(row) }}</div>
      </div>
    </div>
    <p v-if="total > limit" style="color: var(--text-muted); font-size: 0.85rem">
      Showing {{ limit }} of {{ total }} charges
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Transaction } from "../types";
import { formatDate, formatIls, monthLabelFromIso } from "../utils/format";

const props = withDefaults(
  defineProps<{
    transactions: Transaction[];
    title?: string;
    showCategory?: boolean;
    categoryFilter?: string;
    limit?: number;
    /** Month label for the current statement view (e.g. "May 2025"). */
    statementBilling?: string | null;
  }>(),
  { title: "Recent charges", showCategory: false, limit: 25, statementBilling: null },
);

const filtered = computed(() => {
  let txs = props.transactions;
  if (props.categoryFilter) {
    txs = txs.filter((t) => t.category_en === props.categoryFilter);
  }
  return txs;
});

const total = computed(() => filtered.value.length);
const rows = computed(() =>
  filtered.value.slice(0, props.limit).map((t) => ({
    date: t.date,
    billingMonth: t.billing_month,
    merchant: t.merchant_en || t.merchant_he,
    category: t.category_en,
    amount: t.charge_amount,
  })),
);

function formatChargeDate(row: { date: string; billingMonth?: string | null }): string {
  const purchase = formatDate(row.date);
  const billMonth = row.billingMonth || props.statementBilling;
  if (!billMonth) return purchase;
  if (monthLabelFromIso(row.date) === billMonth) return purchase;
  return `${purchase} · ${billMonth}`;
}
</script>
