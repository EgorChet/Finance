<template>
  <div class="pace-card">
    <header class="pace-header">
      <div class="pace-header-title">
        <h3 class="pace-card-title">Am I overspending?</h3>
        <p class="pace-card-sub">{{ formatCycleRange(cycleInfo.cycleStart, cycleInfo.cycleEnd) }}</p>
      </div>
      <div class="pace-progress-wrap">
        <div class="pace-progress-bar" role="progressbar" :aria-valuenow="cycleInfo.dayIndex" :aria-valuemax="cycleInfo.cycleLength">
          <div class="pace-progress-fill" :style="{ width: progressPct + '%' }" />
        </div>
        <span class="pace-progress-label">Day {{ cycleInfo.dayIndex }} of {{ cycleInfo.cycleLength }}</span>
      </div>
    </header>

    <div class="pace-layout">
      <section v-if="showEntryPanel" class="pace-panel pace-panel-entry pace-panel-wide">
        <div class="pace-entry-grid">
          <div class="pace-entry-main">
            <label v-if="!partialStatementActive" class="pace-manual-label" for="pace-manual-input">
              Everyday spending so far (₪)
            </label>
            <input
              v-if="!partialStatementActive"
              id="pace-manual-input"
              v-model="manualInput"
              class="input pace-manual-input"
              type="text"
              inputmode="decimal"
              placeholder="e.g. 2000"
              @blur="persistManual"
            />
            <p class="pace-manual-hint">
              <template v-if="partialStatementActive && pace && pace.statementSpend > 0">
                From partial statement: <strong>{{ formatIls(pace.statementSpend) }}</strong>
              </template>
              <template v-else-if="pace && pace.manualEverydaySpend !== null">
                Using your entry as total spending for this cycle.
              </template>
              <template v-else-if="pace && pace.statementSpend > 0">
                From statements: {{ formatIls(pace.statementSpend) }}
              </template>
              <template v-else>
                Enter your spending from the bank app for this cycle.
              </template>
            </p>
          </div>
        </div>
      </section>

      <template v-if="pace">
        <section class="pace-panel pace-panel-metrics">
          <div class="pace-simple">
            <template v-if="displaySpend > 0 && paceCompareAvg > 0">
              <div class="pace-verdict" :class="verdictToneClass">
                <p class="pace-verdict-status">{{ verdictStatus }}</p>
                <p class="pace-verdict-delta">{{ verdictDelta }}</p>
                <p v-if="budgetNote" class="pace-budget-note">{{ budgetNote }}</p>
              </div>

              <details class="pace-simple-details">
                <summary>See the numbers</summary>
                <p class="pace-simple-details-note">
                  Same as the Everyday spending tile — excludes rent, car loan, and Dev Institute.
                </p>
                <div class="pace-simple-table-wrap">
                  <table class="pace-simple-table">
                    <tbody>
                      <tr class="pace-simple-table-group">
                        <td colspan="2">So far this cycle</td>
                      </tr>
                      <tr>
                        <td>Everyday spending</td>
                        <td>{{ formatIls(displaySpend) }}</td>
                      </tr>
                      <tr v-if="everydayComposition.exportTotal > 0" class="pace-simple-table-sub">
                        <td>On Visa export</td>
                        <td>{{ formatIls(everydayComposition.exportTotal) }}</td>
                      </tr>
                      <tr v-if="everydayComposition.configuredTotal > 0" class="pace-simple-table-sub">
                        <td>Extra charges</td>
                        <td>{{ formatIls(everydayComposition.configuredTotal) }}</td>
                      </tr>
                      <tr>
                        <td>Usual everyday at this point</td>
                        <td>{{ formatIls(paceCompareAvg) }}</td>
                      </tr>
                      <tr class="pace-simple-table-gap" :class="deltaClass">
                        <td>Difference</td>
                        <td>{{ formatGap(pace?.vsAvgDelta ?? 0) }}</td>
                      </tr>
                      <tr class="pace-simple-table-group">
                        <td colspan="2">Month-end estimate</td>
                      </tr>
                      <tr>
                        <td>Your everyday month</td>
                        <td>~{{ formatIls(projectedTotal) }}</td>
                      </tr>
                      <tr>
                        <td>Usual everyday month</td>
                        <td>~{{ formatIls(projectedAtUsualPaceForecast) }}</td>
                      </tr>
                      <tr class="pace-simple-table-gap" :class="projectedDeltaClass">
                        <td>Difference</td>
                        <td>{{ formatGap(projectedVsUsualDelta) }}</td>
                      </tr>
                      <template v-if="budgetContext">
                        <tr class="pace-simple-table-group">
                          <td colspan="2">Living budget</td>
                        </tr>
                        <tr>
                          <td>Budget this cycle</td>
                          <td>{{ formatIls(budgetContext.livingBudget) }}</td>
                        </tr>
                        <tr v-if="budgetContext.topupExtra > 0" class="pace-simple-table-sub">
                          <td>Extra this month</td>
                          <td>+{{ formatIls(budgetContext.topupExtra) }}</td>
                        </tr>
                        <tr>
                          <td>Spent on cap</td>
                          <td>{{ formatIls(budgetContext.spentOnCap) }}</td>
                        </tr>
                        <tr :class="moneyLeftNowClass">
                          <td>Money left</td>
                          <td>{{ formatMoneyLeft(budgetContext.moneyLeft) }}</td>
                        </tr>
                        <tr class="pace-simple-table-group">
                          <td colspan="2">Month-end (budget)</td>
                        </tr>
                        <tr>
                          <td>Your projected left</td>
                          <td>~{{ formatMoneyLeft(budgetContext.projectedMoneyLeft) }}</td>
                        </tr>
                        <tr>
                          <td>At usual pace left</td>
                          <td>~{{ formatMoneyLeft(budgetContext.usualProjectedMoneyLeft) }}</td>
                        </tr>
                        <tr class="pace-simple-table-gap" :class="budgetProjectedDeltaClass">
                          <td>Difference</td>
                          <td>{{ formatGap(budgetProjectedDelta) }}</td>
                        </tr>
                      </template>
                    </tbody>
                  </table>
                </div>
              </details>
            </template>

            <div v-else-if="displaySpend > 0" class="pace-simple-fallback">
              <p class="pace-simple-fallback-value">{{ formatIls(displaySpend) }}</p>
              <p class="pace-simple-fallback-label">everyday spending so far</p>
              <p class="pace-simple-meta pace-simple-meta-muted">
                Upload more past statements to see if you're overspending.
              </p>
            </div>

            <p v-else class="pace-simple-meta pace-simple-meta-muted">
              Enter spending from your bank app, or upload a partial statement.
            </p>
          </div>
        </section>
      </template>

      <p v-if="pace?.dataStale && !resolvedManualSpend" class="pace-warning pace-panel-wide">
        Upload your latest bill or enter current spending above — this cycle isn't on your statements yet.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Transaction } from "../types";
