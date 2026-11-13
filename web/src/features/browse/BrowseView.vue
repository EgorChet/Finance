<template>
  <div class="find">
    <div v-if="auth.isDemo" class="demo-banner">{{ t("Demo mode — sample transactions only.") }}</div>
    <h2 class="page-title">{{ t("Transactions") }}</h2>
    <div class="seg" role="tablist" :aria-label="t('Transactions')">
      <button type="button" role="tab" class="seg-btn" :class="{ 'seg-btn--on': view === 'charges' }" :aria-selected="view === 'charges'" @click="setView('charges')">
        {{ t("Charges") }}
      </button>
      <button type="button" role="tab" class="seg-btn" :class="{ 'seg-btn--on': view === 'merchants' }" :aria-selected="view === 'merchants'" @click="setView('merchants')">
        {{ t("Merchants") }}
        <span v-if="merchantsWaiting > 0" class="seg-badge">{{ merchantsWaiting }}</span>
      </button>
    </div>

    <MerchantsView v-if="view === 'merchants'" />

    <AppLoader v-else-if="loading" :title="t('Loading transactions')" :subtitle="t('Fetching your statement history')" />
    <template v-else>
      <p v-if="error" class="browse-error">{{ error }}</p>
      <template v-else>
        <div class="find-top">
          <label class="find-search">
            <span class="find-search-icon" aria-hidden="true">⌕</span>
            <input
              v-model="searchQuery"
              type="search"
              :placeholder="t('Search merchants')"
              autocomplete="off"
              enterkeyhint="search"
              :aria-label="t('Search merchants')"
            />
          </label>
          <div class="find-chips" role="toolbar" :aria-label="t('Filters')">
            <button type="button" class="find-chip" :class="{ 'find-chip--on': !!selectedMonth }" @click="sheet = 'month'">
              {{ monthChipLabel }} <span aria-hidden="true">▾</span>
            </button>
            <button type="button" class="find-chip" :class="{ 'find-chip--on': !!categoryFilter }" @click="sheet = 'category'">
              <template v-if="categoryFilter">{{ catName(categoryFilter) }}</template>
              <template v-else>{{ t("Category") }}</template>
              <span aria-hidden="true">▾</span>
            </button>
            <button type="button" class="find-chip" :class="{ 'find-chip--on': amountActive }" @click="openAmount">
              {{ amountChipLabel }} <span aria-hidden="true">▾</span>
            </button>
            <button
              type="button"
              class="find-chip"
              :class="{ 'find-chip--on': includeRecurring }"
              :aria-pressed="includeRecurring"
              @click="includeRecurring = !includeRecurring"
            >
              {{ includeRecurring ? "✓ " : "" }}{{ t("Added charges") }}
            </button>
            <button v-if="hasActiveFilters" type="button" class="find-chip find-chip--clear" @click="clearFilters">
              {{ t("Clear") }}
            </button>
          </div>
        </div>

        <section v-if="allTransactions.length" class="find-summary">
          <p class="find-summary-label">{{ summaryLabel }}</p>
          <p class="find-summary-total">{{ formatIlsWhole(filteredTotal) }}</p>
          <p class="find-summary-meta">
            {{ t("{n} {n|charge|charges}", { n: filteredTransactions.length }) }}
            <template v-if="filteredTransactions.length > 1"> · {{ t("avg {amount}", { amount: formatIlsWhole(filteredTotal / filteredTransactions.length) }) }}</template>
          </p>
        </section>

        <p v-if="!allTransactions.length" class="browse-empty">{{ t("No transactions yet. Upload a statement from the menu.") }}</p>
        <div v-else-if="!filteredTransactions.length" class="find-empty">
          <p>{{ t("No charges match.") }}</p>
          <button type="button" class="btn" @click="clearFilters">{{ t("Clear filters") }}</button>
        </div>
        <TransactionList
          v-else
          class="find-list"
          :transactions="filteredTransactions"
          title=""
          show-category
          :default-limit="100"
          :excludeable="!auth.readOnly"
          :adjustable="!auth.readOnly"
          :excluding-key="excludingKey"
          :adjusting-key="adjustingKey"
          @exclude="excludeTransaction"
          @adjust="adjustTransaction"
        />
      </template>
    </template>

    <BottomSheet :open="sheet === 'month'" :title="t('Month')" @close="sheet = null">
      <div class="find-options">
        <button type="button" class="find-option" :class="{ 'find-option--on': !selectedMonth }" @click="pickMonth('')">
          {{ t("All months") }}
        </button>
        <button
          v-for="m in months"
          :key="m.key"
          type="button"
          class="find-option"
          :class="{ 'find-option--on': selectedMonth === m.key }"
          @click="pickMonth(m.key)"
        >
          {{ tr(m.label) }}
        </button>
      </div>
    </BottomSheet>

    <BottomSheet :open="sheet === 'category'" :title="t('Category')" @close="sheet = null">
      <CategoryGrid v-model="categoryFilter" :options="categoryOptions" empty-label="Any" @pick="sheet = null" />
    </BottomSheet>

    <BottomSheet :open="sheet === 'amount'" :title="t('Amount')" @close="sheet = null">
      <div class="find-presets">
        <button
          v-for="chip in amountPresets"
          :key="chip.id"
          type="button"
          class="find-chip"
          :class="{ 'find-chip--on': draftPreset === chip.id }"
          @click="applyDraftPreset(chip)"
        >
          {{ t(chip.label) }}
        </button>
      </div>
      <div class="find-range">
        <input v-model="draftMin" class="input" type="number" min="0" inputmode="decimal" :placeholder="t('Min ₪')" :aria-label="t('Minimum amount')" />
        <span aria-hidden="true">–</span>
        <input v-model="draftMax" class="input" type="number" min="0" inputmode="decimal" :placeholder="t('Max ₪')" :aria-label="t('Maximum amount')" />
      </div>
      <template #footer>
        <button type="button" class="btn" @click="resetAmount">{{ t("Any amount") }}</button>
        <button type="button" class="btn btn-primary" @click="applyAmount">{{ t("Show results") }}</button>
      </template>
    </BottomSheet>
  </div>
