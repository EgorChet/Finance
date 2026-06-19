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
  <template v-else-if="report || reportLoading">
    <div v-if="auth.isDemo" class="demo-banner demo-banner-showcase">
      <strong>Demo household</strong> — 9 months of sample Visa spending (~₪19k/cycle), live pace, categories &amp; partial snapshot. Sign in to use your real Leumi exports.
    </div>
    <h2 class="overview-page-title">Spending overview</h2>
    <div v-if="partialCycleBanner && !reportLoading" class="demo-banner partial-statement-banner">
      {{ partialCycleBanner }}
    </div>
    <MonthPicker :model-value="selectedMonth" :months="displayMonths" @update:model-value="onMonthSelected" />
    <AppLoader
      v-if="reportLoading"
      title="Loading month"
      :subtitle="switchingMonthLabel"
    />
    <template v-else-if="report">
    <MonthlyTrendChart v-if="selectedMonth === null && summary.length > 1" :summary="summary" />
    <SummaryMetrics v-if="showSummaryMetrics" :report="report" :retrospective="budgetRetrospective" />
    <PaceCard
      v-if="showPaceCard"
      :transactions="paceTransactions"
      :latest-billing-date="latestFinalBillingDate"
      :configured-charges="configuredCharges"
      :partial-statement-active="partialStatementActive"
      :partial-variable-spend="partialVariableSpend"
      :partial-total-spend="partialTotalSpend"
      :reference-date="refDate"
      :cycle-day="cycleDay"
      @settings-change="onPaceSettingsChange"
    />
    <PendingCycleCard
      v-if="isPendingCycleSelected && selectedCycleStart"
      :cycle-start="selectedCycleStart"
      @settings-change="onPaceSettingsChange"
    />
    <template v-if="showTransactions">
      <section class="tx-section">
        <h3 class="tx-section-title">Charges</h3>
        <TransactionPeriodPicker v-if="isLiveTransactionView" v-model="txPeriod" />
        <p v-if="!periodTransactions.length" class="tx-period-empty">
          No charges for {{ periodLabel }}.
        </p>
        <TransactionList
          v-else
          :transactions="periodTransactions"
          title=""
          show-category
          :statement-billing="statementBilling"
          :excludeable="!auth.isDemo"
          :excluding-key="excludingKey"
          :show-sort="false"
          :default-limit="50"
          @exclude="excludeTransaction"
        />
      </section>
    </template>
    <template v-if="showCategoryExplorer">
    <p class="section-title">Where did the money go?</p>
    <CategoryAccordion
      v-model:expanded-keys="expandedCategoryKeys"
      :categories="displayCategories"
      :transactions="report.transactions"
      :total-spent="report.total_spent"
      :statement-billing="selectedMonth ? statementBilling : null"
      :excludeable="!auth.isDemo"
      :excluding-key="excludingKey"
      @exclude="excludeTransaction"
    />
    </template>
    <p v-else-if="isCycleTabSelected && !report?.metadata?.provisional" class="pace-cycle-pending-note">
      Category breakdown and transactions will appear once this cycle’s statement is uploaded.
    </p>
    </template>
  </template>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { addExclusion, fetchFixedCharges, fetchMonths, fetchReport } from "../api/client";
