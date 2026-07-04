<template>
  <button
    v-if="!decorative"
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
  <span
    v-else
    class="category-compare-indicator category-compare-indicator--decorative"
    :class="`category-compare-indicator--${tone}`"
    aria-hidden="true"
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
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  categoryCompareAriaLabel,
  categoryCompareTitle,
  type CategoryCompareTone,
} from "@/features/spending/utils/categoryCompare";

const props = withDefaults(
  defineProps<{
    tone: CategoryCompareTone;
    delta?: number | null;
    label?: string;
    decorative?: boolean;
  }>(),
  { decorative: false },
);

const emit = defineEmits<{
  click: [];
}>();

const ariaLabel = computed(() => categoryCompareAriaLabel(props.tone, props.label));
const title = computed(() => categoryCompareTitle(props.delta));
</script>