</template>

<script setup lang="ts">
import { catName, t, tr } from "@/shared/i18n";
import { knownMerchantName, merchantDisplayName } from "@/shared/utils/merchantNames";
import { friendlyError } from "@/shared/utils/friendlyError";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onSpendingRefresh } from "@/features/spending/composables/useSpendingRefresh";
import { useRoute, useRouter } from "vue-router";
import MerchantsView from "@/features/merchants/MerchantsView.vue";
import { useReviewDataStore } from "@/features/merchants/stores/reviewData";
import { addExclusion, fetchReport, upsertAdjustment } from "@/shared/api/client";
import AppLoader from "@/shared/components/AppLoader.vue";
import BottomSheet from "@/shared/components/BottomSheet.vue";
import CategoryGrid from "@/shared/components/CategoryGrid.vue";
import TransactionList from "@/shared/components/TransactionList.vue";
import { useAuthStore } from "@/shared/stores/auth";
import { useHomeDataStore } from "@/features/home/stores/homeData";
import { useAllReportStore } from "@/shared/stores/allReport";
import { confirm } from "@/shared/composables/useConfirm";
import { adjustCharge } from "@/shared/composables/useAdjustCharge";
import type { MonthItem, Transaction } from "@/shared/types";
import { CATEGORY_PICKLIST, rollupCategory } from "@/shared/categories";
import { formatIls, formatIlsWhole } from "@/shared/utils/format";
import { loadBrowseIncludeRecurring, saveBrowseIncludeRecurring } from "@/features/browse/utils/browsePreferences";
import { isSystemRecurringTransaction } from "@/features/household/utils/householdBudget";
import { effectiveSpend } from "@/shared/utils/transaction";
import { transactionKey } from "@/shared/utils/transactionKey";
import { invalidateSpendingDataCaches } from "@/shared/stores/invalidateCaches";
import { useAdjustmentsDataStore } from "@/shared/stores/viewData";

type AmountPreset = { id: string; label: string; min: number | null; max: number | null };

const amountPresets: AmountPreset[] = [
  { id: "lt50", label: "Under ₪50", min: null, max: 50 },
  { id: "50-200", label: "₪50–200", min: 50, max: 200 },
  { id: "gt200", label: "Over ₪200", min: 200, max: null },
  { id: "gt1000", label: "Over ₪1,000", min: 1000, max: null },
];

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const reviewData = useReviewDataStore();

