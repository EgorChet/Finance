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
  <template v-else-if="report || reportLoading || overviewPeriod">
    <div v-if="auth.isDemo" class="demo-banner demo-banner-showcase">
      <strong>Demo household</strong> — 9 months of sample Visa spending (~₪19k/cycle), live pace, categories &amp; partial snapshot. Sign in to use your real Leumi exports.
    </div>
    <header class="overview-page-header">
      <h2 class="overview-page-title">Spending overview</h2>
      <div class="pill-row overview-page-periods">
        <button
          type="button"
          class="pill pill-period"
          :class="{ active: overviewPeriod === 'ytd' }"
          aria-label="This year"
          @click="togglePeriod('ytd')"
        >
          YTD
        </button>
        <button
          type="button"
          class="pill pill-period"
          :class="{ active: overviewPeriod === 'rolling12' }"
          aria-label="Last 12 months"
          @click="togglePeriod('rolling12')"
        >
          12M
        </button>
        <button
          type="button"
          class="pill pill-period"
          :class="{ active: selectedMonth === null && !overviewPeriod }"
          aria-label="All months"
          @click="onMonthSelected(null)"
        >
          ALL
        </button>
      </div>
    </header>
    <MonthPicker
      :model-value="overviewPeriod ? null : selectedMonth"
      :months="displayMonths"
      :allow-delete="!auth.isDemo"
      omit-all-months
      @update:model-value="onMonthSelected"
      @delete-month="onDeleteStatementMonth"
    />
    <AppLoader
      v-if="overviewPeriod && periodLoading"
      compact
      title="Loading period"
      subtitle="Aggregating your spending history"
    />
    <SpendingPeriodPanel
      v-else-if="overviewPeriod && periodAnalysis"
      :analysis="periodAnalysis"
    />
    <AppLoader
      v-else-if="reportLoading"
      title="Loading month"
      :subtitle="switchingMonthLabel"
    />
    <template v-else-if="report && !overviewPeriod">
    <MonthlyTrendChart v-if="selectedMonth === null && summary.length > 1" :summary="summary" />
    <SummaryMetrics
      v-if="showSummaryMetrics"
      :report="report"
      :living-budget="monthLivingBudget"
      :hide-living-budget="selectedMonth === null"
      :retrospective="budgetRetrospective"
      :pace-tone="summaryPaceTone"
      :pace-colored="showPaceCard"
      :cycle-day="cycleDay"
      :reference-date="refDate"
      :living-budget-period-label="activeLivingBudgetPeriodLabel"
    />
    <PaceCard
      v-if="showPaceCard"
      :transactions="paceTransactions"
      :cycle-transactions="report?.transactions ?? []"
      :latest-billing-date="latestFinalBillingDate"
      :configured-charges="configuredCharges"
      :partial-statement-active="partialStatementActive"
      :cycle-everyday-spend="cycleEverydaySpend"
      :statement-saved-at="statementSavedAt"
      :partial-total-spend="partialTotalSpend"
      :reference-date="refDate"
      :cycle-day="cycleDay"
      :living-budget="resolvedLivingBudget"
      :living-budget-base="livingBudgetBaseAmount"
      :living-budget-topup="livingBudgetTopupExtra"
      :living-budget-segments="livingBudgetSegments"
      :living-budget-month-topups="livingBudgetMonthTopups"
      :pace-tone="summaryPaceTone"
      @settings-change="onPaceSettingsChange"
    />
    <div v-if="showPaceHistoryExpand" class="overview-pace-expand">
      <button type="button" class="btn btn-ghost btn-sm" @click="expandPaceHistory">
        Show more history ({{ paceExpandLabel }})
      </button>
    </div>
    <PendingCycleCard
      v-if="isPendingCycleSelected && selectedCycleStart"
      :cycle-start="selectedCycleStart"
      @settings-change="onPaceSettingsChange"
    />
    <template v-if="showTransactions && isLiveTransactionView">
      <section class="tx-section">
        <h3 class="tx-section-title">Charges</h3>
        <TransactionPeriodPicker v-model="txPeriod" />
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
      :show-compare="partialStatementActive"
      :all-transactions="paceTransactions"
      :cycle-day="cycleDay"
      :cycle-start="activeCycleStart ?? undefined"
      :reference-date="refDate"
      @exclude="excludeTransaction"
    />
    </template>
    <template v-if="showTransactions && !isLiveTransactionView">
      <section class="tx-section tx-section--after-categories">
        <h3 class="section-title">Charges</h3>
        <p class="tx-period-empty">{{ pastChargesHint }}</p>
        <TransactionList
          :transactions="periodTransactions"
          title=""
          show-category
          paginated
          :statement-billing="statementBilling"
          :excludeable="!auth.isDemo"
          :excluding-key="excludingKey"
          :default-limit="25"
          @exclude="excludeTransaction"
        />
      </section>
    </template>
    <p v-else-if="isCycleTabSelected && !report?.metadata?.provisional" class="pace-cycle-pending-note">
      Category breakdown and transactions will appear once this cycle’s statement is uploaded.
    </p>
    </template>
  </template>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute } from "vue-router";
