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
    <div v-if="auth.isDemo" class="demo-banner demo-banner-showcase">
      <strong>Demo household</strong> — 9 months of sample Visa spending (~₪19k/cycle), live pace, categories &amp; partial snapshot. Sign in to use your real Leumi exports.
    </div>
    <h2 class="overview-page-title">Spending overview</h2>
    <div v-if="partialCycleBanner" class="demo-banner partial-statement-banner">
      {{ partialCycleBanner }}
    </div>
    <MonthPicker :model-value="selectedMonth" :months="displayMonths" @update:model-value="onMonthSelected" />
    <MonthlyTrendChart v-if="selectedMonth === null && summary.length > 1" :summary="summary" />
    <SummaryMetrics v-if="showSummaryMetrics" :report="report" @select-category="onCategory" />
    <PaceCard
      v-if="showPaceCard"
      :transactions="paceTransactions"
      :latest-billing-date="latestFinalBillingDate"
      :configured-charges="configuredCharges"
      :partial-statement-active="partialStatementActive"
      :partial-variable-spend="partialVariableSpend"
      :partial-total-spend="partialTotalSpend"
      :reference-date="refDate"
      @settings-change="onPaceSettingsChange"
    />
    <PendingCycleCard
      v-if="isPendingCycleSelected && selectedCycleStart"
      :cycle-start="selectedCycleStart"
      @settings-change="onPaceSettingsChange"
    />
    <template v-if="showCategoryExplorer">
    <p class="section-title">Where did the money go?</p>
    <div class="explorer-grid" :class="{ 'explorer-grid--no-pie': hidePieChart }">
      <div v-if="!hidePieChart" class="explorer-pie-col">
        <CategoryPieChart :categories="displayCategories" :selected="app.selectedCategory" @select="onCategory" />
        <p v-if="drillTitle" class="category-pie-note">Selected · {{ drillTitle }}</p>
      </div>
      <div class="explorer-legend-col">
        <CategoryLegend v-if="!app.selectedCategory" :categories="displayCategories" @select="onCategory" />
        <div v-else-if="isHomeView" class="category-drilldown">
          <div class="category-drilldown-header">
            <div>
              <h3 class="category-drilldown-title">{{ HOME_LIVING }}</h3>
              <p class="category-drilldown-total">{{ formatIls(homeTotal) }}</p>
              <p class="category-drilldown-meta">Tap a section to see charges</p>
            </div>
            <button type="button" class="btn btn-ghost" @click="app.clearCategory()">← All categories</button>
          </div>
          <button
            v-for="row in homeSubsections"
            :key="row.category_en"
            type="button"
            class="cost-breakdown-row"
            @click="onCategory(row.category_en)"
          >
            <span>{{ homeSubsectionLabel(row.category_en) }}</span>
            <span class="cost-breakdown-amount">
              {{ formatIls(row.total) }}
              <span class="cost-breakdown-pct">{{ homePct(row.total) }}%</span>
            </span>
          </button>
        </div>
        <div v-else-if="isSubscriptionsView" class="category-drilldown">
          <div class="category-drilldown-header">
            <div>
              <h3 class="category-drilldown-title">Subscriptions</h3>
              <p class="category-drilldown-total">{{ formatIls(subscriptionsTotal) }}</p>
              <p class="category-drilldown-meta">Mobile, gym, apps &amp; streaming</p>
            </div>
            <button type="button" class="btn btn-ghost" @click="app.clearCategory()">← All categories</button>
          </div>
          <button
            v-for="row in subscriptionSubsectionRows"
            :key="row.name"
            type="button"
            class="cost-breakdown-row"
            @click="onCategory(row.name)"
          >
            <span>{{ row.name }}</span>
            <span class="cost-breakdown-amount">
              {{ formatIls(row.total) }}
              <span class="cost-breakdown-pct">{{ subscriptionPct(row.total) }}%</span>
            </span>
          </button>
        </div>
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
              <h3 class="category-drilldown-title">{{ selectedCategoryStats.title || app.selectedCategory }}</h3>
              <p class="category-drilldown-total">{{ formatIls(selectedCategoryStats.total) }}</p>
              <p class="category-drilldown-meta">
                {{ selectedCategoryStats.sharePct }}% of total spending
                · {{ selectedCategoryStats.count.toLocaleString() }}
                {{ selectedCategoryStats.count === 1 ? "charge" : "charges" }}
              </p>
            </div>
            <button type="button" class="btn btn-ghost" @click="goBack">{{ backLabel }}</button>
          </div>
          <TransactionList
            class="category-drilldown-txs"
            :transactions="filteredTxs"
            title="Charges"
            :show-category="false"
            :statement-billing="selectedMonth ? statementBilling : null"
            :excludeable="!auth.isDemo"
            :excluding-key="excludingKey"
            @exclude="excludeTransaction"
          />
        </div>
      </div>
    </div>
    <TransactionList
      v-if="!app.selectedCategory && !isOtherView && !isHomeView && !isSubscriptionsView"
      :transactions="filteredTxs"
      title="All charges"
      show-category
      :statement-billing="selectedMonth ? statementBilling : null"
      :excludeable="!auth.isDemo"
      :excluding-key="excludingKey"
      @exclude="excludeTransaction"
    />
    </template>
    <p v-else-if="isCycleTabSelected && !report?.metadata?.provisional" class="pace-cycle-pending-note">
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
              <th v-if="!auth.isDemo"></th>
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
              <td v-if="!auth.isDemo">
                <button
                  type="button"
                  class="btn btn-ghost"
                  style="white-space: nowrap"
                  :disabled="excludingKey === row.key"
                  @click="excludeFromSearch(row)"
                >
                  {{ excludingKey === row.key ? "…" : "Exclude" }}
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
import { addExclusion, fetchFixedCharges, fetchMonths, fetchReport, saveRuleEntry } from "../api/client";
import CategoryLegend from "../components/CategoryLegend.vue";
import CategoryPieChart from "../components/CategoryPieChart.vue";
import AppLoader from "../components/AppLoader.vue";
import ErrorBanner from "../components/ErrorBanner.vue";
import MonthPicker from "../components/MonthPicker.vue";
import MonthlyTrendChart from "../components/MonthlyTrendChart.vue";
import PaceCard from "../components/PaceCard.vue";
import PendingCycleCard from "../components/PendingCycleCard.vue";
import SummaryMetrics from "../components/SummaryMetrics.vue";
import TransactionList from "../components/TransactionList.vue";
import { useCompactLayout } from "../composables/useCompactLayout";
import { useAppStore } from "../stores/app";
import { useAuthStore } from "../stores/auth";
import type { MonthItem, SpendingReport, Transaction } from "../types";
import {
  CATEGORY_PICKLIST,
  groupCategoriesForPie,
  HOME_LIVING,
  homeSubsectionLabel,
  isHomeSubsection,
  isOtherBucketLabel,
  OTHER_BUCKET,
  rollupCategoriesForDisplay,
  rollupCategory,
  splitFixedVariable,
} from "../categories";
import {
  buildCycleReport,
  cycleStartForDate,
  cycleStartForStatementBilling,
  cycleStartFromMonthKey,
  cycleNeedsOpenTab,
  defaultOverviewMonthKey,
  findPartialMonth,
  getCycleRangeForStart,
  isCycleMonthKey,
  latestFinalBillingDate as getLatestFinalBillingDate,
  loadCycleDay,
  loadManualCycleSpend,
  loadPaceIncludeFixed,
  mergeMonthsWithOpenCycles,
} from "../utils/pace";
import { referenceDate } from "../utils/appDate";
import { billingCycleLabel, formatIls, formatTransactionDate, openCycleTabLabel, roundMoney } from "../utils/format";
import { transactionKey } from "../utils/transactionKey";
import { subscriptionSubsectionLabel, subscriptionSubsectionTotals } from "../utils/subscriptionSections";
import type { ConfiguredCharge } from "../utils/fixedCharges";