import { formatIls, formatAboutIls } from "../utils/format";
import { everydaySpendingComposition } from "../utils/householdBudget";
import { computePaceBudgetContext, paceBudgetNote } from "../utils/paceBudget";
import type { ConfiguredCharge } from "../utils/fixedCharges";
import {
  computePace,
  cycleStartForDate,
  effectiveManualCycleSpend,
  getBillingCycle,
  getCycleRangeForStart,
  loadCycleDay,
  loadPaceAvgCycles,
  pruneStaleManualCycleSpend,
  saveManualCycleSpend,
} from "../utils/pace";

const props = defineProps<{
  transactions: Transaction[];
  /** Current cycle transactions for everyday breakdown (matches SummaryMetrics). */
  cycleTransactions?: Transaction[];
  latestBillingDate?: string | null;
  configuredCharges?: ConfiguredCharge[];
  partialStatementActive?: boolean;
  /** Everyday spending for the current cycle view — matches SummaryMetrics when set. */
  cycleEverydaySpend?: number | null;
  /** Server timestamp for the partial snapshot covering this cycle, if any. */
  statementSavedAt?: string | null;
  partialTotalSpend?: number | null;
  /** Pin demo pace to sample “today” (Jun 13 2026). */
  referenceDate?: Date;
  /** Billing cycle start day (default from settings). */
  cycleDay?: number;
  /** Resolved living budget for this cycle (incl. Cibus + monthly injection). */
  livingBudget?: number | null;
  /** Base budget before monthly injection. */
  livingBudgetBase?: number | null;
  /** One-off extra cap added this calendar month. */
  livingBudgetTopup?: number;
}>();

