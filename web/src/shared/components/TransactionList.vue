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
      <section v-for="group in groups" :key="group.key" class="tx-group">
        <header v-if="group.label" class="tx-group-head">
          <span>{{ group.label }}</span>
          <span class="tx-group-total">{{ formatIlsWhole(group.total) }}</span>
        </header>
        <component
          :is="hasActions ? 'button' : 'div'"
          v-for="row in group.rows"
          :key="row.key"
          :type="hasActions ? 'button' : undefined"
          class="tx-row"
          :class="{ 'tx-row--tappable': hasActions, 'tx-row--busy': actingKey === row.key }"
          :aria-label="hasActions ? `${row.merchant}, ${formatChargeAmount(row.tx)}: actions` : undefined"
          @click="hasActions && openSheet(row)"
        >
          <MerchantIcon :merchant-he="row.tx.merchant_he" :merchant-en="row.tx.merchant_en" :fallback="row.icon" />
          <span class="tx-row-body">
            <span class="tx-row-top">
              <span class="tx-row-merchant">{{ row.merchant }}</span>
              <span class="tx-row-amount" :class="{ 'tx-row-amount--refund': row.tx.charge_amount < 0 }">
                {{ actingKey === row.key ? "…" : formatChargeAmount(row.tx) }}
              </span>
            </span>
            <span class="tx-row-meta">
              <span class="tx-row-meta-text">{{ row.metaLabel }}</span>
              <span v-if="row.reimbursementLabel" class="tx-row-reimbursement">{{ row.reimbursementLabel }}</span>
            </span>
          </span>
        </component>
      </section>
    </div>

    <!-- Rarely used actions live in a sheet that opens on tap, not on every row. -->
    <Teleport to="body">
      <Transition name="tx-sheet">
        <div v-if="sheetRow" class="tx-sheet-backdrop" @click.self="closeSheet">
          <div class="tx-sheet" role="dialog" aria-modal="true" :aria-label="sheetRow.merchant">
            <div class="tx-sheet-grabber" aria-hidden="true" />
            <div class="tx-sheet-head">
              <div class="tx-sheet-merchant">{{ sheetRow.merchant }}</div>
              <div class="tx-sheet-amount" :class="{ 'tx-row-amount--refund': sheetRow.tx.charge_amount < 0 }">
                {{ formatChargeAmount(sheetRow.tx) }}
              </div>
              <div class="tx-sheet-meta">
                {{ sheetRow.dateLabel }}<span v-if="sheetRow.category"> · {{ sheetRow.category }}</span>
              </div>
              <div v-if="sheetRow.reimbursementLabel" class="tx-sheet-note">{{ sheetRow.reimbursementLabel }}</div>
            </div>
            <div class="tx-sheet-actions">
              <button v-if="adjustable" type="button" class="tx-sheet-action" @click="openCategory">
                <span class="tx-sheet-action-title">{{ categoryIcon(sheetRow.category) }} {{ sheetRow.tx.category_override ? "Category: " + sheetRow.category : "Change category" }}</span>
                <span class="tx-sheet-action-hint">
                  {{ isBitTransfer(sheetRow.tx) ? "What was this BIT transfer for? Only this charge changes" : "Only this charge — other charges from this store stay as they are" }}
                </span>
              </button>
              <button v-if="adjustable" type="button" class="tx-sheet-action" @click="runSheet('adjust')">
                <span class="tx-sheet-action-title">{{ sheetRow.adjustLabel }}</span>
                <span class="tx-sheet-action-hint">Someone paid you back for part of it</span>
              </button>
              <button v-if="excludeable" type="button" class="tx-sheet-action" @click="runSheet('exclude')">
                <span class="tx-sheet-action-title">Exclude from spending</span>
                <span class="tx-sheet-action-hint">Not a real expense, e.g. a transfer or a refund pair</span>
              </button>
            </div>
            <button type="button" class="btn tx-sheet-cancel" @click="closeSheet">Cancel</button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <BottomSheet :open="!!categoryRow" :title="categoryRow ? categoryRow.merchant : ''" @close="categoryRow = null">
      <template v-if="categoryRow">
        <p class="tx-cat-meta">
          {{ formatChargeAmount(categoryRow.tx) }} · {{ formatTransactionDate(categoryRow.tx.date) }}
          <template v-if="isBitTransfer(categoryRow.tx)"> · e.g. paying someone back for dinner → Eating out</template>
        </p>
        <CategoryGrid :model-value="categoryRow.category" :options="CATEGORY_PICKLIST" @pick="pickCategory" />
        <p v-if="categoryError" class="tx-cat-error">{{ categoryError }}</p>
      </template>
      <template v-if="categoryRow?.tx.category_override" #footer>
        <button type="button" class="btn" :disabled="savingCategory" @click="pickCategory(null)">
          Back to {{ categoryRow.tx.category_original || "the store's category" }}
        </button>
      </template>
    </BottomSheet>

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
import { formatChargeAmount, formatIls, formatIlsWhole, formatTransactionDate, monthLabelFromIso } from "@/shared/utils/format";
import { categoryIcon } from "@/features/spending/utils/categoryIcons";
import BottomSheet from "@/shared/components/BottomSheet.vue";
import MerchantIcon from "@/shared/components/MerchantIcon.vue";
import CategoryGrid from "@/shared/components/CategoryGrid.vue";
import { CATEGORY_PICKLIST } from "@/shared/categories";
import { friendlyError } from "@/shared/utils/friendlyError";
import { isBitTransfer, saveChargeCategory } from "@/shared/composables/useChargeCategory";
import { effectiveSpend } from "@/shared/utils/transaction";
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
    icon: categoryIcon(t.category_en || "Uncategorized"),
    metaLabel: rowMeta(t),
    amount: t.effective_amount ?? t.charge_amount,
    adjustLabel: t.reimbursement ? "Edit split" : "Split",
    reimbursementLabel: t.reimbursement
      ? `${formatIls(t.charge_amount)} − ${formatIls(t.reimbursement)} back`
      : null,
  }));
});

