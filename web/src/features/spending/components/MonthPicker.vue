<template>
  <div class="month-picker">
    <div class="pill-row month-picker__pills" :class="{ 'month-picker__pills--wiggle': wiggleKey }">
      <div
        v-for="m in months"
        :key="m.key"
        class="month-picker__pill-wrap"
        :class="{ 'month-picker__pill-wrap--wiggle': wiggleKey === m.key }"
      >
        <button
          v-if="wiggleKey === m.key"
          type="button"
          class="month-picker__delete-badge"
          aria-label="Delete statement"
          @click.stop="onDeleteBadge(m)"
        >
          ×
        </button>
        <button
          type="button"
          class="pill"
          :class="{
            active: modelValue === m.key,
            'pill-current': m.inProgress || m.isCurrentCycle,
            'pill-pending': m.pendingStatement,
            'pill-partial': m.partial && !m.inProgress && !m.pendingStatement && !m.isCurrentCycle,
          }"
          @click="onPillClick(m)"
          @pointerdown="onHoldStart(m, $event)"
          @pointerup="onHoldEnd"
          @pointercancel="onHoldEnd"
          @pointerleave="onHoldEnd"
          @contextmenu.prevent
        >
          {{ m.label }}<span v-if="m.inProgress" class="pill-now"> · now</span><span v-else-if="m.pendingStatement" class="pill-pending-tag"> · pending</span>
        </button>
      </div>
      <button
        v-if="!omitAllMonths"
        type="button"
        class="pill"
        :class="{ active: modelValue === null }"
        @click="onAllMonthsClick"
      >
        All months
      </button>
    </div>
    <p v-if="wiggleKey" class="month-picker__hint">Tap × to delete this month's statement</p>
    <p v-else-if="allowDelete" class="month-picker__hint month-picker__hint--subtle">Hold a month for 2s to delete</p>
  </div>
</template>

<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import type { MonthItem } from "@/shared/types";
import { isCycleMonthKey } from "@/features/spending/utils/pace";

const HOLD_MS = 2000;

const props = withDefaults(
  defineProps<{
    months: MonthItem[];
    modelValue: string | null;
    omitAllMonths?: boolean;
    allowDelete?: boolean;
  }>(),
  { omitAllMonths: false, allowDelete: false },
);

const emit = defineEmits<{
  "update:modelValue": [string | null];
  deleteMonth: [string];
}>();

const wiggleKey = ref<string | null>(null);
let holdTimer: ReturnType<typeof setTimeout> | null = null;
let holdTriggered = false;

function isDeletable(m: MonthItem): boolean {
  return props.allowDelete && !isCycleMonthKey(m.key);
}

function clearHoldTimer() {
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
}

function onHoldStart(m: MonthItem, event: PointerEvent) {
  if (!isDeletable(m)) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  holdTriggered = false;
  clearHoldTimer();
  holdTimer = setTimeout(() => {
    holdTriggered = true;
    wiggleKey.value = m.key;
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(12);
    }
  }, HOLD_MS);
}

function onHoldEnd() {
  clearHoldTimer();
}

function onPillClick(m: MonthItem) {
  if (holdTriggered) {
    holdTriggered = false;
    return;
  }
  if (wiggleKey.value) {
    if (wiggleKey.value !== m.key) {
      wiggleKey.value = null;
    }
    return;
  }
  emit("update:modelValue", m.key);
}

function onAllMonthsClick() {
  wiggleKey.value = null;
  emit("update:modelValue", null);
}

function onDeleteBadge(m: MonthItem) {
  emit("deleteMonth", m.key);
  wiggleKey.value = null;
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!wiggleKey.value) return;
  const target = event.target;
  if (target instanceof Element && target.closest(".month-picker__pill-wrap--wiggle")) return;
  wiggleKey.value = null;
}

watch(wiggleKey, (key) => {
  if (key) {
    document.addEventListener("pointerdown", onDocumentPointerDown, true);
  } else {
    document.removeEventListener("pointerdown", onDocumentPointerDown, true);
  }
});

onUnmounted(() => {
  clearHoldTimer();
  document.removeEventListener("pointerdown", onDocumentPointerDown, true);
});
</script>

<style scoped>
.month-picker__pills--wiggle {
  padding-top: 0.35rem;
}

.month-picker__pill-wrap {
  position: relative;
  flex-shrink: 0;
}

.month-picker__pill-wrap--wiggle .pill {
  animation: month-pill-wiggle 0.32s ease-in-out infinite;
}

@keyframes month-pill-wiggle {
  0%,
  100% {
    transform: rotate(-1.4deg);
  }
  50% {
    transform: rotate(1.4deg);
  }
}

.month-picker__delete-badge {
  position: absolute;
  top: -0.35rem;
  left: -0.2rem;
  z-index: 2;
  width: 1.35rem;
  height: 1.35rem;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--text-muted) 82%, #000);
  color: #fff;
  font-size: 1rem;
  line-height: 1;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.28);
}

.month-picker__delete-badge:hover {
  background: var(--danger);
}

.month-picker__hint {
  margin: -0.55rem 0 1rem;
  font-size: 0.78rem;
  color: var(--danger);
  line-height: 1.35;
}

.month-picker__hint--subtle {
  color: var(--text-muted);
}

.pill-current {
  border-style: dashed;
}

.pill-pending {
  border-style: dotted;
}

.pill-partial {
  border-style: dashed;
  opacity: 0.92;
}

.pill-now,
.pill-pending-tag {
  font-size: 0.82em;
  opacity: 0.9;
}
</style>
