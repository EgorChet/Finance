<template>
  <div class="home-page">
    <div v-if="auth.isDemo" class="demo-banner">
      Demo household — sample portfolio, calendar, and spending. Sign in for your real data.
    </div>
    <h2 class="page-title">Home</h2>
    <p class="page-lead home-lead">This cycle's spending, what's coming up, and your investments at a glance.</p>

    <SpendingSnapshotCard
      :loading="spendingLoading"
      :error="spendingError"
      :report="spendingReport"
      :cycle-label="cycleLabel"
      :partial="isPartialCycle"
      :month-key="currentMonthKey"
      :living-budget="livingBudgetAmount"
      :pace="paceResult"
    />

    <UpcomingEventsCard
      :loading="calendarLoading"
      :error="calendarError"
      :events="calendarEvents"
      :today="todayIso"
    />

    <PortfolioSummaryCard
      :loading="portfolioLoading"
      :refreshing="portfolioRefreshing"
      :kaspa="kaspaQuote"
      :fxcn="fxcnQuote"
      :market="marketSnapshot"
      @refresh="refreshPortfolio(true)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  fetchCalendar,
  fetchFixedCharges,
  fetchFxcnQuote,
  fetchKaspaQuote,
  fetchLivingBudget,
  fetchMarketSnapshot,
  fetchMonths,
  fetchReport,
  type FxcnQuote,
  type KaspaQuote,
  type MarketSnapshot,
} from "../api/client";
import PortfolioSummaryCard from "../components/home/PortfolioSummaryCard.vue";
import SpendingSnapshotCard from "../components/home/SpendingSnapshotCard.vue";
import UpcomingEventsCard from "../components/home/UpcomingEventsCard.vue";
import { useAuthStore } from "../stores/auth";
import { splitFixedVariable } from "../categories";
import type { CalendarEvent, MonthItem, SpendingReport } from "../types";
import { referenceDate } from "../utils/appDate";
import { billingCycleLabel, openCycleTabLabel } from "../utils/format";
import {
  normalizeLivingBudgetSegment,
  resolvedLivingBudget as resolveLivingBudgetAmount,
} from "../utils/livingBudget";
import type { ConfiguredCharge } from "../utils/fixedCharges";
import {
  buildCycleReport,
  computePace,
  cycleNeedsOpenTab,
  cycleStartForDate,
  cycleStartForStatementBilling,
  cycleStartFromMonthKey,
  defaultOverviewMonthKey,
  findPartialMonth,
  getCycleRangeForStart,
  isCycleMonthKey,
  loadCycleDay,
  loadManualCycleSpend,
  loadPaceAvgCycles,
  mergeMonthsWithOpenCycles,
} from "../utils/pace";

const auth = useAuthStore();

const portfolioLoading = ref(true);
const portfolioRefreshing = ref(false);
const kaspaQuote = ref<KaspaQuote | null>(null);
const fxcnQuote = ref<FxcnQuote | null>(null);
const marketSnapshot = ref<MarketSnapshot | null>(null);

const calendarLoading = ref(true);
const calendarError = ref("");
const calendarEvents = ref<CalendarEvent[]>([]);

const spendingLoading = ref(true);
const spendingError = ref("");
const spendingReport = ref<SpendingReport | null>(null);
const paceReport = ref<SpendingReport | null>(null);
const months = ref<MonthItem[]>([]);
const currentMonthKey = ref<string | null>(null);
const configuredCharges = ref<ConfiguredCharge[]>([]);
const livingBudgetSegments = ref<ReturnType<typeof normalizeLivingBudgetSegment>[]>([]);
const cycleDay = ref(loadCycleDay());

const refDate = computed(() => referenceDate(auth.isDemo, auth.demoAsOf));
const todayIso = computed(() => refDate.value.toISOString().slice(0, 10));

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

const cycleLabel = computed(() => {
  const key = currentMonthKey.value;
  if (!key) return "";
  return displayMonths.value.find((m) => m.key === key)?.label ?? "";
});

const isPartialCycle = computed(() => {
  const key = currentMonthKey.value;
  if (!key) return false;
  const month = months.value.find((m) => m.key === key);
  if (!month?.partial) return isCycleMonthKey(key);
  const start = cycleStartForStatementBilling(month.billing_date, cycleDay.value);
  return cycleNeedsOpenTab(start, cycleDay.value, months.value);
});

const livingBudgetAmount = computed(() =>
  resolveLivingBudgetAmount(currentMonthKey.value, spendingReport.value, livingBudgetSegments.value, cycleDay.value),
);

