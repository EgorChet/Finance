<template>
  <div class="find">
    <DemoBanner />
    <h2 class="page-title">{{ t("Transactions") }}</h2>
    <div class="seg" role="tablist" :aria-label="t('Transactions')">
      <button type="button" role="tab" class="seg-btn" :class="{ 'seg-btn--on': view === 'charges' }" :aria-selected="view === 'charges'" @click="setView('charges')">
        {{ t("Charges") }}
      </button>
      <button type="button" role="tab" class="seg-btn" :class="{ 'seg-btn--on': view === 'categories' }" :aria-selected="view === 'categories'" @click="setView('categories')">
        {{ t("Categories") }}
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
          <label v-if="view === 'charges'" class="find-search">
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
            <button type="button" class="find-chip find-chip--on" @click="sheet = 'month'">
              {{ periodChipLabel }} <span aria-hidden="true">▾</span>
            </button>
            <button v-if="view === 'charges'" type="button" class="find-chip" :class="{ 'find-chip--on': !!categoryFilter }" @click="sheet = 'category'">
              <template v-if="categoryFilter">{{ catName(categoryFilter) }}</template>
              <template v-else>{{ t("Category") }}</template>
              <span aria-hidden="true">▾</span>
            </button>
            <button v-if="view === 'charges'" type="button" class="find-chip" :class="{ 'find-chip--on': amountActive }" @click="openAmount">
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
            <template v-if="periodMonths > 1.5"> · {{ t("{amount} a month on average", { amount: formatIlsWhole(filteredTotal / periodMonths) }) }}</template>
            <template v-else-if="filteredTransactions.length > 1"> · {{ t("avg {amount}", { amount: formatIlsWhole(filteredTotal / filteredTransactions.length) }) }}</template>
          </p>
        </section>

        <p v-if="!allTransactions.length" class="browse-empty">{{ t("No transactions yet. Upload a statement from the menu.") }}</p>
        <div v-else-if="!filteredTransactions.length" class="find-empty">
          <p>{{ t("No charges match.") }}</p>
          <button type="button" class="btn" @click="clearFilters">{{ t("Clear filters") }}</button>
        </div>
        <ul v-else-if="view === 'categories'" class="pd-cats find-cats">
          <li v-for="row in categoryRows" :key="row.category">
            <button type="button" class="pd-cat find-cat" @click="openCategoryCharges(row.category)">
              <CategoryIcon :category="row.category" />
              <span class="pd-cat-body">
                <span class="pd-cat-top">
                  <span class="pd-cat-name">{{ catName(row.category) }}</span>
                  <b>{{ formatIlsWhole(row.total) }}</b>
                </span>
                <span class="pd-cat-track"><span :style="{ width: `${row.barPct}%` }" /></span>
                <span class="pd-cat-meta">
                  <span>{{ t("{pct}% of spending", { pct: row.sharePct }) }} · {{ t("{n} {n|charge|charges}", { n: row.count }) }}</span>
                  <span v-if="periodMonths > 1.5">{{ t("~{amount}/mo", { amount: formatIlsWhole(row.total / periodMonths) }) }}</span>
                </span>
              </span>
            </button>
          </li>
        </ul>
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

    <BottomSheet :open="sheet === 'month'" :title="t('Period')" @close="sheet = null">
      <div class="find-options">
        <button
          v-for="p in PERIODS"
          :key="p.id"
          type="button"
          class="find-option"
          :class="{ 'find-option--on': !selectedMonth && period === p.id }"
          @click="pickPeriod(p.id)"
        >
          {{ t(p.label) }}
        </button>
        <p class="cp-label">{{ t("One statement month") }}</p>
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
      <CategoryPicker v-model="categoryFilter" :options="categoryOptions" empty-label="Any category" @pick="sheet = null" />
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
import DemoBanner from "@/shared/components/DemoBanner.vue";
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
import CategoryPicker from "@/shared/components/CategoryPicker.vue";
import TransactionList from "@/shared/components/TransactionList.vue";
import CategoryIcon from "@/shared/components/CategoryIcon.vue";
import { referenceDate } from "@/shared/utils/appDate";
import { cycleStartForDate, loadCycleDay } from "@/features/spending/utils/pace";
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
type BrowseViewName = "charges" | "categories" | "merchants";
const view = computed<BrowseViewName>(() =>
  route.query.view === "merchants" ? "merchants" : route.query.view === "categories" ? "categories" : "charges",
);
const merchantsWaiting = computed(() => (auth.readOnly && !auth.isDemo ? 0 : reviewData.data?.queue.length ?? 0));