const categories = CATEGORY_PICKLIST;

const { isCompact } = useCompactLayout(768);
/** Phone / narrow layout: category list only — pie is hard to read on small screens. */
const hidePieChart = isCompact;

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
const excludingKey = ref<string | null>(null);
const cycleDay = ref(loadCycleDay());
const partialReportCache = ref<Map<string, SpendingReport>>(new Map());

const latestFinalBillingDate = computed(() => getLatestFinalBillingDate(months.value));

const refDate = computed(() => referenceDate(auth.isDemo, auth.demoAsOf));

const displayMonths = computed(() => {
  const merged = mergeMonthsWithOpenCycles(months.value, cycleDay.value, refDate.value);
  const todayStart = cycleStartForDate(refDate.value, cycleDay.value);
  return merged.map((m) => {
    if (m.inProgress || m.pendingStatement) {
      return { ...m, label: openCycleTabLabel(m.billing_date) };
    }
    const base = billingCycleLabel(m.billing_date);
    if (m.partial) {
      const cycleStart = cycleStartForStatementBilling(m.billing_date, cycleDay.value);
      const isCurrentCycle =
        cycleStart === todayStart && cycleNeedsOpenTab(cycleStart, cycleDay.value, months.value);
      return { ...m, label: `${base} · partial`, isCurrentCycle };
    }
    return { ...m, label: base };
  });
});

