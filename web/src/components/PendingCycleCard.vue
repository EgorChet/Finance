<template>
  <div class="pace-card pending-cycle-card">
    <h3 class="pace-card-title">{{ cycleLabel }} · awaiting statement</h3>
    <p class="pace-card-sub">{{ cycleRange }}</p>
    <p class="pending-cycle-note">
      This cycle is finished but the Visa statement isn't uploaded yet. Enter your final total from the bank app.
    </p>
    <label class="pace-manual-label" for="pending-cycle-input">Total spent this cycle (₪)</label>
    <input
      id="pending-cycle-input"
      v-model="manualInput"
      class="input pace-manual-input"
      type="text"
      inputmode="decimal"
      placeholder="e.g. 12500"
      @blur="persistManual"
    />
    <p v-if="savedTotal !== null" class="pace-manual-hint">
      Saved total: <strong>{{ formatIls(savedTotal) }}</strong> — charts below update when you upload the statement.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { billingCycleLabel, formatIls } from "../utils/format";
import {
  getCycleRangeForStart,
  loadManualCycleSpend,
  saveManualCycleSpend,
} from "../utils/pace";

const CYCLE_DAY = 10;

const props = defineProps<{
  cycleStart: string;
}>();

const emit = defineEmits<{ "settings-change": [] }>();

const manualInput = ref("");

function loadManual() {
  const saved = loadManualCycleSpend(props.cycleStart);
  manualInput.value = saved !== null ? String(saved) : "";
}

loadManual();

const savedTotal = computed((): number | null => {
  const raw = String(manualInput.value ?? "").trim().replace(/,/g, "");
  if (!raw) return null;
  const n = parseFloat(raw);
  if (Number.isNaN(n) || n < 0) return null;
  return n;
});

const cycleLabel = computed(() => billingCycleLabel(props.cycleStart));

const cycleRange = computed(() => {
  const { start, end } = getCycleRangeForStart(props.cycleStart, CYCLE_DAY);
  const fmt = (iso: string) =>
    new Date(iso + "T12:00:00").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  return `${fmt(start)} – ${fmt(end)}`;
});

function persistManual() {
  saveManualCycleSpend(props.cycleStart, savedTotal.value);
  emit("settings-change");
}

watch(
  () => props.cycleStart,
  () => {
    if (document.activeElement?.id !== "pending-cycle-input") loadManual();
  },
);
</script>