import CategoryAccordion from "../components/CategoryAccordion.vue";
import TransactionList from "../components/TransactionList.vue";
import TransactionPeriodPicker from "../components/TransactionPeriodPicker.vue";
import AppLoader from "../components/AppLoader.vue";
import ErrorBanner from "../components/ErrorBanner.vue";
import MonthPicker from "../components/MonthPicker.vue";
import MonthlyTrendChart from "../components/MonthlyTrendChart.vue";
import PaceCard from "../components/PaceCard.vue";
import PendingCycleCard from "../components/PendingCycleCard.vue";
import SummaryMetrics from "../components/SummaryMetrics.vue";
import { useAuthStore } from "../stores/auth";
import type { MonthItem, SpendingReport, Transaction } from "../types";
import {
  rollupCategoriesForDisplay,
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
import { billingCycleLabel, formatIls, openCycleTabLabel } from "../utils/format";
import {
  filterTransactionsByPeriod,
  TRANSACTION_PERIOD_OPTIONS,
  type TransactionPeriod,
} from "../utils/transactionPeriod";
import { transactionKey } from "../utils/transactionKey";
import type { ConfiguredCharge } from "../utils/fixedCharges";

const auth = useAuthStore();
const loading = ref(true);
const reportLoading = ref(false);
const error = ref("");
const report = ref<SpendingReport | null>(null);
const paceReport = ref<SpendingReport | null>(null);
const configuredCharges = ref<ConfiguredCharge[]>([]);
const months = ref<MonthItem[]>([]);
const summary = ref<{ month: string; total: number }[]>([]);
const selectedMonth = ref<string | null>(null);
const excludingKey = ref<string | null>(null);
const expandedCategoryKeys = ref<string[]>([]);
const txPeriod = ref<TransactionPeriod>("today");
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

const switchingMonthLabel = computed(() => {
  if (selectedMonth.value === null) return "All months";
  const month = displayMonths.value.find((m) => m.key === selectedMonth.value);
  return month?.label ?? "Selected month";
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

const isLiveTransactionView = computed(
  () => isLiveCycleSelected.value || isPartialForOpenCycle.value,
);

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

/** Closed/final statement months — budget card speaks in past tense (overspent / under budget). */
const budgetRetrospective = computed(() => {
  if (!report.value || isLiveCycleSelected.value || isPartialForOpenCycle.value) return false;
  return !isInProgressCycle.value;
});

const showTransactions = computed(() => (report.value?.transactions.length ?? 0) > 0);

const periodTransactions = computed(() => {
  if (!report.value) return [];
  return filterTransactionsByPeriod(
    report.value.transactions,
    txPeriod.value,
    refDate.value,
    isLiveTransactionView.value,
  );
});

const periodLabel = computed(() => {
  if (!isLiveTransactionView.value) return "this billing cycle";
  return TRANSACTION_PERIOD_OPTIONS.find((o) => o.value === txPeriod.value)?.label.toLowerCase() ?? txPeriod.value;
});

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

const displayCategories = computed(() =>
  report.value ? rollupCategoriesForDisplay(report.value.by_category) : [],
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

function confirmExclude(label: string): boolean {
  return window.confirm(
    `Exclude ${label} from your totals?\n\nYou can restore it anytime from the Excluded tab.`,
  );
}

async function excludeTransaction(tx: Transaction) {
  if (auth.isDemo) return;
  const label = `${formatIls(tx.charge_amount)} · ${tx.merchant_en || tx.merchant_he}`;
  if (!confirmExclude(label)) return;
  const key = transactionKey(tx);
  excludingKey.value = key;
  try {
    await addExclusion({ transaction: tx, note: "Not my spend" }, auth.token || undefined);
    await afterExclusionChange();
  } catch (e) {
    window.alert(String(e));
  } finally {
    excludingKey.value = null;
  }
}

let reportRequestId = 0;
let monthSwitchId = 0;

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

function defaultTxPeriod(month: string | null): TransactionPeriod {
  if (!month) return "month";
  if (isCycleMonthKey(month)) return "today";
  const m = months.value.find((row) => row.key === month);
  if (m?.partial) {
    const start = cycleStartForStatementBilling(m.billing_date, cycleDay.value);
    if (cycleNeedsOpenTab(start, cycleDay.value, months.value)) return "today";
  }
  return "month";
}

async function onMonthSelected(month: string | null) {
  selectedMonth.value = month;
  expandedCategoryKeys.value = [];
  txPeriod.value = defaultTxPeriod(month);
  const switchId = ++monthSwitchId;
  reportLoading.value = true;
  try {
    await refreshReport(month);
  } finally {
    if (switchId === monthSwitchId) {
      reportLoading.value = false;
    }
  }
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
    txPeriod.value = defaultTxPeriod(initial);
    await refreshReport(initial);
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}

onMounted(loadMonths);
</script>