const activeCycleStart = computed((): string | null => {
  const key = selectedMonth.value;
  if (!key) return null;
  if (isCycleMonthKey(key)) return cycleStartFromMonthKey(key);
  const month = months.value.find((m) => m.key === key);
  if (month?.partial) return cycleStartForStatementBilling(month.billing_date, cycleDay.value);
  return null;
});

const selectedCycleStart = activeCycleStart;

const isLiveCycleSelected = computed(() => {
  const start = activeCycleStart.value;
  if (!start || !cycleNeedsOpenTab(start, cycleDay.value, months.value)) return false;
  if (isCycleMonthKey(selectedMonth.value!)) {
    return selectedOpenCycle.value?.inProgress === true;
  }
  return start === cycleStartForDate(refDate.value, cycleDay.value);
});

const isPartialForOpenCycle = computed(() => {
  const month = months.value.find((m) => m.key === selectedMonth.value);
  if (!month?.partial) return false;
  const start = cycleStartForStatementBilling(month.billing_date, cycleDay.value);
  return cycleNeedsOpenTab(start, cycleDay.value, months.value);
});

const showPaceCard = computed(() => isLiveCycleSelected.value || isPartialForOpenCycle.value);

const partialStatementActive = computed(() => isPartialForOpenCycle.value);

const partialCycleBanner = computed(() => {
  if (partialStatementActive.value) {
    return "Partial snapshot for this cycle — pace and categories from your latest export. Re-upload anytime; choose Final when the bill is complete.";
  }
  if (isLiveCycleSelected.value && !findPartialMonth(months.value, activeCycleStart.value!, cycleDay.value)) {
    return "No statement yet — enter spending below or upload a partial export from the bank.";
  }
  return "";
});

const selectedOpenCycle = computed(() =>
  displayMonths.value.find((m) => m.key === selectedMonth.value) ?? null,
);

const isPendingCycleSelected = computed(() => {
  if (!isCycleMonthKey(selectedMonth.value)) return false;
  return selectedOpenCycle.value?.pendingStatement === true;
});
const isCycleTabSelected = computed(() => isCycleMonthKey(selectedMonth.value));

const isInProgressCycle = computed(
  () => !!report.value?.metadata?.in_progress && !report.value?.metadata?.pending_statement,
);

const showCategoryExplorer = computed(() => {
  if (!report.value) return false;
  if (isPartialForOpenCycle.value) {
    return report.value.transactions.length > 0;
  }
  if (!isInProgressCycle.value) return true;
  if (report.value.metadata?.pending_statement) return false;
  return report.value.transactions.length > 0;
});

const showSummaryMetrics = computed(() => {
  if (!report.value) return false;
  if (isPartialForOpenCycle.value) return report.value.total_spent > 0;
  if (!isInProgressCycle.value) return true;
  if (report.value.metadata?.pending_statement) {
    return report.value.total_spent > 0;
  }
  return showCategoryExplorer.value;
});

const pieGroup = computed(() =>
  report.value ? groupCategoriesForPie(report.value.by_category) : { top: [], other: [] },
);

const displayCategories = computed(() =>
  report.value ? rollupCategoriesForDisplay(report.value.by_category) : [],
);

const homeSubsections = computed(() => {
  if (!report.value) return [];
  return report.value.by_category
    .filter((c) => isHomeSubsection(c.category_en) && c.category_en !== HOME_LIVING)
    .sort((a, b) => b.total - a.total);
});

