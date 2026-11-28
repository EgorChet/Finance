<template>
  <div>
    <div class="tx-list-header">
      <strong v-if="title">{{ t(title) }}</strong>
      <div v-if="showSort" class="tx-list-sort">
        <button
          v-for="col in sortOptions"
          :key="col.key"
          type="button"
          class="tx-sort-btn"
          :class="{ active: sortKey === col.key }"
          @click="setSort(col.key)"
        >
          {{ t(col.label) }}{{ sortKey === col.key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '' }}
        </button>
      </div>
    </div>

    <div class="tx-row-mobile">
      <section v-for="group in groups" :key="group.key" class="tx-group">
        <header v-if="group.label" class="tx-group-head">
          <span>{{ group.label }}</span>
          <span class="tx-group-total">
            <small v-if="group.hidden" class="tx-group-more">{{ t("+{n} more", { n: group.hidden }) }} · </small>{{ formatIlsWhole(group.total) }}
          </span>
        </header>
        <component
          :is="hasActions ? 'button' : 'div'"
          v-for="row in group.rows"
          :key="row.key"
          :type="hasActions ? 'button' : undefined"
          class="tx-row"
          :class="{ 'tx-row--tappable': hasActions, 'tx-row--busy': actingKey === row.key }"
          :aria-label="hasActions ? `${row.merchant}, ${formatChargeAmount(row.tx)}: ${t('actions')}` : undefined"
          @click="hasActions && openSheet(row)"
        >
          <MerchantIcon :merchant-he="row.tx.merchant_he" :merchant-en="row.tx.merchant_en" :category="row.category" />
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
                {{ sheetRow.dateLabel }}<span v-if="sheetRow.category"> · {{ catName(sheetRow.category) }}</span>
              </div>
              <div v-if="sheetRow.reimbursementLabel" class="tx-sheet-note">{{ sheetRow.reimbursementLabel }}</div>
            </div>
            <div class="tx-sheet-actions">
              <button v-if="adjustable" type="button" class="tx-sheet-action" @click="openCategory">
                <span class="tx-sheet-action-title">{{ sheetRow.tx.category_override ? t("Category: {name}", { name: catName(sheetRow.category) }) : t("Change category") }}</span>
                <span class="tx-sheet-action-hint">
                  {{ isBitTransfer(sheetRow.tx) ? t("What was this BIT transfer for? Only this charge changes") : t("Only this charge — other charges from this store stay as they are") }}
                </span>
              </button>
              <button v-if="adjustable" type="button" class="tx-sheet-action" @click="runSheet('adjust')">
                <span class="tx-sheet-action-title">{{ t(sheetRow.adjustLabel) }}</span>
                <span class="tx-sheet-action-hint">{{ t("Someone paid you back for part of it") }}</span>
              </button>
              <button v-if="adjustable && isHold(sheetRow.tx)" type="button" class="tx-sheet-action" @click="openHold">
                <span class="tx-sheet-action-title">{{ t("It's a hold — less will be charged") }}</span>
                <span class="tx-sheet-action-hint">{{ t("EV Edge, Pango and the like block an amount but charge less or nothing") }}</span>
              </button>
              <button v-if="excludeable" type="button" class="tx-sheet-action" @click="runSheet('exclude')">
                <span class="tx-sheet-action-title">{{ t("Exclude from spending") }}</span>
                <span class="tx-sheet-action-hint">{{ t("Not a real expense, e.g. a transfer or a refund pair") }}</span>
              </button>
            </div>
            <button type="button" class="btn tx-sheet-cancel" @click="closeSheet">{{ t("Cancel") }}</button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <BottomSheet :open="!!categoryRow" :title="categoryRow ? categoryRow.merchant : ''" @close="categoryRow = null">
      <template v-if="categoryRow">
        <p class="tx-cat-meta">
          {{ formatChargeAmount(categoryRow.tx) }} · {{ formatTransactionDate(categoryRow.tx.date) }}
          <template v-if="isBitTransfer(categoryRow.tx)"> · {{ t("e.g. paying someone back for dinner → Eating out") }}</template>
        </p>
        <CategoryPicker v-model="draftCategory" :options="CATEGORY_PICKLIST" :suggestions="categorySuggestions" />
        <p v-if="categoryError" class="tx-cat-error">{{ categoryError }}</p>
      </template>
      <template v-if="categoryRow" #footer>
        <button v-if="categoryRow.tx.category_override" type="button" class="btn" :disabled="savingCategory" @click="pickCategory(null)">
          {{ t("Back to {name}", { name: categoryRow.tx.category_original ? catName(categoryRow.tx.category_original) : t("the store's category") }) }}
        </button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="savingCategory || !draftCategory || draftCategory === categoryRow.category"
          @click="pickCategory(draftCategory)"
        >
          {{ savingCategory ? t("Saving…") : t("Save") }}
        </button>
      </template>
    </BottomSheet>

    <BottomSheet :open="!!holdRow" :title="holdRow ? holdRow.merchant : ''" @close="holdRow = null">
      <template v-if="holdRow">
        <p class="tx-cat-meta">
          {{ t("Blocked now: {amount}. How much will really be charged?", { amount: formatIls(holdRow.tx.charge_amount) }) }}
        </p>
        <div class="find-presets">
          <button type="button" class="find-chip" :class="{ 'find-chip--on': holdAmount === 0 }" @click="holdAmount = 0">{{ t("Nothing (₪0)") }}</button>
        </div>
        <SheetAmountInput v-model="holdAmount" :label="t('Will be charged')" placeholder="0" />
        <p v-if="holdError" class="tx-cat-error">{{ holdError }}</p>
      </template>
      <template v-if="holdRow" #footer>
        <button type="button" class="btn btn-primary" :disabled="holdSaving || holdAmount >= holdRow.tx.charge_amount" @click="saveHold">
          {{ holdSaving ? t("Saving…") : t("Save") }}
        </button>
      </template>
    </BottomSheet>

    <nav
      v-if="paginated && totalPages > 1"
      class="tx-pagination"
      :aria-label="t('Charge pages')"
    >
      <button
        type="button"
        class="btn btn-ghost tx-pagination-btn"
        :disabled="currentPage <= 1"
        @click="currentPage -= 1"
      >
        {{ t("Previous") }}
      </button>
      <span class="tx-pagination-meta">
        {{ paginationRangeLabel }} · {{ t("page {n} of {total}", { n: currentPage, total: totalPages }) }}
      </span>
      <button
        type="button"
        class="btn btn-ghost tx-pagination-btn"
        :disabled="currentPage >= totalPages"
        @click="currentPage += 1"
      >
        {{ t("Next") }}
      </button>
    </nav>
    <p
      v-else-if="paginated && total > 0"
      class="tx-pagination-meta tx-pagination-meta--solo"
    >
      {{ t("{n} {n|charge|charges}", { n: total }) }}
    </p>
    <button
      v-else-if="total > defaultLimit && !showAll"
      type="button"
      class="more-pill"
      @click="showAll = true"
    >
      {{ t("Show all {n} charges", { n: total }) }}
    </button>
    <button
      v-else-if="total > defaultLimit && showAll"
      type="button"
      class="more-pill more-pill--open"
      @click="showAll = false"
    >
      {{ t("Show recent {n}", { n: defaultLimit }) }}
    </button>
    <p v-else-if="total > 0 && total <= defaultLimit" style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0.5rem">
      {{ t("{n} {n|charge|charges}", { n: total }) }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { catName, dateTag, t, t as i18n, tr } from "@/shared/i18n";
import { computed, ref, watch } from "vue";
import type { Transaction } from "@/shared/types";
import { formatChargeAmount, formatIls, formatIlsWhole, formatTransactionDate, monthLabelFromIso } from "@/shared/utils/format";
import BottomSheet from "@/shared/components/BottomSheet.vue";
import MerchantIcon from "@/shared/components/MerchantIcon.vue";
import { merchantDisplayName } from "@/shared/utils/merchantNames";
import CategoryPicker from "@/shared/components/CategoryPicker.vue";
import { showToast } from "@/shared/composables/useToast";
import { chargeSuggestions } from "@/shared/utils/categorySuggest";
import { CATEGORY_PICKLIST } from "@/shared/categories";
import { friendlyError } from "@/shared/utils/friendlyError";
import { isBitTransfer, saveChargeCategory } from "@/shared/composables/useChargeCategory";
import { effectiveSpend } from "@/shared/utils/transaction";
import { transactionRowKey } from "@/shared/utils/transaction";
import SheetAmountInput from "@/shared/components/SheetAmountInput.vue";
import { addExclusion, removeAdjustment, removeExclusion, upsertAdjustment } from "@/shared/api/client";
import { useAuthStore } from "@/shared/stores/auth";
import { useAdjustmentsDataStore, useExclusionsDataStore } from "@/shared/stores/viewData";
import { invalidateSpendingDataCaches } from "@/shared/stores/invalidateCaches";
import { emitSpendingRefresh } from "@/features/spending/composables/useSpendingRefresh";
import { transactionKey } from "@/shared/utils/transactionKey";
import { HOLD_NOTE, isHold } from "@/shared/utils/holds";

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
    /** Live cycle's first day: charges dated before it are marked "bought before the cycle". */
    cycleStart?: string | null;
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
    cycleStart: null,
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
    const ma = merchantDisplayName(a);
    const mb = merchantDisplayName(b);
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
  return t("{start}–{end} of {total} charges", { start: start.toLocaleString(), end: end.toLocaleString(), total: total.value.toLocaleString() });
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
    merchant: merchantDisplayName(t),
    category: t.category_en || "Uncategorized",
    metaLabel: rowMeta(t),
    amount: t.effective_amount ?? t.charge_amount,
    adjustLabel: t.reimbursement ? "Edit split" : "Split",
    reimbursementLabel: t.reimbursement
      ? t.reimbursement_note?.startsWith(HOLD_NOTE)
        ? i18n("hold {total} · counted as {amount}", { total: formatIls(t.charge_amount), amount: formatIls(t.charge_amount - t.reimbursement) })
        : i18n("{total} − {back} back", { total: formatIls(t.charge_amount), back: formatIls(t.reimbursement) })
      : null,
  }));
});

