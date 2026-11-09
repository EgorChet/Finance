<template>
  <div class="cg" role="radiogroup" :aria-label="ariaLabel">
    <button
      v-if="emptyLabel"
      type="button"
      role="radio"
      class="cg-tile"
      :class="{ 'cg-tile--on': !modelValue }"
      :aria-checked="!modelValue"
      @click="pick('')"
    >
      <span class="cg-icon" aria-hidden="true">✱</span>
      <span class="cg-name">{{ emptyLabel }}</span>
    </button>
    <button
      v-for="c in options"
      :key="c"
      type="button"
      role="radio"
      class="cg-tile"
      :class="{ 'cg-tile--on': modelValue === c }"
      :aria-checked="modelValue === c"
      @click="pick(c)"
    >
      <span class="cg-icon" aria-hidden="true">{{ categoryIcon(c) }}</span>
      <span class="cg-name">{{ shortName(c) }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { categoryIcon } from "@/features/spending/utils/categoryIcons";

withDefaults(
  defineProps<{
    modelValue: string;
    options: readonly string[];
    /** Adds a first tile that clears the value ("Any category"). */
    emptyLabel?: string;
    ariaLabel?: string;
  }>(),
  { emptyLabel: "", ariaLabel: "Category" },
);

const emit = defineEmits<{ "update:modelValue": [string]; pick: [string] }>();

const SHORT: Record<string, string> = {
  "Government & Institutions": "Government",
  "Leisure & Entertainment": "Leisure",
  "Beauty & Personal Care": "Beauty",
  "Electronics & computers": "Electronics",
  "Home & Furniture": "Furniture",
  "Health & Medical": "Health",
  Miscellaneous: "Misc",
  Uncategorized: "No category",
};

function shortName(c: string): string {
  return SHORT[c] ?? c;
}

function pick(c: string) {
  emit("update:modelValue", c);
  emit("pick", c);
}
</script>
