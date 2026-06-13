<template>
  <AppLoader
    v-if="loading"
    title="Loading spending overview"
    subtitle="Fetching your statements and cycle data"
  />
  <ErrorBanner
    v-else-if="error"
    title="Could not load overview"
    :message="error"
    dismissible
    @dismiss="error = ''"
  />
  <template v-else-if="report">
    <div v-if="auth.isDemo" class="demo-banner">
      Demo mode — sample spending data. Sign in to see your real statements.
    </div>
    <h2 style="margin: 0 0 1rem">Spending overview</h2>
    <MonthPicker :model-value="selectedMonth" :months="displayMonths" @update:model-value="onMonthSelected" />
    <MonthlyTrendChart v-if="selectedMonth === null && summary.length > 1" :summary="summary" />
    <SummaryMetrics v-if="showSummaryMetrics" :report="report" @select-category="onCategory" />
    <PaceCard
      v-if="isLiveCycleSelected"
      :transactions="paceTransactions"
      :latest-billing-date="latestBillingDate"
      :configured-charges="configuredCharges"
      @settings-change="onPaceSettingsChange"
    />
    <PendingCycleCard
      v-if="isPendingCycleSelected && selectedCycleStart"
      :cycle-start="selectedCycleStart"
      @settings-change="onPaceSettingsChange"
    />
    <template v-if="showCategoryExplorer">
    <p class="section-title">Where did the money go?</p>
    <div class="explorer-grid">
      <div>
        <CategoryPieChart :categories="report.by_category" :selected="app.selectedCategory" @select="onCategory" />
        <p v-if="drillTitle" class="category-pie-note">Selected · {{ drillTitle }}</p>
      </div>
      <div>
        <CategoryLegend v-if="!app.selectedCategory" :categories="report.by_category" @select="onCategory" />
        <div v-else-if="isOtherView" class="category-drilldown">
          <div class="category-drilldown-header">
            <div>
              <h3 class="category-drilldown-title">Other · {{ otherCategories.length }} categories</h3>
              <p class="category-drilldown-total">{{ formatIls(otherTotal) }}</p>
              <p class="category-drilldown-meta">Tap a category to see merchants and charges</p>
            </div>
            <button type="button" class="btn btn-ghost" @click="app.clearCategory()">← All categories</button>
          </div>
          <button
            v-for="row in otherCategories"
            :key="row.category_en"
            type="button"
            class="cost-breakdown-row"
            @click="onCategory(row.category_en)"
          >
            <span>{{ row.category_en }}</span>
            <span class="cost-breakdown-amount">
              {{ formatIls(row.total) }}
              <span class="cost-breakdown-pct">{{ otherPct(row.total) }}%</span>
            </span>
          </button>
        </div>
        <div v-else-if="selectedCategoryStats" class="category-drilldown">
          <div class="category-drilldown-header">
            <div>
              <h3 class="category-drilldown-title">{{ app.selectedCategory }}</h3>
              <p class="category-drilldown-total">{{ formatIls(selectedCategoryStats.total) }}</p>
              <p class="category-drilldown-meta">
                {{ selectedCategoryStats.sharePct }}% of total spending
                · {{ selectedCategoryStats.count.toLocaleString() }}
                {{ selectedCategoryStats.count === 1 ? "charge" : "charges" }}
                · {{ selectedCategoryStats.merchantCount.toLocaleString() }}
                {{ selectedCategoryStats.merchantCount === 1 ? "merchant" : "merchants" }}
              </p>
            </div>
            <button type="button" class="btn btn-ghost" @click="goBack">{{ backLabel }}</button>
          </div>
          <MerchantBarChart :transactions="filteredTxs" :category="app.selectedCategory" />
        </div>
      </div>
    </div>
    <TransactionList
      v-if="!isOtherView"
      :transactions="filteredTxs"
      :title="transactionTitle"
      :show-category="!app.selectedCategory"
      :category-filter="categoryFilter || undefined"
      :statement-billing="selectedMonth ? statementBilling : null"
    />
    </template>
    <p v-else-if="isCycleTabSelected" class="pace-cycle-pending-note">
      Category breakdown and transactions will appear once this cycle’s statement is uploaded.
    </p>
    <details style="margin-top: 1.5rem">
      <summary>Search or fix a label</summary>
      <p v-if="auth.isDemo" style="color: var(--text-muted); font-size: 0.85rem; margin: 0.5rem 0 0">
        Demo mode — search only. Sign in to save label fixes.
      </p>
      <input v-model="search" class="input" placeholder="Merchant, category, amount…" style="margin-top: 0.5rem" />
      <div class="table-scroll">
        <table v-if="searchMerchants.length" class="rules label-fix-table" style="margin-top: 0.75rem">
          <thead>
            <tr>
              <th>Date</th>
              <th>Amount</th>
              <th>Hebrew</th>
              <th>English</th>
              <th>Category</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in searchMerchants" :key="row.key">
              <td class="label-fix-date">{{ formatTransactionDate(row.date) }}</td>
              <td class="label-fix-amount">{{ formatIls(row.amount) }}</td>
              <td>{{ row.hebrew }}</td>
              <td>
                <input v-model="row.english" class="input" :readonly="auth.isDemo" />
              </td>
              <td>
                <input v-model="row.category" class="input" list="overview-spending-cats" :readonly="auth.isDemo" />
              </td>
              <td>
                <button
                  class="btn btn-primary"
                  style="white-space: nowrap"
                  :disabled="auth.isDemo || row.saving"
                  @click="saveLabel(row)"
                >
                  {{ row.saving ? "Saving…" : "Save" }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="searchHint" style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0.5rem">{{ searchHint }}</p>
      <datalist id="overview-spending-cats">
        <option v-for="c in categories" :key="c" :value="c" />
      </datalist>
    </details>
  </template>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { fetchFixedCharges, fetchMonths, fetchReport, saveRuleEntry } from "../api/client";
import CategoryLegend from "../components/CategoryLegend.vue";
import CategoryPieChart from "../components/CategoryPieChart.vue";
import AppLoader from "../components/AppLoader.vue";
import ErrorBanner from "../components/ErrorBanner.vue";
import MerchantBarChart from "../components/MerchantBarChart.vue";
import MonthPicker from "../components/MonthPicker.vue";
import MonthlyTrendChart from "../components/MonthlyTrendChart.vue";
import PaceCard from "../components/PaceCard.vue";
import PendingCycleCard from "../components/PendingCycleCard.vue";
import SummaryMetrics from "../components/SummaryMetrics.vue";
import TransactionList from "../components/TransactionList.vue";
import { useAppStore } from "../stores/app";
import { useAuthStore } from "../stores/auth";
import type { MonthItem, SpendingReport, Transaction } from "../types";
import {
  groupCategoriesForPie,
  isOtherBucketLabel,
  OTHER_BUCKET,
  SPENDING_CATEGORIES,
} from "../categories";
import {
  buildCycleReport,
  cycleStartFromMonthKey,
  currentCycleMonthKey,
  getCycleRangeForStart,
  isCycleMonthKey,
  loadCycleDay,
  loadManualCycleSpend,
  loadPaceIncludeFixed,
  mergeMonthsWithOpenCycles,
} from "../utils/pace";
import { billingCycleLabel, formatIls, formatTransactionDate, openCycleTabLabel, roundMoney } from "../utils/format";
import type { ConfiguredCharge } from "../utils/fixedCharges";

const categories = SPENDING_CATEGORIES;

interface SearchMerchantRow {
  key: string;
  date: string;
  amount: number;
  hebrew: string;
  english: string;
  category: string;
  saving: boolean;
}

const auth = useAuthStore();
const app = useAppStore();
const loading = ref(true);
const error = ref("");
const report = ref<SpendingReport | null>(null);
const paceReport = ref<SpendingReport | null>(null);
const configuredCharges = ref<ConfiguredCharge[]>([]);
const months = ref<MonthItem[]>([]);
const summary = ref<{ month: string; total: number }[]>([]);
const selectedMonth = ref<string | null>(null);
const search = ref("");
const searchHint = ref("");
const searchMerchants = ref<SearchMerchantRow[]>([]);
const cycleDay = ref(loadCycleDay());

const latestBillingDate = computed(() => {
  if (!months.value.length) return null;
  const sorted = [...months.value].sort((a, b) => b.billing_date.localeCompare(a.billing_date));
  return sorted[0]?.billing_date ?? null;
});

const displayMonths = computed(() => {
  const merged = mergeMonthsWithOpenCycles(months.value, cycleDay.value, latestBillingDate.value);
  return merged.map((m) => ({
    ...m,
    label: m.inProgress || m.pendingStatement
      ? openCycleTabLabel(m.billing_date)
      : billingCycleLabel(m.billing_date),
  }));
});

const selectedCycleStart = computed(() =>
  isCycleMonthKey(selectedMonth.value) ? cycleStartFromMonthKey(selectedMonth.value!) : null,
);

const selectedOpenCycle = computed(() =>
  displayMonths.value.find((m) => m.key === selectedMonth.value) ?? null,
);

const isLiveCycleSelected = computed(() => selectedOpenCycle.value?.inProgress === true);
const isPendingCycleSelected = computed(() => selectedOpenCycle.value?.pendingStatement === true);
const isCycleTabSelected = computed(() => isCycleMonthKey(selectedMonth.value));

const isInProgressCycle = computed(
  () => !!report.value?.metadata?.in_progress && !report.value?.metadata?.pending_statement,
);

const showCategoryExplorer = computed(() => {
  if (!report.value) return false;
  if (!isInProgressCycle.value) return true;
  if (report.value.metadata?.pending_statement) return false;
  return report.value.transactions.length > 0;
});

const showSummaryMetrics = computed(() => {
  if (!report.value) return false;
  if (!isInProgressCycle.value) return true;
  if (report.value.metadata?.pending_statement) {
    return report.value.total_spent > 0;
  }
  return showCategoryExplorer.value;
});

const pieGroup = computed(() =>
  report.value ? groupCategoriesForPie(report.value.by_category) : { top: [], other: [] },
);

const otherCategories = computed(() => pieGroup.value.other);
const otherCategoryNames = computed(() => new Set(otherCategories.value.map((c) => c.category_en)));
const otherTotal = computed(() => roundMoney(otherCategories.value.reduce((s, c) => s + c.total, 0)));

const isOtherView = computed(() => app.selectedCategory === OTHER_BUCKET);
const isOtherChild = computed(
  () => !!app.selectedCategory && otherCategoryNames.value.has(app.selectedCategory),
);

const statementBilling = computed(() => {
  const meta = report.value?.metadata;
  const billing = meta?.billing_date as string | undefined;
  if (billing) return billingCycleLabel(billing);
  const label = meta?.month_label as string | undefined;
  if (label) return label;
  return null;
});

const paceTransactions = computed(() => paceReport.value?.transactions ?? []);

const categoryFilter = computed(() => {
  if (!app.selectedCategory || isOtherView.value) return null;
  return app.selectedCategory;
});

const filteredTxs = computed((): Transaction[] => {
  if (!report.value) return [];
  if (!app.selectedCategory) return report.value.transactions;
  if (isOtherView.value) return [];
  if (isOtherChild.value) {
    return report.value.transactions.filter((t) => t.category_en === app.selectedCategory);
  }
  if (app.selectedCategory.startsWith("Other")) {
    const top = new Set(pieGroup.value.top.map((c) => c.category_en));
    return report.value.transactions.filter((t) => !top.has(t.category_en));
  }
  return report.value.transactions.filter((t) => t.category_en === app.selectedCategory);
});

const selectedCategoryStats = computed(() => {
  if (!report.value || !app.selectedCategory || isOtherView.value) return null;
  const txs = filteredTxs.value;
  const summaryRow = report.value.by_category.find((c) => c.category_en === app.selectedCategory);
  const total = roundMoney(summaryRow?.total ?? txs.reduce((sum, t) => sum + t.charge_amount, 0));
  const sharePct = summaryRow
    ? Math.round(summaryRow.share_pct)
    : report.value.total_spent
      ? Math.round((total / report.value.total_spent) * 100)
      : 0;
  const merchantCount = new Set(txs.map((t) => t.merchant_en || t.merchant_he)).size;
  return {
    total,
    count: summaryRow?.count ?? txs.length,
    sharePct,
    merchantCount,
  };
});

const drillTitle = computed(() => {
  if (isOtherView.value) return formatIls(otherTotal.value);
  if (selectedCategoryStats.value) return formatIls(selectedCategoryStats.value.total);
  return "";
});

const transactionTitle = computed(() => {
  if (app.selectedCategory && selectedCategoryStats.value) {
    return `Transactions · ${app.selectedCategory} · ${formatIls(selectedCategoryStats.value.total)}`;
  }
  return "Transactions";
});

const backLabel = computed(() => (isOtherChild.value ? "← Other" : "← All categories"));

const searchResults = computed(() => {
  if (!report.value || !search.value.trim()) return [];
  const q = search.value.toLowerCase();
  return report.value.transactions
    .filter(
      (t) =>
        (t.merchant_en || "").toLowerCase().includes(q) ||
        t.merchant_he.includes(q) ||
        (t.category_en || "").toLowerCase().includes(q) ||
        String(t.charge_amount).includes(q),
    )
    .slice(0, 200);
});

watch(searchResults, (txs) => {
  searchHint.value = "";
  if (!txs.length) {
    searchMerchants.value = [];
    return;
  }
  searchMerchants.value = [...txs]
    .sort((a, b) => b.date.localeCompare(a.date) || b.charge_amount - a.charge_amount)
    .map((t) => ({
      key: `${t.date}|${t.merchant_he}|${t.charge_amount}`,
      date: t.date,
      amount: t.charge_amount,
      hebrew: t.merchant_he,
      english: t.merchant_en || "",
      category: t.category_en || "",
      saving: false,
    }));
});

function otherPct(amount: number): number {
  return otherTotal.value ? Math.round((roundMoney(amount) / otherTotal.value) * 100) : 0;
}

function onCategory(name: string) {
  if (isOtherBucketLabel(name)) {
    app.selectedCategory = app.selectedCategory === OTHER_BUCKET ? "" : OTHER_BUCKET;
    return;
  }
  app.selectedCategory = app.selectedCategory === name ? "" : name;
}

function goBack() {
  if (isOtherChild.value) {
    app.selectedCategory = OTHER_BUCKET;
  } else {
    app.clearCategory();
  }
}

async function saveLabel(row: SearchMerchantRow) {
  if (auth.isDemo) return;
  row.saving = true;
  searchHint.value = "";
  try {
    await saveRuleEntry(
      {
        hebrew: row.hebrew,
        english: row.english.trim(),
        category: row.category.trim() || undefined,
      },
      auth.token || undefined,
    );
    await refreshReport();
    await refreshPaceReport();
    searchHint.value = `Saved "${row.english || row.hebrew}" → ${row.category || "Uncategorized"}. Charts updated.`;
  } catch (e) {
    searchHint.value = String(e);
  } finally {
    row.saving = false;
  }
}

let reportRequestId = 0;

function buildLocalCycleReport(monthKey: string): SpendingReport {
  const txs = paceReport.value?.transactions ?? [];
  const start = cycleStartFromMonthKey(monthKey);
  const { end } = getCycleRangeForStart(start, cycleDay.value);
  return buildCycleReport(txs, start, end, {
    includeFixed: loadPaceIncludeFixed(),
    manualSpend: loadManualCycleSpend(start),
    configuredCharges: configuredCharges.value,
  });
}

async function refreshReport(month: string | null = selectedMonth.value) {
  if (month && isCycleMonthKey(month)) {
    if (!paceReport.value) await refreshPaceReport();
    report.value = buildLocalCycleReport(month);
    error.value = "";
    return;
  }
  const reqId = ++reportRequestId;
  const demo = auth.isDemo;
  const token = auth.token || undefined;
  try {
    const r = await fetchReport(demo, month, token);
    if (reqId !== reportRequestId) return;
    report.value = r;
    error.value = "";
  } catch (e) {
    if (reqId !== reportRequestId) return;
    error.value = String(e);
  }
}

async function refreshConfiguredCharges() {
  const demo = auth.isDemo;
  const token = auth.token || undefined;
  try {
    const data = await fetchFixedCharges(demo, token);
    configuredCharges.value = data.charges;
  } catch {
    configuredCharges.value = [];
  }
}

async function refreshPaceReport() {
  const demo = auth.isDemo;
  const token = auth.token || undefined;
  try {
    paceReport.value = await fetchReport(demo, null, token);
  } catch {
    paceReport.value = null;
  }
}

async function onMonthSelected(month: string | null) {
  selectedMonth.value = month;
  app.clearCategory();
  await refreshReport(month);
}

function onPaceSettingsChange() {
  cycleDay.value = loadCycleDay();
  if (isCycleMonthKey(selectedMonth.value)) {
    void refreshReport(selectedMonth.value);
  }
}

async function loadMonths() {
  loading.value = true;
  error.value = "";
  try {
    const demo = auth.isDemo;
    const token = auth.token || undefined;
    const m = await fetchMonths(demo, token);
    months.value = m.months;
    summary.value = m.summary.map((row) => ({
      ...row,
      month: billingCycleLabel(row.billing_date),
    }));
    await Promise.all([refreshPaceReport(), refreshConfiguredCharges()]);
    const latest = m.months.length
      ? [...m.months].sort((a, b) => b.billing_date.localeCompare(a.billing_date))[0]!.billing_date
      : null;
    const merged = mergeMonthsWithOpenCycles(m.months, cycleDay.value, latest);
    const currentKey = currentCycleMonthKey(cycleDay.value);
    const hasCurrent = merged.some((x) => x.key === currentKey);
    const initial = hasCurrent ? currentKey : m.months[0]?.key ?? null;
    selectedMonth.value = initial;
    await refreshReport(initial);
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}

onMounted(loadMonths);
</script>
