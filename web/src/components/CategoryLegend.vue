<template>
  <div>
    <strong>Categories</strong>
    <p style="color: var(--text-muted); font-size: 0.85rem">Click a wedge or category below.</p>
    <button
      v-for="(item, idx) in items"
      :key="item.name"
      class="legend-btn"
      @click="$emit('select', item.name)"
    >
      <span class="swatch" :style="{ background: colors[idx % colors.length] }" />
      <span>{{ item.name }} · {{ formatIls(item.value) }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CategorySummary } from "../types";
import { CHART_COLORS, formatIls, roundMoney } from "../utils/format";
import { TOP_PIE_CATEGORIES } from "../categories";

const props = defineProps<{ categories: CategorySummary[] }>();
defineEmits<{ select: [string] }>();

const colors = CHART_COLORS;

const items = computed(() => {
  const sorted = [...props.categories].sort((a, b) => b.total - a.total);
  const top = sorted.slice(0, TOP_PIE_CATEGORIES);
  const rest = sorted.slice(TOP_PIE_CATEGORIES);
  const result = top.map((c) => ({ name: c.category_en, value: roundMoney(c.total) }));
  if (rest.length) {
    result.push({
      name: `Other (${rest.length} categories)`,
      value: roundMoney(rest.reduce((s, c) => s + c.total, 0)),
    });
  }
  return result;
});
</script>