const emit = defineEmits<{ "settings-change": [] }>();

const cycleDay = computed(() => props.cycleDay ?? loadCycleDay());
const avgCycles = ref(loadPaceAvgCycles());

const cycleInfo = computed(() => {
  const today = props.referenceDate ?? new Date();
  const norm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const cycle = getBillingCycle(norm, cycleDay.value);
  const start = cycleStartForDate(norm, cycleDay.value);
  const { end } = getCycleRangeForStart(start, cycleDay.value);
  return {
    dayIndex: cycle.dayIndex,
    cycleLength: cycle.cycleLength,
    cycleStart: start,
    cycleEnd: end,
  };
});

const progressPct = computed(() => {
  const { dayIndex, cycleLength } = cycleInfo.value;
  if (!cycleLength) return 0;
  return Math.round((dayIndex / cycleLength) * 100);
});

const cycleStart = computed(() => cycleInfo.value.cycleStart);
const manualInput = ref("");

const hasStatementSpend = computed(
  () => props.cycleEverydaySpend != null && props.cycleEverydaySpend > 0,
);

const effectiveManual = computed(() =>
  effectiveManualCycleSpend(cycleStart.value, {
    statementSavedAt: props.statementSavedAt,
    hasStatementSpend: hasStatementSpend.value,
  }),
);

function loadManualForCycle() {
  pruneStaleManualCycleSpend(cycleStart.value, {
    statementSavedAt: props.statementSavedAt,
    hasStatementSpend: hasStatementSpend.value,
  });
  const saved = effectiveManualCycleSpend(cycleStart.value, {
    statementSavedAt: props.statementSavedAt,
    hasStatementSpend: hasStatementSpend.value,
  });
  manualInput.value = saved !== null ? String(saved) : "";
}

loadManualForCycle();

const manualSpend = computed((): number | null => {
  const raw = String(manualInput.value ?? "").trim().replace(/,/g, "");
  if (!raw) return null;
  const n = parseFloat(raw);
  if (Number.isNaN(n) || n < 0) return null;
  return n;
});

const resolvedManualSpend = computed((): number | null => {
  if (props.partialStatementActive) return null;
  if (hasStatementSpend.value && effectiveManual.value === null) return null;
  return manualSpend.value;
});

const everydaySpendOverride = computed(() => {
  if (resolvedManualSpend.value !== null) return undefined;
  if (props.cycleEverydaySpend != null && props.cycleEverydaySpend > 0) {
    return props.cycleEverydaySpend;
  }
  return undefined;
});

const pace = computed(() =>
  computePace(props.transactions, {
    cycleDay: cycleDay.value,
    includeFixed: false,
    latestBillingDate: props.latestBillingDate ?? null,
    manualSpend: resolvedManualSpend.value,
    avgCycles: avgCycles.value,
    configuredCharges: props.configuredCharges ?? [],
    statementSpendOverride: everydaySpendOverride.value,
    statementVariableOverride: everydaySpendOverride.value,
    today: props.referenceDate,
  }),
);

const displaySpend = computed(() => {
  if (everydaySpendOverride.value != null) return everydaySpendOverride.value;
  return pace.value?.currentSpend ?? 0;
});

const showEntryPanel = computed(() => {
  if (props.partialStatementActive) return false;
  if (displaySpend.value > 0 && resolvedManualSpend.value === null) return false;
  return true;
});

const everydayComposition = computed(() =>
  everydaySpendingComposition(props.cycleTransactions ?? []),
);

const projectedTotal = computed(() => pace.value?.projectedTotal ?? 0);

const paceCompareAvg = computed(() => pace.value?.historicalAvgAtDay ?? 0);

const projectedAtUsualPaceForecast = computed(() => pace.value?.projectedAtUsualPaceForecast ?? 0);

const projectedVsUsualDelta = computed(() => pace.value?.projectedVsUsualDelta ?? 0);