const homeTotal = computed(() => roundMoney(homeSubsections.value.reduce((s, c) => s + c.total, 0)));

const subscriptionTransactions = computed(() => {
  if (!report.value) return [];
  return report.value.transactions.filter((t) => rollupCategory(t.category_en) === "Subscriptions");
});

const subscriptionSubsectionRows = computed(() => subscriptionSubsectionTotals(subscriptionTransactions.value));

const subscriptionsTotal = computed(() =>
  roundMoney(subscriptionSubsectionRows.value.reduce((s, r) => s + r.total, 0)),
);

const isHomeView = computed(() => app.selectedCategory === HOME_LIVING);
const isHomeChild = computed(() =>
  homeSubsections.value.some((r) => r.category_en === app.selectedCategory),
);

const isSubscriptionsView = computed(() => app.selectedCategory === "Subscriptions");
const isSubscriptionsChild = computed(() =>
  subscriptionSubsectionRows.value.some((r) => r.name === app.selectedCategory),
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

const paceTransactions = computed(() => {
  // Keep full history for pace averages; partial totals come from partialVariableSpend overrides.
  return paceReport.value?.transactions ?? report.value?.transactions ?? [];
});

const partialVariableSpend = computed(() => {
  if (!isPartialForOpenCycle.value || !report.value) return null;
  return splitFixedVariable(report.value.by_category).variable;
});

const partialTotalSpend = computed(() => {
  if (!isPartialForOpenCycle.value || !report.value) return null;
  return report.value.total_spent;
});


const filteredTxs = computed((): Transaction[] => {
  if (!report.value) return [];
  if (!app.selectedCategory) return report.value.transactions;
  if (isOtherView.value || isHomeView.value || isSubscriptionsView.value) return [];
  if (isOtherChild.value) {
    return report.value.transactions.filter((t) => t.category_en === app.selectedCategory);
  }
  if (isHomeChild.value) {
    return report.value.transactions.filter((t) => t.category_en === app.selectedCategory);
  }
  if (isSubscriptionsChild.value) {
    return report.value.transactions.filter(
      (t) =>
        rollupCategory(t.category_en) === "Subscriptions" &&
        subscriptionSubsectionLabel(t) === app.selectedCategory,
    );
  }
  if (app.selectedCategory.startsWith("Other")) {
    const top = new Set(pieGroup.value.top.map((c) => c.category_en));
    return report.value.transactions.filter((t) => !top.has(rollupCategory(t.category_en)));
  }
  return report.value.transactions.filter((t) => rollupCategory(t.category_en) === app.selectedCategory);
});

const selectedCategoryStats = computed(() => {
  if (!report.value || !app.selectedCategory || isOtherView.value || isHomeView.value || isSubscriptionsView.value) {
    return null;
  }
  const txs = filteredTxs.value;
  const rolled = rollupCategory(app.selectedCategory);
  const summaryRow = displayCategories.value.find((c) => c.category_en === rolled);
  const subsectionRow = isHomeChild.value
    ? homeSubsections.value.find((c) => c.category_en === app.selectedCategory)
    : isSubscriptionsChild.value
      ? subscriptionSubsectionRows.value.find((r) => r.name === app.selectedCategory)
      : null;
  const total = roundMoney(
    subsectionRow && "total" in subsectionRow
      ? subsectionRow.total
      : txs.reduce((sum, t) => sum + t.charge_amount, 0),
  );
  const sharePct = summaryRow
    ? Math.round(summaryRow.share_pct)
    : report.value.total_spent
      ? Math.round((total / report.value.total_spent) * 100)
      : 0;
  return {
    total,
    count: txs.length,
    sharePct,
    title: isHomeChild.value
      ? homeSubsectionLabel(app.selectedCategory)
      : app.selectedCategory,
  };
});

const drillTitle = computed(() => {
  if (isOtherView.value) return formatIls(otherTotal.value);
  if (selectedCategoryStats.value) return formatIls(selectedCategoryStats.value.total);
  return "";
});

const backLabel = computed(() => {
  if (isOtherChild.value) return "← Other";
  if (isHomeChild.value) return `← ${HOME_LIVING}`;
  if (isSubscriptionsChild.value) return "← Subscriptions";
  return "← All categories";
});

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
      key: transactionKey(t),
      date: t.date,
      amount: t.charge_amount,
      hebrew: t.merchant_he,
      english: t.merchant_en || "",
      category: t.category_en || "",
      saving: false,
    }));
});

