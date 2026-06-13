<template>
  <div class="pace-card">
    <header class="pace-header">
      <div>
        <h3 class="pace-card-title">
          Cycle pace · day {{ cycleInfo.dayIndex }} of {{ cycleInfo.cycleLength }}
        </h3>
        <p class="pace-card-sub">{{ formatCycleRange(cycleInfo.cycleStart, cycleInfo.cycleEnd) }}</p>
      </div>
      <div class="pace-progress-wrap">
        <div class="pace-progress-bar" role="progressbar" :aria-valuenow="cycleInfo.dayIndex" :aria-valuemax="cycleInfo.cycleLength">
          <div class="pace-progress-fill" :style="{ width: progressPct + '%' }" />
        </div>
        <span class="pace-progress-label">{{ progressPct }}% through cycle</span>
      </div>
    </header>

    <div class="pace-layout">
      <section class="pace-panel pace-panel-input">
        <label class="pace-manual-label" for="pace-manual-input">Current cycle spending (₪)</label>
        <input
          id="pace-manual-input"
          v-model="manualInput"
          class="input pace-manual-input"
          type="text"
          inputmode="decimal"
          placeholder="e.g. 1500"
          @blur="persistManual"
        />
        <p class="pace-manual-hint">
          <template v-if="pace && pace.statementSpend > 0 && pace.manualSpend !== null">
            From statements: {{ formatIls(pace.statementSpend) }} · using your entry
          </template>
          <template v-else-if="pace && pace.statementSpend > 0">
            From statements: {{ formatIls(pace.statementSpend) }}
          </template>
          <template v-else>
            This cycle isn't on your statements yet — enter your total from the bank app.
          </template>
        </p>
      </section>

      <section class="pace-panel pace-panel-settings">
        <p class="pace-panel-title">Settings</p>
        <label class="pace-setting-row">
          <input v-model="includeFixed" type="checkbox" @change="persistFixed" />
          Include monthly bills
        </label>
        <label class="pace-setting-row">
          <span>Average over</span>
          <select v-model.number="avgCycles" @change="persistAvgCycles">
            <option :value="3">Last 3 cycles</option>
            <option :value="6">Last 6 cycles</option>
            <option :value="12">Last 12 cycles</option>
            <option :value="0">All ({{ pace?.cyclesAvailable ?? "—" }})</option>
          </select>
        </label>
        <label class="pace-setting-row">
          <span>Cycle starts</span>
          <select v-model.number="cycleDay" @change="onCycleDayChange">
            <option v-for="d in cycleDays" :key="d" :value="d">{{ d }}{{ ordinal(d) }}</option>
          </select>
        </label>
      </section>

      <template v-if="pace">
        <section class="pace-panel pace-panel-metrics">
          <div class="pace-metrics">
            <div class="pace-metric">
              <div class="pace-stat-label">Spent so far</div>
              <div class="pace-stat-value">{{ formatIls(displaySpend) }}</div>
            </div>
            <div v-if="paceCompareAvg > 0" class="pace-metric">
              <div class="pace-stat-label">Usually by day {{ cycleInfo.dayIndex }}</div>
              <div class="pace-stat-value">{{ formatIls(paceCompareAvg) }}</div>
              <div class="pace-stat-meta">{{ avgCyclesLabel }}</div>
            </div>
            <div v-if="paceCompareAvg > 0 && displaySpend > 0" class="pace-metric">
              <div class="pace-stat-label">Vs usual</div>
              <div class="pace-stat-value" :class="deltaClass">{{ deltaLabel }}</div>
              <div class="pace-stat-meta">{{ deltaHint }}</div>
            </div>
            <div v-if="displaySpend > 0" class="pace-metric">
              <div class="pace-stat-label">Projected full cycle</div>
              <div class="pace-stat-value">{{ formatIls(projectedTotal) }}</div>
              <div v-if="paceCompareAvg > 0" class="pace-stat-meta">
                usual pace ~{{ formatIls(projectedAtUsualPace) }}
              </div>
            </div>
          </div>
          <div v-if="displaySpend > 0" class="pace-score-row">
            <span class="pace-score" :class="scoreClass">{{ displayScore }} · {{ displayScoreLabel }}</span>
          </div>
        </section>

        <section v-if="includeFixed && pace.fixedBreakdown.length" class="pace-panel">
          <div class="pace-panel-head">
            <p class="pace-panel-title">Usually bills by day {{ cycleInfo.dayIndex }}</p>
            <p class="pace-panel-hint">
              {{ formatIls(pace.historicalAvgFixedAtDay) }} total · configured charges land on the
              {{ cycleDay }}{{ ordinal(cycleDay) }}
            </p>
          </div>
          <div class="pace-breakdown-list">
            <div v-for="row in pace.fixedBreakdown" :key="row.label" class="pace-breakdown-row">
              <span class="pace-breakdown-label">
                {{ row.label }}
                <span v-if="row.configured" class="pace-tag">configured</span>
              </span>
              <span class="pace-breakdown-amount">
                {{ formatIls(row.amount) }}
                <span class="pace-breakdown-meta">in {{ row.cyclesWith }}/{{ pace.cyclesUsed }}</span>
              </span>
            </div>
          </div>
        </section>

        <section v-if="pace.variableBreakdown.length" class="pace-panel">
          <div class="pace-panel-head">
            <p class="pace-panel-title">Usually everyday by day {{ cycleInfo.dayIndex }}</p>
            <p class="pace-panel-hint">{{ formatIls(pace.historicalAvgVariableAtDay) }} total</p>
          </div>
          <div class="pace-breakdown-list">
            <div v-for="row in pace.variableBreakdown.slice(0, 8)" :key="row.label" class="pace-breakdown-row">
              <span class="pace-breakdown-label">{{ row.label }}</span>
              <span class="pace-breakdown-amount">
                {{ formatIls(row.amount) }}
                <span class="pace-breakdown-meta">in {{ row.cyclesWith }}/{{ pace.cyclesUsed }}</span>
              </span>
            </div>
          </div>
        </section>

        <section v-if="pace.recentCycles.length" class="pace-panel pace-panel-wide">
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
import type { Transaction } from "../types";
import { formatIls, roundMoney } from "../utils/format";
import {
  computePace,
  cycleStartForDate,
  getBillingCycle,
  getCycleRangeForStart,
  loadCycleDay,
  loadManualCycleSpend,
  loadPaceAvgCycles,
  loadPaceIncludeFixed,
  saveCycleDay,
  saveManualCycleSpend,
  savePaceAvgCycles,
  savePaceIncludeFixed,
} from "../utils/pace";

