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
      :loading="portfolio.loading"
      :refreshing="portfolio.refreshing"
      :demo="auth.isDemo"
      :kaspa="portfolio.kaspaQuote"
      :fxcn="portfolio.fxcnQuote"
      :market="portfolio.marketSnapshot"
      @refresh="portfolio.refresh(auth.isDemo, auth.token || undefined, true)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { fetchReport } from "@/shared/api/client";
import AppLoader from "@/shared/components/AppLoader.vue";
import SummaryMetrics from "@/features/spending/components/SummaryMetrics.vue";
import PortfolioSummaryCard from "@/features/home/components/PortfolioSummaryCard.vue";
import UpcomingEventsCard from "@/features/home/components/UpcomingEventsCard.vue";
import { onSpendingRefresh } from "@/features/spending/composables/useSpendingRefresh";
import { useAuthStore } from "@/shared/stores/auth";
import { type HomeDataBundle, useHomeDataStore } from "@/features/home/stores/homeData";
import { usePortfolioStore } from "@/shared/stores/portfolio";
import { useCalendarDataStore } from "@/shared/stores/viewData";
import { goToSignIn } from "@/features/auth/utils/signIn";
import type { CalendarEvent, MonthItem, SpendingReport } from "@/shared/types";
import { referenceDate } from "@/shared/utils/appDate";
import { billingCycleLabel, openCycleTabLabel } from "@/shared/utils/format";
import { everydaySpendingTotal } from "@/features/household/utils/householdBudget";
import { computeLivePaceHealth } from "@/features/spending/utils/paceHealth";
import { DEFAULT_PACE_MONTHS } from "@/features/spending/utils/paceMonths";
import {
  normalizeLivingBudgetMonthTopup,
  normalizeLivingBudgetSegment,
  resolvedLivingBudget as resolveLivingBudgetAmount,
  livingBudgetBaseForMonth,
  monthTopupExtraForMonth,
  cycleMonthYmForOverview,
} from "@/features/household/utils/livingBudget";
import type { ConfiguredCharge } from "@/features/household/utils/fixedCharges";
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
} from "@/features/spending/utils/pace";

const auth = useAuthStore();
const homeData = useHomeDataStore();
const calendarData = useCalendarDataStore();
const portfolio = usePortfolioStore();
const router = useRouter();

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

async function loadCalendar(options: { background?: boolean; force?: boolean } = {}) {
  const demo = auth.isDemo;
  const token = auth.token || undefined;
  const cached = !options.force && !options.background && calendarData.peek(demo, token);

  if (cached) {
    calendarEvents.value = cached.events;
    calendarLoading.value = false;
    void loadCalendar({ background: true });
    return;
  }

  if (!options.background) {
    calendarLoading.value = true;
    calendarError.value = "";
  }
  try {
    const data = await calendarData.load(demo, token, options);
    calendarEvents.value = data.events;
  } catch (e) {
    if (!options.background) {
      calendarError.value = String(e);
      calendarEvents.value = [];
    }
  } finally {
    if (!options.background) calendarLoading.value = false;
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

async function refreshMonthReport(monthKey: string) {
  try {
    const r = await fetchReport(auth.isDemo, monthKey, auth.token || undefined);
    if (currentMonthKey.value === monthKey) spendingReport.value = r;
  } catch {
    /* keep cached scoped report */
  }
}

async function resolveSpendingReport(monthKey: string | null, bundle: HomeDataBundle) {
  if (monthKey && isCycleMonthKey(monthKey)) {
    spendingReport.value = await buildCycleReportForKey(monthKey);
    return;
  }
  if (monthKey) {
    const scoped = bundle.scoped_reports?.[monthKey];
    if (scoped) {
      spendingReport.value = scoped;
      void refreshMonthReport(monthKey);
      return;
    }
    spendingReport.value = await fetchReport(auth.isDemo, monthKey, auth.token || undefined);
    return;
  }
  spendingReport.value = null;
}

async function applySpendingBundle(bundle: HomeDataBundle, opts: { preserveMonth?: boolean } = {}) {
  months.value = bundle.months;
  if (auth.isDemo && bundle.demo_as_of) auth.demoAsOf = bundle.demo_as_of;
  configuredCharges.value = bundle.fixed_charges;
  paceReport.value = bundle.report;
  livingBudgetSegments.value = bundle.living_budget.segments.map(normalizeLivingBudgetSegment);
  livingBudgetMonthTopups.value = (bundle.living_budget.month_topups || []).map(
    normalizeLivingBudgetMonthTopup,
  );

  const monthKey =
    opts.preserveMonth && currentMonthKey.value
      ? currentMonthKey.value
      : defaultOverviewMonthKey(bundle.months, cycleDay.value, refDate.value);
  currentMonthKey.value = monthKey;
  const todayStart = cycleStartForDate(refDate.value, cycleDay.value);
  pruneStaleManualCycleSpend(todayStart, {
    statementSavedAt: partialStatementSavedAtForCycle(bundle.months, todayStart, cycleDay.value),
    hasStatementSpend: !!findPartialMonth(bundle.months, todayStart, cycleDay.value),
  });
  await resolveSpendingReport(monthKey, bundle);
}

async function loadSpending(options: { background?: boolean; force?: boolean } = {}) {
  const demo = auth.isDemo;
  const token = auth.token || undefined;
  const cached = !options.force && !options.background && homeData.peek(demo, token);

  if (cached) {
    try {
      await applySpendingBundle(cached);
      spendingLoading.value = false;
      void loadSpending({ background: true });
    } catch (e) {
      spendingError.value = String(e);
    }
    return;
  }

  if (!options.background) {
    spendingLoading.value = true;
    spendingError.value = "";
  }
  try {
    const bundle = await homeData.load(demo, token, options);
    await applySpendingBundle(bundle, { preserveMonth: options.background });
  } catch (e) {
    if (!options.background) {
      spendingError.value = String(e);
      spendingReport.value = null;
    }
  } finally {
    if (!options.background) spendingLoading.value = false;
  }
}

let stopSpendingRefresh: (() => void) | undefined;

onMounted(() => {
  void loadSpending();
  void loadCalendar();
  stopSpendingRefresh = onSpendingRefresh(() => {
    void loadSpending({ force: true });
  });
});

onUnmounted(() => {
  stopSpendingRefresh?.();
});

function goSignIn() {
  void goToSignIn(router);
}
</script>