const paceTransactions = computed(() => paceReport.value?.transactions ?? spendingReport.value?.transactions ?? []);

const partialVariableSpend = computed(() => {
  const key = currentMonthKey.value;
  if (!key || !spendingReport.value) return undefined;
  const month = months.value.find((m) => m.key === key);
  if (!month?.partial) return undefined;
  const start = cycleStartForStatementBilling(month.billing_date, cycleDay.value);
  if (!cycleNeedsOpenTab(start, cycleDay.value, months.value)) return undefined;
  return splitFixedVariable(spendingReport.value.by_category).variable;
});

const paceResult = computed(() => {
  const txs = paceTransactions.value;
  if (!txs.length && !configuredCharges.value.length) return null;
  const partialActive = partialVariableSpend.value != null;
  return computePace(txs, {
    cycleDay: cycleDay.value,
    includeFixed: false,
    latestBillingDate: months.value.filter((m) => !isCycleMonthKey(m.key)).sort((a, b) => b.billing_date.localeCompare(a.billing_date))[0]?.billing_date ?? null,
    manualSpend: partialActive ? null : loadManualCycleSpend(cycleStartForDate(refDate.value, cycleDay.value)),
    avgCycles: loadPaceAvgCycles(),
    configuredCharges: configuredCharges.value,
    statementVariableOverride: partialActive ? partialVariableSpend.value : undefined,
    today: refDate.value,
  });
});

async function refreshPortfolio(force = false) {
  if (force) portfolioRefreshing.value = true;
  else portfolioLoading.value = true;
  const demo = auth.isDemo;
  const token = auth.token || undefined;
  try {
    const [kas, fxcn, market] = await Promise.all([
      fetchKaspaQuote(demo, token, force),
      fetchFxcnQuote(demo, token, force),
      fetchMarketSnapshot(demo, token, force),
    ]);
    kaspaQuote.value = kas;
    fxcnQuote.value = fxcn;
    marketSnapshot.value = market;
  } catch {
    /* keep stale values */
  } finally {
    portfolioLoading.value = false;
    portfolioRefreshing.value = false;
  }
}

async function loadCalendar() {
  calendarLoading.value = true;
  calendarError.value = "";
  try {
    const data = await fetchCalendar(auth.isDemo, auth.token || undefined);
    calendarEvents.value = data.events;
  } catch (e) {
    calendarError.value = String(e);
    calendarEvents.value = [];
  } finally {
    calendarLoading.value = false;
  }
}

async function buildCycleReportForKey(monthKey: string): Promise<SpendingReport> {
  const start = cycleStartFromMonthKey(monthKey);
  const { end } = getCycleRangeForStart(start, cycleDay.value);
  const partial = findPartialMonth(months.value, start, cycleDay.value);
  let txs = paceReport.value?.transactions ?? [];
  if (partial) {
    try {
      const partialReport = await fetchReport(auth.isDemo, partial.key, auth.token || undefined);
      txs = partialReport.transactions;
    } catch {
      /* use pace txs */
    }
  }
  return buildCycleReport(txs, start, end, {
    includeFixed: true,
    manualSpend: partial ? null : loadManualCycleSpend(start),
    configuredCharges: configuredCharges.value,
  });
}

async function loadSpending() {
  spendingLoading.value = true;
  spendingError.value = "";
  const demo = auth.isDemo;
  const token = auth.token || undefined;
  try {
    const [m, charges, allReport] = await Promise.all([
      fetchMonths(demo, token),
      fetchFixedCharges(demo, token),
      fetchReport(demo, null, token),
    ]);
    months.value = m.months;
    if (demo && m.demo_as_of) auth.demoAsOf = m.demo_as_of;
    configuredCharges.value = charges.charges;
    paceReport.value = allReport;

    try {
      const budget = await fetchLivingBudget(demo, token);
      livingBudgetSegments.value = budget.segments.map(normalizeLivingBudgetSegment);
    } catch {
      livingBudgetSegments.value = [];
    }

    const monthKey = defaultOverviewMonthKey(m.months, cycleDay.value, refDate.value);
    currentMonthKey.value = monthKey;

    if (monthKey && isCycleMonthKey(monthKey)) {
      spendingReport.value = await buildCycleReportForKey(monthKey);
    } else if (monthKey) {
      spendingReport.value = await fetchReport(demo, monthKey, token);
    } else {
      spendingReport.value = null;
    }
  } catch (e) {
    spendingError.value = String(e);
    spendingReport.value = null;
  } finally {
    spendingLoading.value = false;
  }
}

onMounted(() => {
  void refreshPortfolio();
  void loadCalendar();
  void loadSpending();
});
</script>
