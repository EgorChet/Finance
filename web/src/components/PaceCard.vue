<template>
  <div v-if="pace" class="pace-card">
    <h3 class="pace-card-title">
      Cycle pace · day {{ pace.dayIndex }} of {{ pace.cycleLength }}
    </h3>
    <p class="pace-card-sub">
      {{ formatCycleRange(pace.cycleStart, pace.cycleEnd) }}
    </p>

    <div class="pace-manual">
      <label class="pace-manual-label" for="pace-manual-input">Current cycle spending (₪)</label>
      <input
        id="pace-manual-input"
        v-model="manualInput"
        class="input pace-manual-input"
        type="number"
        min="0"
        step="1"
        inputmode="decimal"
        placeholder="e.g. 1500"
        @change="persistManual"
        @blur="persistManual"
      />
      <p class="pace-manual-hint">
        <template v-if="pace.statementSpend > 0 && pace.manualSpend !== null">
          From statements: {{ formatIls(pace.statementSpend) }} · using your entry above
        </template>
        <template v-else-if="pace.statementSpend > 0">
          From statements: {{ formatIls(pace.statementSpend) }}
        </template>
        <template v-else>
          Statements don't include this cycle yet — enter your total so far (check the bank app).
        </template>
      </p>
    </div>

    <div class="pace-stats">
      <div>
        <div class="pace-stat-label">Spent so far</div>
        <div class="pace-stat-value">{{ formatIls(pace.currentSpend) }}</div>
      </div>
      <div v-if="pace.historicalAvgAtDay > 0">
        <div class="pace-stat-label">Usually by now</div>
        <div class="pace-stat-value">{{ formatIls(pace.historicalAvgAtDay) }}</div>
        <div class="pace-stat-label">avg of {{ pace.cyclesUsed }} cycles</div>
      </div>
      <div>
        <div class="pace-stat-label">Projected</div>
        <div class="pace-stat-value">{{ formatIls(pace.projectedTotal) }}</div>
      </div>
    </div>
    <span class="pace-score" :class="scoreClass">{{ pace.score }} · {{ pace.scoreLabel }}</span>
    <p v-if="pace.dataStale && pace.manualSpend === null" class="pace-warning">
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
import { formatIls } from "../utils/format";
import {
  computePace,
  cycleStartForDate,
  loadCycleDay,
  loadManualCycleSpend,
  loadPaceIncludeFixed,
  saveCycleDay,
  saveManualCycleSpend,
  savePaceIncludeFixed,
  type PaceResult,
} from "../utils/pace";

const props = defineProps<{
  transactions: Transaction[];
  latestBillingDate?: string | null;
}>();

const emit = defineEmits<{ "settings-change": [] }>();

const cycleDay = ref(loadCycleDay());
const includeFixed = ref(loadPaceIncludeFixed());
const cycleDays = Array.from({ length: 28 }, (_, i) => i + 1);

const cycleStart = computed(() => {
  const today = new Date();
  const norm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return cycleStartForDate(norm, cycleDay.value);
});

const manualInput = ref("");

function loadManualForCycle() {
  const saved = loadManualCycleSpend(cycleStart.value);
  manualInput.value = saved !== null ? String(saved) : "";
}

loadManualForCycle();

const manualSpend = computed((): number | null => {
  const raw = manualInput.value.trim();
  if (!raw) return null;
  const n = parseFloat(raw);
  if (Number.isNaN(n) || n < 0) return null;
  return n;
});

const pace = computed((): PaceResult | null =>
  computePace(props.transactions, {
    cycleDay: cycleDay.value,
    includeFixed: includeFixed.value,
    latestBillingDate: props.latestBillingDate ?? null,
    manualSpend: manualSpend.value,
  }),
);

const scoreClass = computed(() => {
  if (!pace.value) return "";
  if (pace.value.score >= 55) return "good";
  if (pace.value.score <= 45) return "bad";
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
  const n = manualSpend.value;
  saveManualCycleSpend(cycleStart.value, n);
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

watch(cycleStart, loadManualForCycle);
</script>
