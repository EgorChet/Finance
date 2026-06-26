<template>
  <div class="home-page">
    <div v-if="auth.isDemo" class="demo-banner">
      Demo household — sample portfolio, calendar, and spending.
      <button type="button" class="demo-banner-link" @click="goSignIn">Sign in for your real data</button>.
    </div>
    <h2 class="page-title">Home</h2>
    <p class="page-lead home-lead">This cycle's spending, what's coming up, and your investments at a glance.</p>

    <section class="home-card home-spending-section">
      <header class="home-card-head">
        <h3 class="home-card-title">Spending</h3>
        <span v-if="cycleLabel" class="home-card-meta">{{ cycleLabel }}</span>
      </header>
      <AppLoader v-if="spendingLoading" title="Loading spending" subtitle="Fetching this cycle" />
      <template v-else>
        <p v-if="spendingError" class="home-card-error">{{ spendingError }}</p>
        <template v-else-if="spendingReport">
          <SummaryMetrics
            compact
            :report="spendingReport"
            :living-budget="livingBudgetAmount"
            :pace-tone="summaryPaceTone"
            :pace-colored="showPaceHealth"
            :cycle-day="cycleDay"
            :reference-date="refDate"
          />
          <div class="home-card-actions">
            <RouterLink class="btn btn-primary" :to="overviewLink">View full spending →</RouterLink>
          </div>
        </template>
        <p v-else class="home-card-empty">Upload a statement to see spending for this cycle.</p>
      </template>
    </section>

    <UpcomingEventsCard
      :loading="calendarLoading"
      :error="calendarError"
      :events="calendarEvents"
      :today="todayIso"
    />

    <PortfolioSummaryCard
      :loading="portfolioLoading"
      :refreshing="portfolioRefreshing"
      :demo="auth.isDemo"
      :kaspa="kaspaQuote"
      :fxcn="fxcnQuote"
      :market="marketSnapshot"
      @refresh="refreshPortfolio(true)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
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
import AppLoader from "../components/AppLoader.vue";
import SummaryMetrics from "../components/SummaryMetrics.vue";
import PortfolioSummaryCard from "../components/home/PortfolioSummaryCard.vue";
import UpcomingEventsCard from "../components/home/UpcomingEventsCard.vue";
import { useAuthStore } from "../stores/auth";
import { goToSignIn } from "../utils/signIn";
import type { CalendarEvent, MonthItem, SpendingReport } from "../types";
import { referenceDate } from "../utils/appDate";
import { billingCycleLabel, openCycleTabLabel } from "../utils/format";
import { everydaySpendingTotal } from "../utils/householdBudget";
import { computeLivePaceHealth } from "../utils/paceHealth";
import {
  normalizeLivingBudgetMonthTopup,
  normalizeLivingBudgetSegment,
  resolvedLivingBudget as resolveLivingBudgetAmount,
  livingBudgetBaseForMonth,
  monthTopupExtraForMonth,
  cycleMonthYmForOverview,
} from "../utils/livingBudget";
import type { ConfiguredCharge } from "../utils/fixedCharges";
import {
  buildCycleReport,
  cycleNeedsOpenTab,
  cycleStartForDate,
  cycleStartForStatementBilling,
  cycleStartFromMonthKey,
  defaultOverviewMonthKey,
  effectiveManualCycleSpend,
  findPartialMonth,
  getCycleRangeForStart,
  isCycleMonthKey,
  loadCycleDay,
  loadPaceIncludeFixed,
  mergeMonthsWithOpenCycles,
  partialStatementSavedAtForCycle,
  pruneStaleManualCycleSpend,
  latestFinalBillingDate as getLatestFinalBillingDate,
} from "../utils/pace";

