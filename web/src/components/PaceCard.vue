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
              </div>

              <details class="pace-simple-details">
                <summary>See the numbers</summary>
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

      <p v-if="pace?.dataStale && !manualSpend" class="pace-warning pace-panel-wide">
        Upload your latest bill or enter current spending above — this cycle isn't on your statements yet.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Transaction } from "../types";
import { formatIls, formatAboutIls, roundMoney } from "../utils/format";
import { everydaySpendingComposition } from "../utils/householdBudget";
import type { ConfiguredCharge } from "../utils/fixedCharges";
import {
  computePace,
  cycleStartForDate,
  getBillingCycle,
  getCycleRangeForStart,
  loadCycleDay,
  loadManualCycleSpend,
  loadPaceAvgCycles,
  saveManualCycleSpend,
} from "../utils/pace";

const props = defineProps<{
  transactions: Transaction[];
  /** Current cycle transactions for everyday breakdown (matches SummaryMetrics). */
  cycleTransactions?: Transaction[];
  latestBillingDate?: string | null;
  configuredCharges?: ConfiguredCharge[];
  partialStatementActive?: boolean;
  /** Everyday spending from partial export — matches SummaryMetrics tile. */
  partialEverydaySpend?: number | null;
  partialTotalSpend?: number | null;
  /** Pin demo pace to sample “today” (Jun 13 2026). */
  referenceDate?: Date;
  /** Billing cycle start day (default from settings). */
  cycleDay?: number;
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

function loadManualForCycle() {
  const saved = loadManualCycleSpend(cycleStart.value);
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

const statementSpendOverride = computed(() => {
  if (!props.partialStatementActive) return undefined;
  if (props.partialEverydaySpend != null) return props.partialEverydaySpend;
  return undefined;
});

const everydayComposition = computed(() =>
  everydaySpendingComposition(props.cycleTransactions ?? []),
);

const pace = computed(() =>
  computePace(props.transactions, {
    cycleDay: cycleDay.value,
    includeFixed: false,
    latestBillingDate: props.latestBillingDate ?? null,
    manualSpend: props.partialStatementActive ? null : manualSpend.value,
    avgCycles: avgCycles.value,
    configuredCharges: props.configuredCharges ?? [],
    statementSpendOverride: statementSpendOverride.value,
    statementVariableOverride: props.partialStatementActive ? props.partialEverydaySpend : undefined,
    today: props.referenceDate,
  }),
);

const displaySpend = computed(() => pace.value?.currentSpend ?? 0);

const showEntryPanel = computed(() => {
  if (props.partialStatementActive) return false;
  if (displaySpend.value > 0 && manualSpend.value === null) return false;
  return true;
});

const projectedTotal = computed(() => pace.value?.projectedTotal ?? 0);

const paceCompareAvg = computed(() => pace.value?.historicalAvgVariableAtDay ?? 0);

const projectedAtUsualPaceForecast = computed(() => pace.value?.projectedAtUsualPaceForecast ?? 0);

const projectedVsUsualDelta = computed(() => {
  if (!paceCompareAvg.value || !displaySpend.value) return 0;
  return roundMoney(projectedTotal.value - projectedAtUsualPaceForecast.value);
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
  if (Math.abs(monthGap) < 50) {
    const nowGap = pace.value?.vsAvgDelta ?? 0;
    if (nowGap > 50) return "pace-verdict--warn";
    return "pace-verdict--ok";
  }
  if (monthGap > 0) return "pace-verdict--bad";
  return "pace-verdict--good";
});

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
</script>
