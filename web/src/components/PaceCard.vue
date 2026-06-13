<template>
  <div class="pace-card">
    <header class="pace-header">
      <div class="pace-header-title">
        <h3 class="pace-card-title">
          Cycle pace · day {{ cycleInfo.dayIndex }} of {{ cycleInfo.cycleLength }}
        </h3>
        <p class="pace-card-sub">
          {{ openCycleTabLabel(cycleInfo.cycleStart) }} · {{ formatCycleRange(cycleInfo.cycleStart, cycleInfo.cycleEnd) }}
        </p>
      </div>
      <div class="pace-progress-wrap">
        <div class="pace-progress-bar" role="progressbar" :aria-valuenow="cycleInfo.dayIndex" :aria-valuemax="cycleInfo.cycleLength">
          <div class="pace-progress-fill" :style="{ width: progressPct + '%' }" />
        </div>
        <span class="pace-progress-label">{{ progressPct }}% through cycle</span>
      </div>
      <div v-if="app.expertMode" class="pace-header-controls">
        <div class="pace-toolbar-controls">
          <label class="pace-toggle">
            <input v-model="includeFixed" type="checkbox" class="pace-toggle-input" @change="persistFixed" />
            <span class="pace-toggle-track" aria-hidden="true" />
            <span class="pace-toggle-label">Include rent &amp; loans</span>
          </label>
          <label class="pace-toolbar-field">
            <span class="pace-toolbar-field-label">Compare to</span>
            <select v-model.number="avgCycles" class="pace-toolbar-select" @change="persistAvgCycles">
              <option :value="3">Last 3 cycles</option>
              <option :value="6">Last 6 cycles</option>
              <option :value="12">Last 12 cycles</option>
              <option :value="0">All past cycles</option>
            </select>
          </label>
        </div>
        <p class="pace-toolbar-hint">{{ compareToHint }}</p>
      </div>
    </header>

    <div class="pace-layout">
      <section class="pace-panel pace-panel-entry pace-panel-wide">
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
                <span v-if="effectiveIncludeFixed && pace.configuredChargesTotal > 0">
                  + {{ formatIls(pace.configuredChargesTotal) }} bills
                  = <strong>{{ formatIls(pace.currentSpend) }}</strong>
                </span>
              </template>
              <template v-else-if="pace && pace.manualEverydaySpend !== null && effectiveIncludeFixed && pace.configuredChargesTotal > 0">
                {{ formatIls(pace.manualEverydaySpend) }} everyday
                + {{ formatIls(pace.configuredChargesTotal) }} bills
                = <strong>{{ formatIls(pace.currentSpend) }}</strong> total
              </template>
              <template v-else-if="pace && pace.manualEverydaySpend !== null">
                Using your entry as total spending for this cycle.
              </template>
              <template v-else-if="pace && pace.statementSpend > 0">
                From statements: {{ formatIls(pace.statementSpend) }}
              </template>
              <template v-else-if="effectiveIncludeFixed && expectedConfiguredTotal > 0">
                Card spending only — we add rent &amp; loans automatically.
              </template>
              <template v-else>
                Enter your spending from the bank app for this cycle.
              </template>
            </p>
          </div>
          <div
            v-if="app.expertMode && includeFixed && (pace?.configuredCharges.length || expectedConfiguredTotal > 0)"
            class="pace-entry-bills"
          >
            <p class="pace-entry-bills-title">
              Bills added automatically
              <span class="pace-entry-bills-total">{{ formatIls(pace?.configuredChargesTotal ?? expectedConfiguredTotal) }}</span>
            </p>
            <ul class="pace-configured-grid">
              <li v-for="charge in (pace?.configuredCharges.length ? pace.configuredCharges : configuredChargesPreview)" :key="charge.name_en">
                <span>{{ charge.name_en }}</span>
                <span>{{ formatIls(charge.amount) }}</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <template v-if="pace">
        <section class="pace-panel pace-panel-metrics">
          <div class="pace-metrics">
            <div class="pace-metric">
              <div class="pace-stat-label">Spent so far</div>
              <div class="pace-stat-value">{{ formatIls(displaySpend) }}</div>
            </div>
            <div v-if="app.expertMode && paceCompareAvg > 0" class="pace-metric">
              <div class="pace-stat-label">Usually by day {{ cycleInfo.dayIndex }}</div>
              <div class="pace-stat-value">{{ formatIls(paceCompareAvg) }}</div>
              <div class="pace-stat-meta">{{ avgCyclesLabel }}</div>
            </div>
            <div v-if="app.expertMode && paceCompareAvg > 0 && displaySpend > 0" class="pace-metric">
              <div class="pace-stat-label">Vs usual</div>
              <div class="pace-stat-value" :class="deltaClass">{{ deltaLabel }}</div>
              <div class="pace-stat-meta">{{ deltaHint }}</div>
            </div>
            <div v-if="displaySpend > 0" class="pace-metric">
              <div class="pace-stat-label">Projected full cycle</div>
              <div class="pace-stat-value">{{ formatIls(projectedTotal) }}</div>
              <div v-if="app.expertMode && paceCompareAvg > 0" class="pace-stat-meta">
                usual pace ~{{ formatIls(projectedAtUsualPace) }}
              </div>
            </div>
          </div>
          <div v-if="app.expertMode && displaySpend > 0" class="pace-score-row">
            <span class="pace-score" :class="scoreClass">{{ displayScore }} · {{ displayScoreLabel }}</span>
          </div>
        </section>

        <section v-if="app.expertMode && includeFixed && pace.fixedBreakdown.length" class="pace-panel">
          <div class="pace-panel-head">
            <p class="pace-panel-title">Usually bills by day {{ cycleInfo.dayIndex }}</p>
            <p class="pace-panel-hint">
              {{ formatIls(pace.historicalAvgFixedAtDay) }} total · bills land on the 10th
            </p>
          </div>
          <div class="pace-breakdown-list">
            <div v-for="row in pace.fixedBreakdown" :key="row.label" class="pace-breakdown-row">
              <span class="pace-breakdown-label">
                {{ row.label }}
                <span v-if="row.configured" class="pace-tag">configured</span>
              </span>
              <span class="pace-breakdown-amount">{{ formatIls(row.amount) }}</span>
            </div>
          </div>
        </section>

        <section v-if="app.expertMode && pace.variableBreakdown.length" class="pace-panel">
          <div class="pace-panel-head">
            <p class="pace-panel-title">Usually everyday by day {{ cycleInfo.dayIndex }}</p>
            <p class="pace-panel-hint">{{ formatIls(pace.historicalAvgVariableAtDay) }} total</p>
          </div>
          <div class="pace-breakdown-list">
            <div v-for="row in pace.variableBreakdown.slice(0, 8)" :key="row.label" class="pace-breakdown-row">
              <span class="pace-breakdown-label">{{ row.label }}</span>
              <span class="pace-breakdown-amount">{{ formatIls(row.amount) }}</span>
            </div>
          </div>
        </section>

        <section v-if="app.expertMode && pace.recentCycles.length" class="pace-panel pace-panel-wide">
          <div class="pace-panel-head">
            <p class="pace-panel-title">Cycles in this average</p>
            <p class="pace-panel-hint">{{ avgCyclesLabel }}</p>
          </div>
          <div class="pace-cycle-table-wrap">
            <table class="pace-cycle-table">
              <thead>
                <tr>
                  <th>Cycle</th>
                  <th>By day {{ cycleInfo.dayIndex }}</th>
                  <th v-if="includeFixed">Bills</th>
                  <th>Everyday</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in pace.recentCycles" :key="row.cycleStart">
                  <td>{{ row.label }}</td>
                  <td>{{ formatIls(row.totalAtDay) }}</td>
                  <td v-if="includeFixed">{{ formatIls(row.fixedAtDay) }}</td>
                  <td>{{ formatIls(row.variableAtDay) }}</td>
                </tr>
              </tbody>
            </table>
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
import { useAppStore } from "../stores/app";
import type { Transaction } from "../types";
import { formatIls, openCycleTabLabel, roundMoney } from "../utils/format";
import type { ConfiguredCharge } from "../utils/fixedCharges";
import { configuredChargesForCycle, sumConfiguredCharges } from "../utils/fixedCharges";
import {
  computePace,
  cycleStartForDate,
  getBillingCycle,
  getCycleRangeForStart,
  loadManualCycleSpend,
  loadPaceAvgCycles,
  loadPaceIncludeFixed,
  saveManualCycleSpend,
  savePaceAvgCycles,
  savePaceIncludeFixed,
} from "../utils/pace";