const auth = useAuthStore();
const router = useRouter();

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
const livingBudgetMonthTopups = ref<ReturnType<typeof normalizeLivingBudgetMonthTopup>[]>([]);
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
  resolveLivingBudgetAmount(
    currentMonthKey.value,
    spendingReport.value,
    livingBudgetSegments.value,
    cycleDay.value,
    livingBudgetMonthTopups.value,
    configuredCharges.value,
  ),
);

const livingBudgetCycleYm = computed(() =>
  cycleMonthYmForOverview(currentMonthKey.value, spendingReport.value, cycleDay.value),
);

const livingBudgetTopupExtra = computed(() =>
  monthTopupExtraForMonth(livingBudgetCycleYm.value, livingBudgetMonthTopups.value),
);

const livingBudgetBaseAmount = computed(() =>
  livingBudgetBaseForMonth(livingBudgetCycleYm.value, livingBudgetSegments.value, configuredCharges.value),
);

const showPaceHealth = computed(() => {
  if (!spendingReport.value || !currentMonthKey.value) return false;
  if (isPartialCycle.value) {
    return everydaySpendingTotal(spendingReport.value.transactions) > 0;
  }
  if (!isCycleMonthKey(currentMonthKey.value)) return false;
  const start = cycleStartFromMonthKey(currentMonthKey.value);
  return cycleNeedsOpenTab(start, cycleDay.value, months.value);
});

const summaryPaceTone = computed(() => {
  if (!showPaceHealth.value || !spendingReport.value) return null;
  const start = cycleStartForDate(refDate.value, cycleDay.value);
  const partial = findPartialMonth(months.value, start, cycleDay.value);
  const statementAt = partial?.saved_at ?? null;
  const hasStatementSpend = everydaySpendingTotal(spendingReport.value.transactions) > 0;
  return computeLivePaceHealth({
    transactions: paceReport.value?.transactions ?? spendingReport.value.transactions,
    cycleTransactions: spendingReport.value.transactions,
    cycleDay: cycleDay.value,
    referenceDate: refDate.value,
    livingBudget: livingBudgetAmount.value,
    livingBudgetBase: livingBudgetBaseAmount.value,
    livingBudgetTopup: livingBudgetTopupExtra.value,
    budgetSegments: livingBudgetSegments.value,
    budgetMonthTopups: livingBudgetMonthTopups.value,
    latestBillingDate: getLatestFinalBillingDate(months.value),
    configuredCharges: configuredCharges.value,
    cycleStart: start,
    statementSavedAt: statementAt,
    hasStatementSpend,
    partialStatementActive: isPartialCycle.value,
    cycleEverydaySpend: hasStatementSpend
      ? everydaySpendingTotal(spendingReport.value.transactions)
      : null,
  });
});

const overviewLink = computed(() => {
  if (!currentMonthKey.value) return { name: "overview" as const };
  return { name: "overview" as const, query: { month: currentMonthKey.value } };
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
  const statementAt = partial?.saved_at ?? null;
  let txs = paceReport.value?.transactions ?? [];
  let hasPartialData = false;
  if (partial) {
    try {
      const partialReport = await fetchReport(auth.isDemo, partial.key, auth.token || undefined);
      txs = partialReport.transactions;
      hasPartialData = true;
    } catch {
      /* use pace txs */
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
      livingBudgetMonthTopups.value = (budget.month_topups || []).map(normalizeLivingBudgetMonthTopup);
    } catch {
      livingBudgetSegments.value = [];
      livingBudgetMonthTopups.value = [];
    }

    const monthKey = defaultOverviewMonthKey(m.months, cycleDay.value, refDate.value);
    currentMonthKey.value = monthKey;
    const todayStart = cycleStartForDate(refDate.value, cycleDay.value);
    pruneStaleManualCycleSpend(todayStart, {
      statementSavedAt: partialStatementSavedAtForCycle(m.months, todayStart, cycleDay.value),
      hasStatementSpend: !!findPartialMonth(m.months, todayStart, cycleDay.value),
    });

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

function goSignIn() {
  void goToSignIn(router);
}
</script>
