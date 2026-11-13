<template>
  <div class="cg" role="radiogroup" :aria-label="t(ariaLabel)">
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
      <span class="cg-name">{{ t(emptyLabel) }}</span>
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
      <CategoryIcon :category="c" size="sm" />
      <span class="cg-name">{{ shortName(c) }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { catName, isRu, t } from "@/shared/i18n";
import CategoryIcon from "@/shared/components/CategoryIcon.vue";

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

const SHORT_RU: Record<string, string> = {
  "Government & Institutions": "Госуслуги",
  "Leisure & Entertainment": "Досуг",
  "Beauty & Personal Care": "Красота",
  "Health & Medical": "Здоровье",
  "Eating out": "Кафе",
  "Bank fees": "Комиссии",
  "Home & Living": "Дом",
  Uncategorized: "Без категории",
};

function shortName(c: string): string {
  if (isRu()) return SHORT_RU[c] ?? catName(c);
  return SHORT[c] ?? c;
}

function pick(c: string) {
  emit("update:modelValue", c);
  emit("pick", c);
}
</script>