import { addExclusion, deleteStatementMonth, fetchHomeData, fetchMonths, fetchReport } from "../api/client";
import CategoryAccordion from "../components/CategoryAccordion.vue";
import TransactionList from "../components/TransactionList.vue";
import TransactionPeriodPicker from "../components/TransactionPeriodPicker.vue";
import AppLoader from "../components/AppLoader.vue";
import ErrorBanner from "../components/ErrorBanner.vue";
import MonthPicker from "../components/MonthPicker.vue";
import MonthlyTrendChart from "../components/MonthlyTrendChart.vue";
import PaceCard from "../components/PaceCard.vue";
import PendingCycleCard from "../components/PendingCycleCard.vue";
import SpendingPeriodPanel from "../components/SpendingPeriodPanel.vue";
import SummaryMetrics from "../components/SummaryMetrics.vue";
import { useAuthStore } from "../stores/auth";
import { confirm } from "../composables/useConfirm";
import type { MonthItem, SpendingReport, Transaction } from "../types";
import {
  rollupCategoriesForDisplay,
} from "../categories";
import { everydaySpendingTotal } from "../utils/householdBudget";
import { computeLivePaceHealth } from "../utils/paceHealth";
import {
  buildCycleReport,
  cycleStartForDate,
  cycleStartForStatementBilling,
  cycleStartFromMonthKey,
  cycleNeedsOpenTab,
  defaultOverviewMonthKey,
  effectiveManualCycleSpend,
  findPartialMonth,
  getCycleRangeForStart,
  isCycleMonthKey,
  latestFinalBillingDate as getLatestFinalBillingDate,
  loadCycleDay,
  loadPaceIncludeFixed,
  mergeMonthsWithOpenCycles,
  partialStatementSavedAtForCycle,
  pruneStaleManualCycleSpend,
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
import {
  type LivingBudgetMonthTopup,
  type LivingBudgetSegment,
  cycleMonthYmForOverview,
  livingBudgetBaseForMonth,
  livingBudgetSegmentForMonth,
  monthRangeLabel,
  monthTopupExtraForMonth,
  normalizeLivingBudgetMonthTopup,
  normalizeLivingBudgetSegment,
  resolvedLivingBudget as resolveLivingBudgetAmount,
} from "../utils/livingBudget";
import {
  analyzeSpendingPeriod,
  type SpendingPeriodMode,
} from "../utils/spendingPeriod";
import { onSpendingRefresh } from "../composables/useSpendingRefresh";
import {
  DEFAULT_PACE_MONTHS,
  nextPaceMonths,
  paceMonthsLabel,
} from "../utils/paceMonths";

const auth = useAuthStore();
const route = useRoute();
const loading = ref(true);
const reportLoading = ref(false);
const error = ref("");
const report = ref<SpendingReport | null>(null);
const paceReport = ref<SpendingReport | null>(null);
const configuredCharges = ref<ConfiguredCharge[]>([]);
const livingBudgetSegments = ref<LivingBudgetSegment[]>([]);
const livingBudgetMonthTopups = ref<LivingBudgetMonthTopup[]>([]);
const months = ref<MonthItem[]>([]);
const summary = ref<{ month: string; total: number }[]>([]);
const selectedMonth = ref<string | null>(null);
const excludingKey = ref<string | null>(null);
const expandedCategoryKeys = ref<string[]>([]);
const txPeriod = ref<TransactionPeriod>("today");
const cycleDay = ref(loadCycleDay());
const partialReportCache = ref<Map<string, SpendingReport>>(new Map());
const overviewPeriod = ref<SpendingPeriodMode | null>(null);
const paceMonthsWindow = ref(DEFAULT_PACE_MONTHS);
const paceReportIsFull = ref(false);
const periodLoading = ref(false);

const latestFinalBillingDate = computed(() => getLatestFinalBillingDate(months.value));

const refDate = computed(() => referenceDate(auth.isDemo, auth.demoAsOf));

const periodAnalysis = computed(() => {
  if (!overviewPeriod.value || !paceReport.value) return null;
  return analyzeSpendingPeriod(paceReport.value.transactions, overviewPeriod.value, refDate.value);
});

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

const pastChargesHint = computed(() =>
  selectedMonth.value
    ? "All charges in this billing cycle."
    : "All charges across uploaded statements.",
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

const resolvedLivingBudget = computed(() =>
  resolveLivingBudgetAmount(
    selectedMonth.value,
    report.value,
    livingBudgetSegments.value,
    cycleDay.value,
    livingBudgetMonthTopups.value,
    configuredCharges.value,
  ),
);

/** Living budget applies to one billing cycle — not the all-months aggregate. */
const monthLivingBudget = computed(() =>
  selectedMonth.value === null ? null : resolvedLivingBudget.value,
);

const livingBudgetCycleYm = computed(() =>
  cycleMonthYmForOverview(selectedMonth.value, report.value, cycleDay.value),
);

const livingBudgetTopupExtra = computed(() =>
  monthTopupExtraForMonth(livingBudgetCycleYm.value, livingBudgetMonthTopups.value),
);

const livingBudgetBaseAmount = computed(() =>
  livingBudgetBaseForMonth(livingBudgetCycleYm.value, livingBudgetSegments.value, configuredCharges.value),
);

const activeLivingBudgetSegment = computed(() =>
  livingBudgetSegmentForMonth(livingBudgetCycleYm.value, livingBudgetSegments.value),
);

const activeLivingBudgetPeriodLabel = computed(() => {
  const seg = activeLivingBudgetSegment.value;
  if (!seg) return null;
  return monthRangeLabel(seg.from_month, seg.through_month);
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
  // Keep full history for pace averages; current-cycle everyday total comes from cycleEverydaySpend override.
  return paceReport.value?.transactions ?? report.value?.transactions ?? [];
});

const cycleEverydaySpend = computed(() => {
  if (!showPaceCard.value || !report.value) return null;
  const total = everydaySpendingTotal(report.value.transactions);
  return total > 0 ? total : null;
});

const summaryPaceTone = computed(() => {
  if (!showPaceCard.value || !report.value) return null;
  const start = cycleStartForDate(refDate.value, cycleDay.value);
  const hasStatementSpend = cycleEverydaySpend.value != null && cycleEverydaySpend.value > 0;
  return computeLivePaceHealth({
    transactions: paceTransactions.value,
    cycleTransactions: report.value.transactions,
    cycleDay: cycleDay.value,
    referenceDate: refDate.value,
    livingBudget: resolvedLivingBudget.value,
    livingBudgetBase: livingBudgetBaseAmount.value,
    livingBudgetTopup: livingBudgetTopupExtra.value,
    budgetSegments: livingBudgetSegments.value,
    budgetMonthTopups: livingBudgetMonthTopups.value,
    latestBillingDate: latestFinalBillingDate.value,
    configuredCharges: configuredCharges.value,
    cycleStart: start,
    statementSavedAt: statementSavedAt.value,
    hasStatementSpend,
    partialStatementActive: partialStatementActive.value,
    cycleEverydaySpend: cycleEverydaySpend.value,
  });
});

const statementSavedAt = computed((): string | null => {
  const start =
    activeCycleStart.value ?? cycleStartForDate(refDate.value, cycleDay.value);
  return partialStatementSavedAtForCycle(months.value, start, cycleDay.value);
});

const partialTotalSpend = computed(() => {
  if (!isPartialForOpenCycle.value || !report.value) return null;
  return report.value.total_spent;
});

const showPaceHistoryExpand = computed(
  () => showPaceCard.value && !paceReportIsFull.value && paceMonthsWindow.value > 0,
);

const paceExpandLabel = computed(() => {
  const next = nextPaceMonths(paceMonthsWindow.value);
  return paceMonthsLabel(next);
});

function mapSummaryRows(
  rows: { month: string; billing_date: string; total: number }[],
  monthItems: MonthItem[],
) {
  return rows
    .filter((row) => !monthItems.some((month) => month.billing_date === row.billing_date && month.partial))
    .map((row) => ({
      ...row,
      month: billingCycleLabel(row.billing_date),
    }));
}

async function afterExclusionChange() {
  const demo = auth.isDemo;
  const token = auth.token || undefined;
  const m = await fetchMonths(demo, token);
  months.value = m.months;
  summary.value = mapSummaryRows(m.summary, m.months);
  paceReportIsFull.value = false;
  await Promise.all([refreshReport(), refreshPaceReport()]);
}

async function excludeTransaction(tx: Transaction) {
  if (auth.isDemo) return;
  const label = `${formatIls(tx.charge_amount)} · ${tx.merchant_en || tx.merchant_he}`;
  const ok = await confirm({
    title: "Exclude transaction?",
    message: `Exclude ${label} from your totals?\n\nYou can restore it anytime from the Excluded tab.`,
    confirmLabel: "Exclude",
    tone: "danger",
  });
  if (!ok) return;
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
  const statementAt = partial?.saved_at ?? null;
  let txs = paceReport.value?.transactions ?? [];
  let hasPartialData = false;
  if (partial) {
    const partialReport = await loadPartialReport(partial.key);
    if (partialReport) {
      txs = partialReport.transactions;
      hasPartialData = true;
    }
  }
  pruneStaleManualCycleSpend(start, {
    statementSavedAt: statementAt,
    hasStatementSpend: hasPartialData,
  });
  return buildCycleReport(txs, start, end, {
    includeFixed: loadPaceIncludeFixed(),
    manualSpend: effectiveManualCycleSpend(start, {
      statementSavedAt: statementAt,
      hasStatementSpend: hasPartialData,
    }),
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
    if (month === null && paceReportIsFull.value && paceReport.value) {
      if (reqId !== reportRequestId) return;
      report.value = paceReport.value;
      error.value = "";
      return;
    }
    const r = await fetchReport(demo, month, token);
    if (reqId !== reportRequestId) return;
    report.value = r;
    if (month === null) {
      paceReport.value = r;
      paceReportIsFull.value = true;
    }
    error.value = "";
  } catch (e) {
    if (reqId !== reportRequestId) return;
    error.value = String(e);
  }
}

async function refreshConfiguredCharges() {
  const demo = auth.isDemo;
  const token = auth.token || undefined;
  const bundle = await fetchHomeData(demo, token, paceMonthsWindow.value);
  configuredCharges.value = bundle.fixed_charges;
  livingBudgetSegments.value = bundle.living_budget.segments.map((s) => normalizeLivingBudgetSegment(s));
  livingBudgetMonthTopups.value = (bundle.living_budget.month_topups || []).map((t) =>
    normalizeLivingBudgetMonthTopup(t),
  );
}

async function onDeleteStatementMonth(key: string) {
  if (auth.isDemo || isCycleMonthKey(key)) return;

  const month = displayMonths.value.find((m) => m.key === key);
  const ok = await confirm({
    title: "Delete statement?",
    message: `Remove all spending data for ${month?.label ?? key}? This cannot be undone.`,
    confirmLabel: "Delete",
    tone: "danger",
  });
  if (!ok) return;

  try {
    await deleteStatementMonth(key, auth.token || undefined);
    const demo = auth.isDemo;
    const token = auth.token || undefined;
    const m = await fetchMonths(demo, token);
    months.value = m.months;
    partialReportCache.value.delete(key);
    summary.value = mapSummaryRows(m.summary, m.months);
    paceReportIsFull.value = false;
    await refreshPaceReport();
    if (selectedMonth.value === key || !months.value.some((row) => row.key === selectedMonth.value)) {
      selectedMonth.value = defaultOverviewMonthKey(months.value, cycleDay.value, refDate.value);
      txPeriod.value = defaultTxPeriod(selectedMonth.value);
    }
    await refreshReport(selectedMonth.value);
  } catch (e) {
    error.value = String(e);
  }
}

async function refreshPaceReport(forceFull = false) {
  const demo = auth.isDemo;
  const token = auth.token || undefined;
  try {
    if (forceFull || paceReportIsFull.value) {
      paceReport.value = await fetchReport(demo, null, token);
      paceReportIsFull.value = true;
    } else {
      paceReport.value = await fetchReport(demo, null, token, { months: paceMonthsWindow.value });
    }
  } catch {
    paceReport.value = null;
  }
}

async function expandPaceHistory() {
  const next = nextPaceMonths(paceMonthsWindow.value);
  if (next === 0) {
    await refreshPaceReport(true);
    return;
  }
  paceMonthsWindow.value = next;
  await refreshPaceReport();
}

async function loadFullPaceReport() {
  if (paceReportIsFull.value) return;
  periodLoading.value = true;
  try {
    await refreshPaceReport(true);
  } finally {
    periodLoading.value = false;
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

function togglePeriod(mode: SpendingPeriodMode) {
  if (overviewPeriod.value === mode) {
    overviewPeriod.value = null;
    expandedCategoryKeys.value = [];
    return;
  }
  overviewPeriod.value = mode;
  expandedCategoryKeys.value = [];
  void loadFullPaceReport();
}

async function onMonthSelected(month: string | null) {
  overviewPeriod.value = null;
  selectedMonth.value = month;
  expandedCategoryKeys.value = [];
  txPeriod.value = defaultTxPeriod(month);
  const switchId = ++monthSwitchId;
  reportLoading.value = true;
  try {
    if (month === null && !paceReportIsFull.value) {
      await loadFullPaceReport();
    }
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
    const bundle = await fetchHomeData(demo, token, paceMonthsWindow.value);
    months.value = bundle.months;
    if (demo && bundle.demo_as_of) auth.demoAsOf = bundle.demo_as_of;
    partialReportCache.value.clear();
    summary.value = mapSummaryRows(bundle.summary, bundle.months);
    configuredCharges.value = bundle.fixed_charges;
    paceReport.value = bundle.report;
    paceReportIsFull.value = false;
    livingBudgetSegments.value = bundle.living_budget.segments.map((s) => normalizeLivingBudgetSegment(s));
    livingBudgetMonthTopups.value = (bundle.living_budget.month_topups || []).map((t) =>
      normalizeLivingBudgetMonthTopup(t),
    );
    const todayStart = cycleStartForDate(refDate.value, cycleDay.value);
    pruneStaleManualCycleSpend(todayStart, {
      statementSavedAt: partialStatementSavedAtForCycle(bundle.months, todayStart, cycleDay.value),
      hasStatementSpend: !!findPartialMonth(bundle.months, todayStart, cycleDay.value),
    });
    const queryMonth = typeof route.query.month === "string" ? route.query.month : null;
    const initial =
      queryMonth && bundle.months.some((month) => month.key === queryMonth || isCycleMonthKey(queryMonth))
        ? queryMonth
        : defaultOverviewMonthKey(bundle.months, cycleDay.value, refDate.value);
    selectedMonth.value = initial;
    txPeriod.value = defaultTxPeriod(initial);
    await refreshReport(initial);
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}

let stopSpendingRefresh: (() => void) | undefined;

onMounted(() => {
  void loadMonths();
  stopSpendingRefresh = onSpendingRefresh(() => {
    paceMonthsWindow.value = DEFAULT_PACE_MONTHS;
    paceReportIsFull.value = false;
    partialReportCache.value.clear();
    void loadMonths();
  });
});

onUnmounted(() => {
  stopSpendingRefresh?.();
});
</script>
