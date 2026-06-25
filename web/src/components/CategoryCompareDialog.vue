<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="confirm-overlay everyday-breakdown-overlay"
      @click.self="emit('close')"
    >
      <div
        class="everyday-breakdown-dialog category-compare-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
      >
        <header class="everyday-breakdown-header">
          <div>
            <h3 :id="titleId" class="everyday-breakdown-title">{{ result.label }}</h3>
            <p class="everyday-breakdown-meta">{{ formatIls(result.current) }}</p>
            <p class="everyday-breakdown-hint">
              Day {{ result.dayIndex }} of {{ result.cycleLength }} —
              compared with your last {{ result.cyclesUsed || 3 }}-cycle average at this point.
            </p>
          </div>
          <button
            ref="closeBtn"
            type="button"
            class="btn everyday-breakdown-close"
            aria-label="Close category comparison"
            @click="emit('close')"
          >
            Close
          </button>
        </header>

        <div class="category-compare-body">
          <div v-if="result.usual != null" class="pace-simple-table-wrap">
            <table class="pace-simple-table">
              <tbody>
                <tr class="pace-simple-table-group">
                  <td colspan="2">So far this cycle</td>
                </tr>
                <tr>
                  <td>This cycle</td>
                  <td>{{ formatIls(result.current) }}</td>
                </tr>
                <tr>
                  <td>Usual at day {{ result.dayIndex }}</td>
                  <td>{{ formatIls(result.usual) }}</td>
                </tr>
                <tr class="pace-simple-table-gap" :class="deltaClass">
                  <td>Difference</td>
                  <td>{{ formatGap(result.delta ?? 0) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="category-compare-empty">
            Upload more past statements to see how this category usually looks by day
            {{ result.dayIndex }}.
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import type { CategoryCompareResult } from "../utils/categoryCompare";
import { formatIls } from "../utils/format";

const props = defineProps<{
  open: boolean;
  result: CategoryCompareResult;
}>();

const emit = defineEmits<{
  close: [];
}>();

const closeBtn = ref<HTMLButtonElement | null>(null);
const titleId = `category-compare-${Math.random().toString(36).slice(2, 9)}`;

const deltaClass = computed(() => {
  const delta = props.result.delta ?? 0;
  if (delta > 0) return "pace-delta-bad";
  if (delta < 0) return "pace-delta-good";
  return "";
});

function formatGap(delta: number): string {
  if (Math.abs(delta) < 1) return "Same";
  const abs = formatIls(Math.abs(delta));
  return delta > 0 ? `+${abs}` : `−${abs}`;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}

watch(
  () => props.open,
  (isOpen) => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    if (isOpen) {
      document.addEventListener("keydown", onKeydown);
      void nextTick(() => closeBtn.value?.focus());
    } else {
      document.removeEventListener("keydown", onKeydown);
    }
  },
);

onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
  if (props.open) document.body.style.overflow = "";
});
</script>
