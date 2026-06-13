<template>
  <div v-if="pace" class="pace-card">
    <h3 class="pace-card-title">
      Cycle pace · day {{ pace.dayIndex }} of {{ pace.cycleLength }}
    </h3>
    <p class="pace-card-sub">
      {{ formatCycleRange(pace.cycleStart, pace.cycleEnd) }}
    </p>
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
    <p v-if="pace.dataStale" class="pace-warning">
      Based on uploaded statements — upload your latest bill for a complete picture of this cycle.
    </p>
    <div class="pace-settings">
      <label>
        <input v-model="includeFixed" type="checkbox" @change="persistFixed" />
        Include monthly bills
      </label>
      <label>
        Cycle starts
        <select v-model.number="cycleDay" @change="persistCycleDay">
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
  loadCycleDay,
  loadPaceIncludeFixed,
  saveCycleDay,
  savePaceIncludeFixed,
  type PaceResult,
} from "../utils/pace";

const props = defineProps<{
  transactions: Transaction[];
  latestBillingDate?: string | null;
}>();

const cycleDay = ref(loadCycleDay());
const includeFixed = ref(loadPaceIncludeFixed());
const cycleDays = Array.from({ length: 28 }, (_, i) => i + 1);

const pace = computed((): PaceResult | null =>
  computePace(props.transactions, {
    cycleDay: cycleDay.value,
    includeFixed: includeFixed.value,
    latestBillingDate: props.latestBillingDate ?? null,
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

function persistCycleDay() {
  saveCycleDay(cycleDay.value);
}

function persistFixed() {
  savePaceIncludeFixed(includeFixed.value);
}

watch(
  () => props.transactions,
  () => {
    /* recompute via computed */
  },
);
</script>