/** Billing cycle always starts on the 10th (Leumi Visa). */
const CYCLE_DAY = 10;

const props = defineProps<{
  transactions: Transaction[];
  latestBillingDate?: string | null;
  configuredCharges?: ConfiguredCharge[];
  partialStatementActive?: boolean;
}>();

const emit = defineEmits<{ "settings-change": [] }>();

const app = useAppStore();
const cycleDay = CYCLE_DAY;
const includeFixed = ref(loadPaceIncludeFixed());
const avgCycles = ref(loadPaceAvgCycles());

const effectiveIncludeFixed = computed(() => app.expertMode && includeFixed.value);

const cycleInfo = computed(() => {
  const today = new Date();
  const norm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const cycle = getBillingCycle(norm, cycleDay);
  const start = cycleStartForDate(norm, cycleDay);
  const { end } = getCycleRangeForStart(start, cycleDay);
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

const pace = computed(() =>
  computePace(props.transactions, {
    cycleDay,
    includeFixed: effectiveIncludeFixed.value,
    latestBillingDate: props.latestBillingDate ?? null,
    manualSpend: props.partialStatementActive ? null : manualSpend.value,
    avgCycles: avgCycles.value,
    configuredCharges: props.configuredCharges ?? [],
  }),
);

const expectedConfiguredTotal = computed(() =>
  sumConfiguredCharges(cycleStart.value, props.configuredCharges ?? []),
);

const configuredChargesPreview = computed(() =>
  configuredChargesForCycle(cycleStart.value, props.configuredCharges ?? []).map((c) => ({
    name_en: c.name_en,
    amount: c.amount,
  })),
);

const avgCyclesLabel = computed(() => {
  if (!pace.value) return "";
  const { cyclesUsed, avgCycles: window } = pace.value;
  if (window === 0) return `all ${cyclesUsed} past billing cycles`;
  return `your last ${cyclesUsed} billing cycles`;
});

const compareToHint = computed(() => {
  if (avgCycles.value === 0) return "Averaging all completed cycles at this day of the month";
  return `Averaging the last ${avgCycles.value} completed cycles at this day of the month`;
});

const displaySpend = computed(() => pace.value?.currentSpend ?? 0);

const projectedTotal = computed(() => pace.value?.projectedTotal ?? 0);

const paceCompareAvg = computed(() => {
  if (!pace.value) return 0;
  return effectiveIncludeFixed.value
    ? pace.value.historicalAvgAtDay
    : pace.value.historicalAvgVariableAtDay;
});

const projectedAtUsualPace = computed(() => pace.value?.projectedAtUsualPace ?? 0);

const deltaLabel = computed(() => {
  const delta = pace.value?.vsAvgDelta ?? 0;
  if (delta === 0) return "On usual";
  const abs = formatIls(Math.abs(delta));
  return delta > 0 ? `+${abs}` : `−${abs}`;
});

const deltaHint = computed(() => {
  const delta = pace.value?.vsAvgDelta ?? 0;
  if (delta > 0) return "above usual";
  if (delta < 0) return "below usual";
  return "matches usual";
});

const deltaClass = computed(() => {
  const delta = pace.value?.vsAvgDelta ?? 0;
  if (delta > 0) return "pace-delta-bad";
  if (delta < 0) return "pace-delta-good";
  return "";
});

const displayScore = computed(() => {
  const avg = paceCompareAvg.value;
  const spend = displaySpend.value;
  if (!avg || !spend) return 50;
  return Math.round(Math.min(100, Math.max(0, 50 * (avg / spend))));
});

const displayScoreLabel = computed(() => {
  const score = displayScore.value;
  if (score >= 60) return "Under pace";
  if (score <= 40) return "Above pace";
  if (score >= 55) return "Slightly under pace";
  if (score <= 45) return "Slightly above pace";
  return "On pace";
});

const scoreClass = computed(() => {
  const score = displayScore.value;
  if (score >= 55) return "good";
  if (score <= 45) return "bad";
  return "warn";
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

function persistFixed() {
  savePaceIncludeFixed(includeFixed.value);
  emit("settings-change");
}

function persistAvgCycles() {
  savePaceAvgCycles(avgCycles.value);
  emit("settings-change");
}

watch(cycleStart, () => {
  if (document.activeElement?.id !== "pace-manual-input") {
    loadManualForCycle();
  }
});
</script>
