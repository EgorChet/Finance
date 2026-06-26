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

        <CategoryComparePanel :result="result" />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from "vue";
import CategoryComparePanel from "./CategoryComparePanel.vue";
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