function homePct(amount: number): number {
  return homeTotal.value ? Math.round((roundMoney(amount) / homeTotal.value) * 100) : 0;
}

function subscriptionPct(amount: number): number {
  return subscriptionsTotal.value ? Math.round((roundMoney(amount) / subscriptionsTotal.value) * 100) : 0;
}

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
  } else if (isHomeChild.value) {
    app.selectedCategory = HOME_LIVING;
  } else if (isSubscriptionsChild.value) {
    app.selectedCategory = "Subscriptions";
  } else {
    app.clearCategory();
  }
}

async function afterExclusionChange() {
  const demo = auth.isDemo;
  const token = auth.token || undefined;
  const m = await fetchMonths(demo, token);
  summary.value = m.summary.map((row) => ({
    ...row,
    month: billingCycleLabel(row.billing_date),
  }));
  await Promise.all([refreshReport(), refreshPaceReport()]);
}

async function excludeTransaction(tx: Transaction) {
  if (auth.isDemo) return;
  const key = transactionKey(tx);
  excludingKey.value = key;
  searchHint.value = "";
  try {
    await addExclusion({ transaction: tx, note: "Not my spend" }, auth.token || undefined);
    searchMerchants.value = searchMerchants.value.filter((r) => r.key !== key);
    await afterExclusionChange();
    searchHint.value = "Charge excluded from totals. See Excluded tab to restore.";
  } catch (e) {
    searchHint.value = String(e);
  } finally {
    excludingKey.value = null;
  }
}

async function excludeFromSearch(row: SearchMerchantRow) {
  if (auth.isDemo) return;
  excludingKey.value = row.key;
  searchHint.value = "";
  try {
    await addExclusion({ key: row.key, note: "Not my spend" }, auth.token || undefined);
    searchMerchants.value = searchMerchants.value.filter((r) => r.key !== row.key);
    await afterExclusionChange();
    searchHint.value = "Charge excluded from totals. See Excluded tab to restore.";
  } catch (e) {
    searchHint.value = String(e);
  } finally {
    excludingKey.value = null;
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

async function loadPartialReport(key: string): Promise<SpendingReport | null> {
  const cached = partialReportCache.value.get(key);
  if (cached) return cached;
  try {
    const r = await fetchReport(auth.isDemo, key, auth.token || undefined);
    partialReportCache.value.set(key, r);
    return r;
  } catch {
    return null;
  }
}

async function buildLocalCycleReport(monthKey: string): Promise<SpendingReport> {
  const start = cycleStartFromMonthKey(monthKey);
  const { end } = getCycleRangeForStart(start, cycleDay.value);
  const partial = findPartialMonth(months.value, start, cycleDay.value);
  let txs = paceReport.value?.transactions ?? [];
  if (partial) {
    const partialReport = await loadPartialReport(partial.key);
    if (partialReport) txs = partialReport.transactions;
  }
  return buildCycleReport(txs, start, end, {
    includeFixed: loadPaceIncludeFixed(),
    manualSpend: partial ? null : loadManualCycleSpend(start),
    configuredCharges: configuredCharges.value,
  });
}

async function refreshReport(month: string | null = selectedMonth.value) {
  if (month && isCycleMonthKey(month)) {
    if (!paceReport.value) await refreshPaceReport();
    report.value = await buildLocalCycleReport(month);
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
  if (showPaceCard.value) {
    if (isCycleMonthKey(selectedMonth.value)) {
      void refreshReport(selectedMonth.value);
    } else if (partialStatementActive.value) {
      void refreshReport(selectedMonth.value);
    }
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
    if (demo && m.demo_as_of) auth.demoAsOf = m.demo_as_of;
    partialReportCache.value.clear();
    summary.value = m.summary
      .filter((row) => !m.months.some((month) => month.billing_date === row.billing_date && month.partial))
      .map((row) => ({
        ...row,
        month: billingCycleLabel(row.billing_date),
      }));
    await Promise.all([refreshPaceReport(), refreshConfiguredCharges()]);
    const initial = defaultOverviewMonthKey(m.months, cycleDay.value, refDate.value);
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