/** Grouped by day when sorted by date; one flat group otherwise. */
const groups = computed(() => {
  const rows = visibleRows.value;
  if (sortKey.value !== "date") return [{ key: "all", label: "", total: 0, rows }];
  const out: { key: string; label: string; total: number; rows: typeof rows }[] = [];
  for (const row of rows) {
    const day = row.tx.date.slice(0, 10);
    let g = out[out.length - 1];
    if (!g || g.key !== day) {
      g = { key: day, label: dayLabel(day), total: 0, rows: [] };
      out.push(g);
    }
    g.rows.push(row);
    g.total += effectiveSpend(row.tx);
  }
  return out;
});

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Under the merchant: category (when shown) and billing month when it differs; the day is in the header. */
function rowMeta(t: Transaction): string {
  const parts: string[] = [];
  if (sortKey.value !== "date") parts.push(formatTransactionDate(t.date));
  if (props.showCategory) parts.push(t.category_en || "Uncategorized");
  const billMonth = t.billing_month || props.statementBilling;
  if (billMonth && monthLabelFromIso(t.date) !== billMonth) parts.push(`billed ${billMonth}`);
  if (props.adjustable && !t.category_override && isBitTransfer(t)) parts.push("tap to say what it was for");
  return parts.join(" · ");
}

function emitExclude(tx: Transaction) {
  emit("exclude", tx);
}

function emitAdjust(tx: Transaction) {
  emit("adjust", tx);
}

type TxRow = (typeof visibleRows.value)[number];

const hasActions = computed(() => props.excludeable || props.adjustable);
const sheetRow = ref<TxRow | null>(null);

function openSheet(row: TxRow) {
  if (actingKey.value === row.key) return;
  sheetRow.value = row;
}

function closeSheet() {
  sheetRow.value = null;
}

const categoryRow = ref<TxRow | null>(null);
const savingCategory = ref(false);
const categoryError = ref("");

function openCategory() {
  categoryRow.value = sheetRow.value;
  categoryError.value = "";
  closeSheet();
}

async function pickCategory(category: string | null) {
  const row = categoryRow.value;
  if (!row || savingCategory.value) return;
  const original = row.tx.category_original ?? row.tx.category_en;
  // Picking the store's own category is the same as clearing the override.
  const value = category && category !== original ? category : null;
  savingCategory.value = true;
  categoryError.value = "";
  try {
    await saveChargeCategory(row.tx, value);
    categoryRow.value = null;
  } catch (e) {
    categoryError.value = friendlyError(e);
  } finally {
    savingCategory.value = false;
  }
}

function runSheet(action: "adjust" | "exclude") {
  const row = sheetRow.value;
  closeSheet();
  if (!row) return;
  if (action === "adjust") emitAdjust(row.tx);
  else emitExclude(row.tx);
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