const budgetContext = computed(() => {
  if (props.livingBudget == null || props.livingBudget <= 0) return null;
  return computePaceBudgetContext(
    props.cycleTransactions ?? [],
    props.livingBudget,
    projectedTotal.value,
    projectedAtUsualPaceForecast.value,
    {
      baseBudget: props.livingBudgetBase,
      topupExtra: props.livingBudgetTopup ?? 0,
    },
  );
});

const budgetNote = computed(() => {
  if (!budgetContext.value) return "";
  return paceBudgetNote(budgetContext.value, projectedVsUsualDelta.value);
});

const budgetProjectedDelta = computed(() =>
  budgetContext.value
    ? budgetContext.value.projectedMoneyLeft - budgetContext.value.usualProjectedMoneyLeft
    : 0,
);

const budgetProjectedDeltaClass = computed(() => {
  const d = budgetProjectedDelta.value;
  if (d > 0) return "pace-delta-good";
  if (d < 0) return "pace-delta-bad";
  return "";
});

const moneyLeftNowClass = computed(() => {
  const left = budgetContext.value?.moneyLeft ?? 0;
  if (left < 0) return "pace-simple-table-gap pace-delta-bad";
  if (left <= (props.livingBudget ?? 0) * 0.2) return "pace-simple-table-gap pace-delta-bad";
  return "";
});

const projectedDeltaClass = computed(() => {
  const d = projectedVsUsualDelta.value;
  if (d > 0) return "pace-delta-bad";
  if (d < 0) return "pace-delta-good";
  return "";
});

const verdictStatus = computed(() => {
  const monthGap = projectedVsUsualDelta.value;
  if (Math.abs(monthGap) < 50) return "Doing fine";
  if (monthGap > 0) return "Overspending";
  return "Doing fine";
});

const verdictDelta = computed(() => {
  const monthGap = projectedVsUsualDelta.value;
  if (Math.abs(monthGap) < 50) {
    const nowGap = pace.value?.vsAvgDelta ?? 0;
    if (Math.abs(nowGap) < 50) return "About the same as your usual month";
    if (nowGap > 0) return `~${formatAboutIls(nowGap)} above usual so far`;
    return `~${formatAboutIls(Math.abs(nowGap))} below usual so far`;
  }
  if (monthGap > 0) return `~${formatAboutIls(monthGap)} above your usual month`;
  return `~${formatAboutIls(Math.abs(monthGap))} below your usual month`;
});

const verdictToneClass = computed(() => {
  const monthGap = projectedVsUsualDelta.value;
  const projectedLeft = budgetContext.value?.projectedMoneyLeft;
  if (Math.abs(monthGap) < 50) {
    const nowGap = pace.value?.vsAvgDelta ?? 0;
    if (nowGap > 50) return "pace-verdict--warn";
    return "pace-verdict--ok";
  }
  if (monthGap > 0) {
    if (projectedLeft != null && projectedLeft >= 500) return "pace-verdict--warn";
    return "pace-verdict--bad";
  }
  return "pace-verdict--good";
});

function formatMoneyLeft(amount: number): string {
  if (amount < 0) return `${formatIls(Math.abs(amount))} over`;
  return formatIls(amount);
}

function formatGap(delta: number): string {
  if (Math.abs(delta) < 1) return "Same";
  const abs = formatIls(Math.abs(delta));
  return delta > 0 ? `+${abs}` : `−${abs}`;
}

const deltaClass = computed(() => {
  const delta = pace.value?.vsAvgDelta ?? 0;
  if (delta > 0) return "pace-delta-bad";
  if (delta < 0) return "pace-delta-good";
  return "";
});

function formatCycleRange(start: string, end: string): string {
  const s = new Date(start + "T12:00:00");
  const e = new Date(end + "T12:00:00");
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${fmt(s)} – ${fmt(e)}`;
}

function persistManual() {
  saveManualCycleSpend(cycleStart.value, manualSpend.value);
  emit("settings-change");
}

watch(cycleStart, () => {
  if (document.activeElement?.id !== "pace-manual-input") {
    loadManualForCycle();
  }
});

watch(
  () => [props.statementSavedAt, props.cycleEverydaySpend] as const,
  () => {
    if (document.activeElement?.id !== "pace-manual-input") {
      loadManualForCycle();
    }
  },
);
</script>