/** Grouped by day when sorted by date; one flat group otherwise. */
const groups = computed(() => {
  const rows = visibleRows.value;
  if (sortKey.value !== "date") return [{ key: "all", label: "", total: 0, hidden: 0, rows }];
  // The day's total counts every charge of that day, also the ones below "Show all".
  const dayTotals = new Map<string, number>();
  const dayCounts = new Map<string, number>();
  for (const tx of sorted.value) {
    const day = tx.date.slice(0, 10);
    dayTotals.set(day, (dayTotals.get(day) ?? 0) + effectiveSpend(tx));
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
  }
  const out: { key: string; label: string; total: number; hidden: number; rows: typeof rows }[] = [];
  for (const row of rows) {
    const day = row.tx.date.slice(0, 10);
    let g = out[out.length - 1];
    if (!g || g.key !== day) {
      g = { key: day, label: dayLabel(day), total: dayTotals.get(day) ?? 0, hidden: 0, rows: [] };
      out.push(g);
    }
    g.rows.push(row);
  }
  for (const g of out) g.hidden = Math.max(0, (dayCounts.get(g.key) ?? 0) - g.rows.length);
  return out;
});

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(dateTag(), {
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
  if (props.showCategory) parts.push(catName(t.category_en || "Uncategorized"));
  const billMonth = tr(t.billing_month || props.statementBilling);
  // Entered by hand under Budget (Cibus, car loan, one-off charges): not from the card statement.
  if (t.notes?.startsWith("fixed_charge:")) {
    parts.push(i18n("added by you · not on the card"));
    return parts.join(" · ");
  }
  if (props.cycleStart && t.date.slice(0, 10) < props.cycleStart && !t.notes?.startsWith("fixed_charge:")) {
    parts.push(i18n("bought before the cycle, charged in it"));
  } else if (billMonth && monthLabelFromIso(t.date) !== billMonth) parts.push(i18n("billed {month}", { month: billMonth }));
  if (props.adjustable && !t.category_override && isBitTransfer(t)) parts.push(i18n("tap to say what it was for"));
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
const categorySuggestions = computed(() =>
  categoryRow.value ? chargeSuggestions(categoryRow.value.tx, props.transactions) : [],
);
const savingCategory = ref(false);
const categoryError = ref("");

const draftCategory = ref("");

// ── Holds: a pending charge that will really be smaller (EV charging, parking) or nothing ──
const holdRow = ref<TxRow | null>(null);
const holdAmount = ref(0);
const holdSaving = ref(false);
const holdError = ref("");


function openHold() {
  holdRow.value = sheetRow.value;
  holdAmount.value = 0;
  holdError.value = "";
  closeSheet();
}

async function saveHold() {
  const row = holdRow.value;
  if (!row || holdSaving.value) return;
  const tx = row.tx;
  const real = Math.max(0, Math.round(holdAmount.value * 100) / 100);
  const token = useAuthStore().token || undefined;
  holdSaving.value = true;
  holdError.value = "";
  try {
    if (real <= 0) {
      await addExclusion({ transaction: tx, note: `${HOLD_NOTE} — won't be charged` }, token);
    } else {
      await upsertAdjustment({ transaction: tx, reimbursement: Math.round((tx.charge_amount - real) * 100) / 100, note: `${HOLD_NOTE} — expected ₪${real}` }, token);
    }
    holdRow.value = null;
    useAdjustmentsDataStore().invalidate();
    useExclusionsDataStore().invalidate();
    invalidateSpendingDataCaches();
    emitSpendingRefresh();
    const key = transactionKey(tx);
    showToast(
      real <= 0 ? t("Not counted: {name} {amount}", { name: row.merchant, amount: formatIls(tx.charge_amount) }) : t("Counted as {amount}", { amount: formatIls(real) }),
      {
        label: t("Undo"),
        run: () => {
          const undo = real <= 0 ? removeExclusion(key, token) : removeAdjustment(key, token);
          void undo.then(() => {
            useAdjustmentsDataStore().invalidate();
            useExclusionsDataStore().invalidate();
            invalidateSpendingDataCaches();
            emitSpendingRefresh();
          });
        },
      },
    );
  } catch (e) {
    holdError.value = friendlyError(e);
  } finally {
    holdSaving.value = false;
  }
}

function openCategory() {
  categoryRow.value = sheetRow.value;
  draftCategory.value = sheetRow.value?.category ?? "";
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
  const previous = row.tx.category_override ?? null;
  try {
    await saveChargeCategory(row.tx, value);
    categoryRow.value = null;
    showToast(t("Changed to {name}", { name: catName(value ?? original) }), {
      label: t("Undo"),
      run: () => void saveChargeCategory(row.tx, previous).catch(() => undefined),
    });
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
  const billMonth = tr(tx.billing_month || props.statementBilling);
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
