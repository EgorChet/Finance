<template>
  <div>
    <div class="tx-list-header">
      <strong v-if="title">{{ title }}</strong>
      <div v-if="showSort" class="tx-list-sort">
        <button
          v-for="col in sortOptions"
          :key="col.key"
          type="button"
          class="tx-sort-btn"
          :class="{ active: sortKey === col.key }"
          @click="setSort(col.key)"
        >
          {{ col.label }}{{ sortKey === col.key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '' }}
        </button>
      </div>
    </div>

    <div class="tx-row-mobile">
      <div v-for="row in visibleRows" :key="row.key" class="tx-row">
        <div class="tx-row-top">
          <div class="tx-row-merchant">{{ row.merchant }}</div>
          <div class="tx-row-amount">{{ formatChargeAmount(row.tx) }}</div>
        </div>
        <div class="tx-row-meta">
          <span class="tx-row-meta-text">
            {{ row.dateLabel }}
            <span v-if="showCategory && row.category"> · {{ row.category }}</span>
          </span>
          <button
            v-if="excludeable"
            type="button"
            class="tx-exclude-btn"
            :disabled="excludingKey === row.key"
            @click="emitExclude(row.tx)"
          >
            {{ excludingKey === row.key ? "…" : "Exclude" }}
          </button>
        </div>
      </div>
    </div>

    <button
      v-if="total > defaultLimit && !showAll"
      type="button"
      class="btn"
      style="margin-top: 0.65rem"
      @click="showAll = true"
    >
      Show all {{ total }} charges
    </button>
    <button
      v-else-if="total > defaultLimit && showAll"
      type="button"
      class="btn btn-ghost"
      style="margin-top: 0.65rem"
      @click="showAll = false"
    >
      Show recent {{ defaultLimit }}
    </button>
    <p v-else-if="total > 0 && total <= defaultLimit" style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0.5rem">
      {{ total }} charge{{ total === 1 ? '' : 's' }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Transaction } from "../types";
import { formatChargeAmount, formatTransactionDate, monthLabelFromIso } from "../utils/format";
import { transactionKey } from "../utils/transactionKey";

type SortKey = "date" | "merchant" | "category" | "amount";

const props = withDefaults(
  defineProps<{
    transactions: Transaction[];
    title?: string;
    showCategory?: boolean;
    categoryFilter?: string;
    defaultLimit?: number;
    statementBilling?: string | null;
    showSort?: boolean;
    excludeable?: boolean;
    excludingKey?: string | null;
  }>(),
  {
    title: "Transactions",
    showCategory: false,
    defaultLimit: 25,
    statementBilling: null,
    showSort: true,
    excludeable: false,
    excludingKey: null,
  },
);

const emit = defineEmits<{
  exclude: [tx: Transaction];
}>();

const showAll = ref(false);
const sortKey = ref<SortKey>("date");
const sortDir = ref<"asc" | "desc">("desc");

const sortOptions: { key: SortKey; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "amount", label: "Amount" },
  { key: "merchant", label: "Merchant" },
];

watch(
  () => props.transactions,
  () => {
    showAll.value = false;
  },
);

const filtered = computed(() => {
  let txs = props.transactions;
  if (props.categoryFilter) {
    txs = txs.filter((t) => t.category_en === props.categoryFilter);
  }
  return txs;
});

const sorted = computed(() => {
  const txs = [...filtered.value];
  const dir = sortDir.value === "asc" ? 1 : -1;
  txs.sort((a, b) => {
    if (sortKey.value === "date") return dir * a.date.localeCompare(b.date);
    if (sortKey.value === "amount") return dir * (a.charge_amount - b.charge_amount);
    if (sortKey.value === "category") {
      return dir * (a.category_en || "").localeCompare(b.category_en || "");
    }
    const ma = a.merchant_en || a.merchant_he;
    const mb = b.merchant_en || b.merchant_he;
    return dir * ma.localeCompare(mb);
  });
  return txs;
});

const total = computed(() => sorted.value.length);

const visibleRows = computed(() => {
  const txs = showAll.value ? sorted.value : sorted.value.slice(0, props.defaultLimit);
  return txs.map((t) => ({
    key: transactionKey(t),
    tx: t,
    dateLabel: formatChargeDate(t),
    merchant: t.merchant_en || t.merchant_he,
    category: t.category_en || "Uncategorized",
    amount: t.charge_amount,
  }));
});

function emitExclude(tx: Transaction) {
  emit("exclude", tx);
}

function formatChargeDate(tx: Transaction): string {
  const purchase = formatTransactionDate(tx.date);
  const billMonth = tx.billing_month || props.statementBilling;
  if (!billMonth) return purchase;
  if (monthLabelFromIso(tx.date) === billMonth) return purchase;
  return `${purchase} · ${billMonth}`;
}

function setSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === "desc" ? "asc" : "desc";
  } else {
    sortKey.value = key;
    sortDir.value = key === "date" || key === "amount" ? "desc" : "asc";
  }
}
</script>