function setView(next: BrowseViewName) {
  if (next === view.value) return;
  void router.replace({ name: "browse", query: next === "charges" ? {} : { view: next } });
}

/** One period for Charges and Categories: a rolling window, everything, or one statement month. */
type PeriodId = "cycle" | "30d" | "3m" | "12m" | "all";
const PERIODS: { id: PeriodId; label: string; months: number }[] = [
  { id: "cycle", label: "This cycle", months: 1 },
  { id: "30d", label: "Last 30 days", months: 1 },
  { id: "3m", label: "Last 3 months", months: 3 },
  { id: "12m", label: "Last 12 months", months: 12 },
  { id: "all", label: "All time", months: 0 },
];
const PERIOD_KEY = "finance_browse_period";
function readPeriod(): PeriodId {
  // "See all charges" from a merchant searches the whole history.
  if (typeof route.query.q === "string" && route.query.q) return "all";
  try {
    const v = localStorage.getItem(PERIOD_KEY) as PeriodId | null;
    if (v && PERIODS.some((p) => p.id === v)) return v;
  } catch {
    /* private mode */
  }
  return "3m";
}
const period = ref<PeriodId>(readPeriod());

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** First day of the chosen window (YYYY-MM-DD), or "" for everything. */
const periodFrom = computed(() => {
  if (selectedMonth.value || period.value === "all") return "";
  const now = referenceDate(auth.isDemo, auth.demoAsOf);
  if (period.value === "cycle") return cycleStartForDate(now, loadCycleDay());
  if (period.value === "30d") return isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29));
  const n = period.value === "3m" ? 3 : 12;
  return isoDay(new Date(now.getFullYear(), now.getMonth() - n, now.getDate() + 1));
});

function pickPeriod(id: PeriodId) {
  period.value = id;
  selectedMonth.value = "";
  sheet.value = null;
  try {
    localStorage.setItem(PERIOD_KEY, id);
  } catch {
    /* private mode */
  }
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
    if (typeof q === "string") {
      searchQuery.value = q;
      if (q) period.value = "all";
    }
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
    !!categoryFilter.value ||
    !!minAmount.value ||
    !!maxAmount.value,
);

const filteredTransactions = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  const min = parseAmount(minAmount.value);
  const max = parseAmount(maxAmount.value);
  const cat = categoryFilter.value;

  const from = periodFrom.value;
  // Categories shows every category of the period; the other filters belong to the charge list.
  const listFilters = view.value !== "categories";

  return allTransactions.value.filter((tx) => {
    if (!includeRecurring.value && isSystemRecurringTransaction(tx)) return false;
    if (from && tx.date.slice(0, 10) < from) return false;
    if (!listFilters) return true;
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

const periodChipLabel = computed(() => {
  const label = months.value.find((m) => m.key === selectedMonth.value)?.label;
  if (label) return tr(label);
  return t(PERIODS.find((p) => p.id === period.value)?.label ?? "All time");
});

/** How many months the view covers, for "a month on average" (0 = one month or unknown). */
const periodMonths = computed(() => {
  if (selectedMonth.value) return 1;
  const fixed = PERIODS.find((p) => p.id === period.value)?.months ?? 0;
  if (fixed) return fixed;
  const dates = allTransactions.value.map((tx) => tx.date.slice(0, 10)).sort();
  if (dates.length < 2) return 1;
  const days = (new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / 86400000;
  return Math.max(1, days / 30.4);
});

/** Categories of the period, biggest first, each with its share of the spending. */
const categoryRows = computed(() => {
  const by = new Map<string, { total: number; count: number }>();
  for (const tx of filteredTransactions.value) {
    const cat = rollupCategory(tx.category_en || "Uncategorized");
    const row = by.get(cat) ?? { total: 0, count: 0 };
    row.total += effectiveSpend(tx);
    row.count += 1;
    by.set(cat, row);
  }
  const rows = [...by.entries()].map(([category, v]) => ({ category, ...v })).filter((r) => r.total > 0);
  const sum = rows.reduce((s, r) => s + r.total, 0) || 1;
  const top = Math.max(1, ...rows.map((r) => r.total));
  return rows
    .sort((a, b) => b.total - a.total)
    .map((r) => ({ ...r, sharePct: Math.round((r.total / sum) * 100), barPct: Math.max(2, Math.round((r.total / top) * 100)) }));
});

/** Tap a category: its charges for the same period. */
function openCategoryCharges(category: string) {
  categoryFilter.value = category;
  setView("charges");
}

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
  const where = periodChipLabel.value;
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
