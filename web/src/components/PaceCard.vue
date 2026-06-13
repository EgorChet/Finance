<template>
  <div class="pace-card">
    <h3 class="pace-card-title">
      Cycle pace · day {{ cycleInfo.dayIndex }} of {{ cycleInfo.cycleLength }}
    </h3>
    <p class="pace-card-sub">
      {{ formatCycleRange(cycleInfo.cycleStart, cycleInfo.cycleEnd) }}
    </p>

    <div class="pace-manual">
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
          From statements: {{ formatIls(pace.statementSpend) }} · using your entry above
        </template>
        <template v-else-if="pace && pace.statementSpend > 0">
          From statements: {{ formatIls(pace.statementSpend) }}
        </template>
        <template v-else>
          Statements don't include this cycle yet — enter your total so far (check the bank app).
        </template>
      </p>
    </div>

    <template v-if="pace">
      <div class="pace-stats">
        <div>
          <div class="pace-stat-label">Spent so far</div>
          <div class="pace-stat-value">{{ formatIls(displaySpend) }}</div>
        </div>
        <div v-if="pace.historicalAvgAtDay > 0">
          <div class="pace-stat-label">Usually by now</div>
          <div class="pace-stat-value">{{ formatIls(pace.historicalAvgAtDay) }}</div>
          <div class="pace-stat-label">avg of {{ pace.cyclesUsed }} cycles</div>
        </div>
        <div v-if="displaySpend > 0">
          <div class="pace-stat-label">Projected</div>
          <div class="pace-stat-value">{{ formatIls(projectedTotal) }}</div>
        </div>
      </div>
      <span v-if="displaySpend > 0" class="pace-score" :class="scoreClass">
        {{ displayScore }} · {{ displayScoreLabel }}
      </span>
    </template>
    <p v-if="pace?.dataStale && !manualSpend" class="pace-warning">
      Upload your latest bill or enter current spending above — this cycle isn't on your statements yet.
    </p>
    <div class="pace-settings">
      <label>
        <input v-model="includeFixed" type="checkbox" @change="persistFixed" />
        Include monthly bills
      </label>
      <label>
        Cycle starts
        <select v-model.number="cycleDay" @change="onCycleDayChange">
          <option v-for="d in cycleDays" :key="d" :value="d">{{ d }}{{ ordinal(d) }}</option>
        </select>
      </label>
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
  loadPaceIncludeFixed,
  saveCycleDay,
  saveManualCycleSpend,
  savePaceIncludeFixed,
} from "../utils/pace";

const props = defineProps<{
  transactions: Transaction[];
  latestBillingDate?: string | null;
}>();

const emit = defineEmits<{ "settings-change": [] }>();

const cycleDay = ref(loadCycleDay());
const includeFixed = ref(loadPaceIncludeFixed());
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
  }),
);

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

const displayScore = computed(() => {
  const avg = pace.value?.historicalAvgAtDay ?? 0;
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

watch(cycleStart, () => {
  if (document.activeElement?.id !== "pace-manual-input") {
    loadManualForCycle();
  }
});
</script>