/** Charges (search everything) or Merchants (label new ones, edit saved names). */
const view = computed<"charges" | "merchants">(() => (route.query.view === "merchants" ? "merchants" : "charges"));
const merchantsWaiting = computed(() => (auth.readOnly && !auth.isDemo ? 0 : reviewData.data?.queue.length ?? 0));

function setView(next: "charges" | "merchants") {
  if (next === view.value) return;
  void router.replace({ name: "browse", query: next === "merchants" ? { view: "merchants" } : {} });
}
const homeData = useHomeDataStore();
const allReport = useAllReportStore();
const loading = ref(true);
const error = ref("");
const months = ref<MonthItem[]>([]);
const allTransactions = ref<Transaction[]>([]);
const selectedMonth = ref("");
/** "See all charges" from a merchant opens Transactions searched for it (?q=). */
const searchQuery = ref(typeof route.query.q === "string" ? route.query.q : "");
watch(
  () => route.query.q,
  (q) => {
    if (typeof q === "string") searchQuery.value = q;
  },
);
const categoryFilter = ref("");
const minAmount = ref("");
const maxAmount = ref("");
const excludingKey = ref<string | null>(null);
const adjustingKey = ref<string | null>(null);
const adjustmentsData = useAdjustmentsDataStore();
const includeRecurring = ref(loadBrowseIncludeRecurring());

watch(includeRecurring, (value) => {
  saveBrowseIncludeRecurring(value);
});

const categoryOptions = CATEGORY_PICKLIST;

const hasActiveFilters = computed(
  () =>
    !!searchQuery.value.trim() ||
    !!selectedMonth.value ||
    !!categoryFilter.value ||
    !!minAmount.value ||
    !!maxAmount.value,
);

const filteredTransactions = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  const min = parseAmount(minAmount.value);
  const max = parseAmount(maxAmount.value);
  const cat = categoryFilter.value;

  return allTransactions.value.filter((tx) => {
    if (!includeRecurring.value && isSystemRecurringTransaction(tx)) return false;
    if (q) {
      const merchant = `${tx.merchant_en} ${tx.merchant_he} ${knownMerchantName(tx.merchant_he) ?? ""} ${merchantDisplayName(tx)}`.toLowerCase();
      if (!merchant.includes(q)) return false;
    }
    if (cat) {
      const rolled = rollupCategory(tx.category_en || "Uncategorized");
      if (rolled !== cat && (tx.category_en || "Uncategorized") !== cat) return false;
    }
    const amount = tx.charge_amount;
    if (min != null && amount < min) return false;
    if (max != null && amount > max) return false;
    return true;
  });
});

const filteredTotal = computed(() =>
  filteredTransactions.value.reduce((sum, tx) => sum + effectiveSpend(tx), 0),
);

