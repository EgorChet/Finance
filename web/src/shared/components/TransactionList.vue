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
          <div class="tx-row-amount-col">
            <div class="tx-row-amount" :class="{ 'tx-row-amount--refund': row.tx.charge_amount < 0 }">
              {{ formatChargeAmount(row.tx) }}
            </div>
            <div v-if="row.reimbursementLabel" class="tx-row-reimbursement">{{ row.reimbursementLabel }}</div>
          </div>
        </div>
        <div class="tx-row-meta">
          <span class="tx-row-meta-text">
            {{ row.dateLabel }}
            <span v-if="showCategory && row.category"> · {{ row.category }}</span>
          </span>
          <div v-if="excludeable || adjustable" class="tx-row-actions">
            <button
              v-if="adjustable"
              type="button"
              class="tx-exclude-btn"
              :disabled="actingKey === row.key"
              @click="emitAdjust(row.tx)"
            >
              {{ actingKey === row.key ? "…" : row.adjustLabel }}
            </button>
            <button
              v-if="excludeable"
              type="button"
              class="tx-exclude-btn"
              :disabled="actingKey === row.key"
              @click="emitExclude(row.tx)"
            >
              {{ actingKey === row.key ? "…" : "Exclude" }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <nav
      v-if="paginated && totalPages > 1"
      class="tx-pagination"
      aria-label="Charge pages"
    >
      <button
        type="button"
        class="btn btn-ghost tx-pagination-btn"
        :disabled="currentPage <= 1"
        @click="currentPage -= 1"
      >
        Previous
      </button>
      <span class="tx-pagination-meta">
        {{ paginationRangeLabel }} · page {{ currentPage }} of {{ totalPages }}
      </span>
      <button
        type="button"
        class="btn btn-ghost tx-pagination-btn"
        :disabled="currentPage >= totalPages"
        @click="currentPage += 1"
      >
        Next
      </button>
    </nav>
    <p
      v-else-if="paginated && total > 0"
      class="tx-pagination-meta tx-pagination-meta--solo"
    >
      {{ total }} charge{{ total === 1 ? "" : "s" }}
    </p>
    <button
      v-else-if="total > defaultLimit && !showAll"
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
import type { Transaction } from "@/shared/types";
import { formatChargeAmount, formatIls, formatTransactionDate, monthLabelFromIso } from "@/shared/utils/format";
import { transactionRowKey } from "@/shared/utils/transaction";

type SortKey = "date" | "merchant" | "category" | "amount";

const props = withDefaults(
  defineProps<{
    transactions: Transaction[];
    title?: string;
    showCategory?: boolean;
    categoryFilter?: string;
    defaultLimit?: number;
    paginated?: boolean;
    statementBilling?: string | null;
    showSort?: boolean;
    excludeable?: boolean;
    adjustable?: boolean;
    excludingKey?: string | null;
    adjustingKey?: string | null;
  }>(),
  {
    title: "Transactions",
    showCategory: false,
    defaultLimit: 25,
    paginated: false,
    statementBilling: null,
    showSort: true,
    excludeable: false,
    adjustable: false,
    excludingKey: null,
    adjustingKey: null,
  },
);

const emit = defineEmits<{
  exclude: [tx: Transaction];
  adjust: [tx: Transaction];
}>();

const actingKey = computed(() => props.adjustingKey || props.excludingKey);

const showAll = ref(false);
const currentPage = ref(1);
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
    currentPage.value = 1;
  },
);

const filtered = computed(() => {
  let txs = [...props.transactions];
  if (props.categoryFilter) {
    txs = txs.filter((t) => t.category_en === props.categoryFilter);
  }
  return txs;
});

const sorted = computed(() => {
  const txs = filtered.value.slice();
  const dir = sortDir.value === "asc" ? 1 : -1;
  txs.sort((a, b) => {
    if (sortKey.value === "date") return dir * a.date.localeCompare(b.date);
    if (sortKey.value === "amount") {
      const aAmt = a.effective_amount ?? a.charge_amount;
      const bAmt = b.effective_amount ?? b.charge_amount;
      return dir * (aAmt - bAmt);
    }
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
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / props.defaultLimit)));

const paginationRangeLabel = computed(() => {
  if (!total.value) return "";
  const start = (currentPage.value - 1) * props.defaultLimit + 1;
  const end = Math.min(currentPage.value * props.defaultLimit, total.value);
  return `${start.toLocaleString()}–${end.toLocaleString()} of ${total.value.toLocaleString()} charges`;
});

const visibleRows = computed(() => {
  let txs = sorted.value;
  if (props.paginated) {
    const start = (currentPage.value - 1) * props.defaultLimit;
    txs = txs.slice(start, start + props.defaultLimit);
  } else if (!showAll.value) {
    txs = txs.slice(0, props.defaultLimit);
  }
  return txs.map((t) => ({
    key: transactionRowKey(t),
    tx: t,
    dateLabel: formatChargeDate(t),
    merchant: t.merchant_en || t.merchant_he,
    category: t.category_en || "Uncategorized",
    amount: t.effective_amount ?? t.charge_amount,
    adjustLabel: t.reimbursement ? "Edit split" : "Split",
    reimbursementLabel: t.reimbursement
      ? `${formatIls(t.charge_amount)} − ${formatIls(t.reimbursement)} back`
      : null,
  }));
});

function emitExclude(tx: Transaction) {
  emit("exclude", tx);
}

function emitAdjust(tx: Transaction) {
  emit("adjust", tx);
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
  currentPage.value = 1;
}
</script>
