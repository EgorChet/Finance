<template>
  <div class="home-page">
    <DemoBanner />
    <header class="today-head">
      <h2 class="page-title">{{ t("Today") }}</h2>
      <span class="today-date">{{ todayLabel }}<template v-if="cycleLabel"> · {{ tr(cycleLabel) }}</template></span>
    </header>

    <AppLoader v-if="spendingLoading" variant="hero" :title="t('Loading spending')" />
    <template v-else>
      <p v-if="spendingError" class="home-card-error">{{ spendingError }}</p>
      <template v-else-if="spendingReport">
        <SummaryMetrics
          compact
          :report="spendingReport"
          :living-budget="livingBudgetAmount"
          :plan="summaryPlan"
          :cycle-day="cycleDay"
          :reference-date="refDate"
          :budget-extras="budgetExtras"
        />

        <section v-if="todoItems.length || hasBitToSort" class="today-section">
          <h3 class="today-title">{{ t("Needs you") }}</h3>
          <div class="bx-list">
            <RouterLink v-for="item in todoItems" :key="item.key" :to="item.to" class="bx-row today-link">
              <span class="tx-row-icon" aria-hidden="true">{{ item.icon }}</span>
              <span class="bx-row-body">
                <span class="bx-row-top">
                  <span class="bx-row-name">{{ item.title }}</span>
                  <span v-if="item.amount" class="bx-row-amount">{{ item.amount }}</span>
                </span>
                <span class="bx-row-meta"><span>{{ item.sub }}</span></span>
              </span>
              <span class="bx-chevron" aria-hidden="true">›</span>
            </RouterLink>
          </div>
          <BitSortCard v-if="!auth.readOnly" :transactions="spendingReport.transactions" />
        </section>

        <section v-if="topCategories.length" class="today-section">
          <div class="bx-list-head today-list-head">
            <h3 class="today-title">{{ t("This cycle") }}</h3>
            <RouterLink class="today-more" :to="overviewLink">{{ t("All categories ›") }}</RouterLink>
          </div>
          <div class="bx-list">
            <RouterLink v-for="c in topCategories" :key="c.name" :to="overviewLink" class="bx-row today-link">
              <CategoryIcon :category="c.name" />
              <span class="bx-row-body">
                <span class="bx-row-top">
                  <span class="bx-row-name">{{ catName(c.name) }}</span>
                  <span class="bx-row-amount">{{ formatIlsWhole(c.total) }}</span>
                </span>
                <span class="bx-row-meta">
                  <span :class="`cat-row-compare cat-row-compare--${c.tone}`">{{ c.line || t("{n} {n|charge|charges}", { n: c.count }) }}</span>
                </span>
              </span>
            </RouterLink>
          </div>
        </section>

        <section v-if="spendingReport.transactions.length" class="today-section">
          <div class="bx-list-head today-list-head">
            <h3 class="today-title">{{ t("Latest charges") }}</h3>
            <RouterLink class="today-more" :to="{ name: 'browse' }">{{ t("All transactions ›") }}</RouterLink>
          </div>
          <TransactionList
            class="find-list"
            :transactions="spendingReport.transactions"
            title=""
            show-category
            :show-sort="false"
            :default-limit="5"
          />
        </section>
      </template>
      <p v-else class="home-card-empty">{{ t("Upload a statement to see spending for this cycle.") }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import DemoBanner from "@/shared/components/DemoBanner.vue";
import { catName, dateTag, t, tr } from "@/shared/i18n";
import CategoryIcon from "@/shared/components/CategoryIcon.vue";
import { friendlyError } from "@/shared/utils/friendlyError";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { fetchReport } from "@/shared/api/client";
import AppLoader from "@/shared/components/AppLoader.vue";
import SummaryMetrics from "@/features/spending/components/SummaryMetrics.vue";
import TransactionList from "@/shared/components/TransactionList.vue";
import BitSortCard from "@/features/merchants/BitSortCard.vue";
import { useReviewDataStore } from "@/features/merchants/stores/reviewData";
import { formatIlsWhole } from "@/shared/utils/format";
import { isBitTransfer } from "@/shared/composables/useChargeCategory";
import {
  buildCategoryCompareContext,
  categoryCompareLine,
  categoryCompareTone,
  computeCategoryCompareFromContext,
} from "@/features/spending/utils/categoryCompare";
import { rollupCategoriesForDisplay } from "@/shared/categories";
import { onSpendingRefresh } from "@/features/spending/composables/useSpendingRefresh";
import { useAuthStore } from "@/shared/stores/auth";
import { type HomeDataBundle, useHomeDataStore } from "@/features/home/stores/homeData";
import { goToSignIn } from "@/features/auth/utils/signIn";
import type { MonthItem, SpendingReport, Transaction } from "@/shared/types";
import { referenceDate } from "@/shared/utils/appDate";
import { computeLiveBudgetPlan } from "@/features/spending/utils/paceHealth";
import type { RegularChargeOverrides } from "@core/spending/regularCharges";
import { DEFAULT_PACE_MONTHS } from "@/features/spending/utils/paceMonths";
import {
  normalizeLivingBudgetMonthTopup,
  normalizeLivingBudgetSegment,
  resolvedLivingBudget as resolveLivingBudgetAmount,
  cycleMonthYmForOverview,
  monthTopupsForMonth,
} from "@/features/household/utils/livingBudget";
import type { ConfiguredCharge } from "@/features/household/utils/fixedCharges";
import {
  buildCycleReport,
  cycleNeedsOpenTab,
  cycleStartForDate,
  cycleStartForStatementBilling,
  cycleStartFromMonthKey,
  defaultOverviewMonthKey,
  findPartialMonth,
  getCycleRangeForStart,
  isCycleMonthKey,
  loadCycleDay,
  loadPaceIncludeFixed,
  formatOverviewMonthLabel,
  mergeMonthsWithOpenCycles,
  partialStatementSavedAtForCycle,
  pruneStaleManualCycleSpend,
} from "@/features/spending/utils/pace";

const auth = useAuthStore();
const homeData = useHomeDataStore();
const reviewData = useReviewDataStore();
const toLabelCount = ref(0);
const router = useRouter();

const spendingLoading = ref(true);
const spendingError = ref("");
const spendingReport = ref<SpendingReport | null>(null);
const paceReport = ref<SpendingReport | null>(null);
const months = ref<MonthItem[]>([]);
const currentMonthKey = ref<string | null>(null);
const configuredCharges = ref<ConfiguredCharge[]>([]);
const regularChargeOverrides = ref<RegularChargeOverrides>({});
const livingBudgetSegments = ref<ReturnType<typeof normalizeLivingBudgetSegment>[]>([]);
const livingBudgetMonthTopups = ref<ReturnType<typeof normalizeLivingBudgetMonthTopup>[]>([]);
const cycleDay = ref(loadCycleDay());

const refDate = computed(() => referenceDate(auth.isDemo, auth.demoAsOf));
const displayMonths = computed(() => {
  const merged = mergeMonthsWithOpenCycles(months.value, cycleDay.value, refDate.value);
  return merged.map((m) => formatOverviewMonthLabel(m, months.value, cycleDay.value, refDate.value));
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

const activeCycleStart = computed((): string | null => {
  const key = currentMonthKey.value;
  if (!key) return null;
  if (isCycleMonthKey(key)) return cycleStartFromMonthKey(key);
  const month = months.value.find((m) => m.key === key);
  if (month?.partial) return cycleStartForStatementBilling(month.billing_date, cycleDay.value);
  return null;
});

/** This month's extra money, each addition separately (shown under the budget). */
const budgetExtras = computed(() =>
  monthTopupsForMonth(
    cycleMonthYmForOverview(currentMonthKey.value, spendingReport.value, cycleDay.value),
    livingBudgetMonthTopups.value,
  ),
);

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




const showPaceHealth = computed(() => {
  if (!spendingReport.value || !currentMonthKey.value) return false;
  // The open cycle always gets the budget card, even on day 1 before any charge (same as Spending).
  if (isPartialCycle.value) return true;
  if (!isCycleMonthKey(currentMonthKey.value)) return false;
  const start = cycleStartFromMonthKey(currentMonthKey.value);
  return cycleNeedsOpenTab(start, cycleDay.value, months.value);
});

const summaryPlan = computed(() => {
  if (!showPaceHealth.value || !spendingReport.value) return null;
  return computeLiveBudgetPlan({
    cycleTransactions: spendingReport.value.transactions,
    cycleDay: cycleDay.value,
    cycleStart: activeCycleStart.value ?? cycleStartForDate(refDate.value, cycleDay.value),
    referenceDate: refDate.value,
    livingBudget: livingBudgetAmount.value,
    history: paceReport.value?.transactions,
    configuredCharges: configuredCharges.value,
    regularCharges: regularChargeOverrides.value,
    dataAsOf: findPartialMonth(
      months.value,
      activeCycleStart.value ?? cycleStartForDate(refDate.value, cycleDay.value),
      cycleDay.value,
    )?.saved_at ?? null,
  });
});

const todayLabel = computed(() =>
  refDate.value.toLocaleDateString(dateTag(), { weekday: "long", day: "numeric", month: "long" }),
);

const hasBitToSort = computed(
  () => !!spendingReport.value?.transactions.some((t) => isBitTransfer(t) && !t.category_override && t.charge_amount > 0),
);

/** Things to act on: merchants to label and charges coming up this cycle. */
const todoItems = computed(() => {
  const items: { key: string; icon: string; title: string; sub: string; amount?: string; to: string | object }[] = [];
  if (toLabelCount.value > 0) {
    items.push({
      key: "label",
      icon: "🏷️",
      title: t("{n} {n|merchant needs|merchants need} a name", { n: toLabelCount.value }),
      sub: t("Label them so categories stay right"),
      to: { name: "browse", query: { view: "merchants" } },
    });
  }
  for (const row of summaryPlan.value?.committedRows ?? []) {
    // Only one-off charges are news; monthly bills come every month.
    if (row.kind !== "upcoming" || !row.oneTimeDate) continue;
    items.push({
      key: `up-${row.label}`,
      icon: "⏳",
      title: tr(row.label),
      sub: t("Coming up this cycle · already set aside"),
      amount: formatIlsWhole(row.amount),
      to: { name: "household", hash: "#one-time" },
    });
  }
  return items;
});

/** Top categories of the open cycle with the same "vs usual" line as Spending. */
const topCategories = computed(() => {
  const report = spendingReport.value;
  if (!report) return [];
  const rows = rollupCategoriesForDisplay(report.by_category).slice(0, 4);
  const start = activeCycleStart.value ?? cycleStartForDate(refDate.value, cycleDay.value);
  const ctx = showPaceHealth.value
    ? buildCategoryCompareContext(paceReport.value?.transactions ?? [], {
        cycleDay: cycleDay.value,
        cycleStart: start,
        referenceDate: refDate.value,
        throughDay: summaryPlan.value?.byThisDay?.day ?? null,
      })
    : null;
  return rows.map((c) => {
    const result = ctx
      ? computeCategoryCompareFromContext(ctx, report.transactions, { kind: "rollup", category: c.category_en }, c.category_en)
      : null;
    return {
      name: c.category_en,
      total: c.total,
      count: c.count,
      line: categoryCompareLine(result),
      tone: categoryCompareTone(result),
    };
  });
});

async function loadToLabel() {
  if (auth.readOnly && !auth.isDemo) return;
  try {
    const res = await reviewData.load(auth.isDemo, auth.token || undefined, {
      includeReviewed: false,
      includeLabeled: false,
      onePerMerchant: true,
    });
    toLabelCount.value = res.queue.length;
  } catch {
    toLabelCount.value = 0;
  }
}

const overviewLink = computed(() => {
  if (!currentMonthKey.value) return { name: "overview" as const };
  return { name: "overview" as const, query: { month: currentMonthKey.value } };
});

async function buildCycleReportForKey(monthKey: string): Promise<SpendingReport> {
  const start = cycleStartFromMonthKey(monthKey);
  const { end } = getCycleRangeForStart(start, cycleDay.value);
  const partial = findPartialMonth(months.value, start, cycleDay.value);
  const statementAt = partial?.saved_at ?? null;
  let txs: Transaction[] = [];
  let hasPartialData = false;
  if (partial) {
    try {
      const partialReport = await fetchReport(auth.isDemo, partial.key, auth.token || undefined);
      txs = partialReport.transactions;
      hasPartialData = true;
    } catch {
      /* no partial snapshot — show manual spend only */
    }
  }
  pruneStaleManualCycleSpend(start, {
    statementSavedAt: statementAt,
    hasStatementSpend: hasPartialData,
  });
  return buildCycleReport(txs, start, end, {
    includeFixed: loadPaceIncludeFixed(),
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
  regularChargeOverrides.value = bundle.regular_charges ?? {};
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
      spendingError.value = friendlyError(e);
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
      spendingError.value = friendlyError(e);
      spendingReport.value = null;
    }
  } finally {
    if (!options.background) spendingLoading.value = false;
  }
}

let stopSpendingRefresh: (() => void) | undefined;

onMounted(() => {
  void loadSpending();
  void loadToLabel();
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