function parseAmount(raw: string | number): number | null {
  if (raw === "" || raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

const sheet = ref<"month" | "category" | "amount" | null>(null);
const draftMin = ref("");
const draftMax = ref("");

const monthChipLabel = computed(
  () => {
    const label = months.value.find((m) => m.key === selectedMonth.value)?.label;
    return label ? tr(label) : t("All months");
  },
);

const amountActive = computed(() => !!minAmount.value || !!maxAmount.value);

const amountChipLabel = computed(() => {
  const min = parseAmount(minAmount.value);
  const max = parseAmount(maxAmount.value);
  if (min != null && max != null) return `₪${min}–${max}`;
  if (min != null) return t("Over ₪{n}", { n: min });
  if (max != null) return t("Under ₪{n}", { n: max });
  return t("Amount");
});

const summaryLabel = computed(() => {
  const parts: string[] = [];
  if (categoryFilter.value) parts.push(catName(categoryFilter.value));
  if (searchQuery.value.trim()) parts.push(`“${searchQuery.value.trim()}”`);
  const where = selectedMonth.value ? monthChipLabel.value : t("All months");
  return parts.length ? `${parts.join(" · ")} — ${where}` : `${t("Spent")} — ${where}`;
});

const draftPreset = computed(() => {
  const min = parseAmount(draftMin.value);
  const max = parseAmount(draftMax.value);
  return amountPresets.find((c) => c.min === min && c.max === max)?.id ?? "";
});

function pickMonth(key: string) {
  selectedMonth.value = key;
  sheet.value = null;
}

function openAmount() {
  draftMin.value = String(minAmount.value ?? "");
  draftMax.value = String(maxAmount.value ?? "");
  sheet.value = "amount";
}

function applyDraftPreset(chip: AmountPreset) {
  draftMin.value = chip.min != null ? String(chip.min) : "";
  draftMax.value = chip.max != null ? String(chip.max) : "";
  applyAmount();
}

function applyAmount() {
  minAmount.value = String(draftMin.value ?? "").trim();
  maxAmount.value = String(draftMax.value ?? "").trim();
  sheet.value = null;
}

function resetAmount() {
  draftMin.value = "";
  draftMax.value = "";
  applyAmount();
}

function clearFilters() {
  searchQuery.value = "";
  selectedMonth.value = "";
  categoryFilter.value = "";
  minAmount.value = "";
  maxAmount.value = "";
}

async function loadTransactions(options: { background?: boolean } = {}) {
  error.value = "";
  const month = selectedMonth.value || null;
  const demo = auth.isDemo;
  const token = auth.token || undefined;
  const scoped = month ? homeData.peek(demo, token)?.scoped_reports?.[month] : null;

  if (scoped && !options.background) {
    allTransactions.value = [...scoped.transactions];
    void loadTransactions({ background: true });
    return;
  }

  try {
    // All months: shared cache (instant on return, refreshed in the background).
    const report = month ? await fetchReport(demo, month, token) : await allReport.load(demo, token);
    if (month === (selectedMonth.value || null)) {
      allTransactions.value = [...report.transactions];
    }
  } catch (e) {
    if (!options.background) {
      error.value = e instanceof Error ? e.message : t("Could not load transactions");
      allTransactions.value = [];
    }
  }
}

async function load(options: { background?: boolean; force?: boolean } = {}) {
  const demo = auth.isDemo;
  const token = auth.token || undefined;
  const cached = !options.force && !options.background && homeData.peek(demo, token);

  if (cached) {
    months.value = cached.months;
    loading.value = false;
    await loadTransactions();
    void load({ background: true });
    return;
  }

  if (!options.background) loading.value = true;
  try {
    const bundle = await homeData.load(demo, token, options);
    months.value = bundle.months;
    await loadTransactions({ background: options.background });
  } catch (e) {
    if (!options.background) error.value = e instanceof Error ? e.message : t("Could not load data");
  } finally {
    if (!options.background) loading.value = false;
  }
}

async function excludeTransaction(tx: Transaction) {
  if (auth.readOnly) return;
  const label = `${formatIls(tx.charge_amount)} · ${merchantDisplayName(tx)}`;
  const ok = await confirm({
    title: t("Exclude transaction?"),
    message: t("Exclude {label} from your totals?\n\nYou can restore it anytime from the Excluded tab.", { label }),
    confirmLabel: t("Exclude"),
    tone: "danger",
  });
  if (!ok) return;
  const key = transactionKey(tx);
  excludingKey.value = key;
  try {
    await addExclusion({ transaction: tx, note: "Not my spend" }, auth.token || undefined);
    allTransactions.value = allTransactions.value.filter((t) => transactionKey(t) !== key);
    adjustmentsData.invalidate();
    invalidateSpendingDataCaches();
  } catch (e) {
    window.alert(friendlyError(e));
  } finally {
    excludingKey.value = null;
  }
}

async function adjustTransaction(tx: Transaction) {
  if (auth.readOnly) return;
  const result = await adjustCharge({
    transaction: tx,
    currentReimbursement: tx.reimbursement,
    note: tx.reimbursement_note,
  });
  if (!result) return;
  const key = transactionKey(tx);
  adjustingKey.value = key;
  try {
    await upsertAdjustment(
      { transaction: tx, reimbursement: result.reimbursement, note: result.note },
      auth.token || undefined,
    );
    adjustmentsData.invalidate();
    invalidateSpendingDataCaches();
    await loadTransactions();
  } catch (e) {
    window.alert(friendlyError(e));
  } finally {
    adjustingKey.value = null;
  }
}

watch(selectedMonth, () => {
  if (loading.value) return;
  void loadTransactions();
});

let stopRefresh: (() => void) | undefined;
onMounted(() => {
  void load();
  // A category change or split elsewhere (e.g. from the charge sheet) reloads the list.
  stopRefresh = onSpendingRefresh(() => void loadTransactions());
});
onUnmounted(() => stopRefresh?.());
</script>