const props = defineProps<{
  transactions: Transaction[];
  latestBillingDate?: string | null;
}>();

const emit = defineEmits<{ "settings-change": [] }>();

const cycleDay = ref(loadCycleDay());
const includeFixed = ref(loadPaceIncludeFixed());
const avgCycles = ref(loadPaceAvgCycles());
const cycleDays = Array.from({ length: 28 }, (_, i) => i + 1);

const cycleInfo = computed(() => {
  const today = new Date();
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

const pace = computed(() =>
  computePace(props.transactions, {
    cycleDay: cycleDay.value,
    includeFixed: includeFixed.value,
    latestBillingDate: props.latestBillingDate ?? null,
    manualSpend: manualSpend.value,
    avgCycles: avgCycles.value,
  }),
);

const avgCyclesLabel = computed(() => {
  if (!pace.value) return "";
  const { cyclesUsed, cyclesAvailable, avgCycles: window } = pace.value;
  if (window === 0) return `${cyclesUsed} completed cycles`;
  if (cyclesAvailable > cyclesUsed) {
    return `last ${cyclesUsed} of ${cyclesAvailable} completed cycles`;
  }
  return `last ${cyclesUsed} completed cycles`;
});

const displaySpend = computed(() => {
  if (manualSpend.value !== null) return roundMoney(manualSpend.value);
  return pace.value?.currentSpend ?? 0;
});

const projectedTotal = computed(() => {
  const spend = displaySpend.value;
  const day = cycleInfo.value.dayIndex;
  const len = cycleInfo.value.cycleLength;
  if (!spend || !day) return 0;
  return roundMoney((spend / day) * len);
});

const paceCompareAvg = computed(() => {
  if (!pace.value) return 0;
  return includeFixed.value
    ? pace.value.historicalAvgAtDay
    : pace.value.historicalAvgVariableAtDay;
});

const projectedAtUsualPace = computed(() => {
  if (!pace.value) return 0;
  const avg = paceCompareAvg.value;
  const day = cycleInfo.value.dayIndex;
  const len = cycleInfo.value.cycleLength;
  if (!avg || !day) return 0;
  return roundMoney((avg / day) * len);
});

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

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

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

function onCycleDayChange() {
  saveCycleDay(cycleDay.value);
  loadManualForCycle();
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
