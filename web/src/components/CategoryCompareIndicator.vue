<template>
  <button
    type="button"
    class="category-compare-indicator"
    :class="`category-compare-indicator--${tone}`"
    :aria-label="ariaLabel"
    :title="title"
    @click="emit('click')"
  >
    <svg class="category-compare-indicator-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        v-if="tone === 'high'"
        d="M2.5 11.5 L6 7.5 L9 9.5 L13.5 4.5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        v-else-if="tone === 'low'"
        d="M2.5 4.5 L6 8.5 L9 6.5 L13.5 11.5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        v-else
        d="M3 8 H13"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
      />
    </svg>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CategoryCompareTone } from "../utils/categoryCompare";
import { formatIls } from "../utils/format";

const props = defineProps<{
  tone: CategoryCompareTone;
  delta?: number | null;
  label?: string;
}>();

const emit = defineEmits<{
  click: [];
}>();

const ariaLabel = computed(() => {
  const name = props.label ? `${props.label}: ` : "";
  if (props.tone === "high") return `${name}Spending above usual — open comparison`;
  if (props.tone === "low") return `${name}Spending below usual — open comparison`;
  if (props.tone === "neutral") return `${name}About usual — open comparison`;
  return `${name}Compare with usual spending`;
});

const title = computed(() => {
  if (props.delta == null) return "Compare with usual spending";
  if (Math.abs(props.delta) < 1) return "About usual at this point in the cycle";
  const abs = formatIls(Math.abs(props.delta));
  return props.delta > 0 ? `${abs} above usual` : `${abs} below usual`;
});
</script>
