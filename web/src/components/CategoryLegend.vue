<template>
  <div class="category-legend">
    <div class="category-legend-header">
      <strong>Categories</strong>
      <span class="category-legend-count">{{ items.length }}</span>
    </div>
    <p class="category-legend-hint">Tap a row to drill down{{ isCompact ? "" : ", or pick a slice in the chart" }}.</p>
    <div class="category-legend-list">
      <button
        v-for="(item, idx) in items"
        :key="item.name"
        type="button"
        class="legend-btn"
        @click="$emit('select', item.name)"
      >
        <span class="legend-btn-left">
          <span class="swatch" :style="{ background: colors[idx % colors.length] }" />
          <span class="legend-btn-name">{{ item.name }}</span>
        </span>
        <span class="legend-btn-right">
          <span class="legend-btn-pct">{{ item.pct }}%</span>
          <span class="legend-btn-amount">{{ formatIls(item.value) }}</span>
        </span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CategorySummary } from "../types";
import { CHART_COLORS, formatIls, roundMoney } from "../utils/format";
import { groupCategoriesForPie, otherBucketLabel } from "../categories";
import { useCompactLayout } from "../composables/useCompactLayout";

const props = defineProps<{ categories: CategorySummary[] }>();
defineEmits<{ select: [string] }>();

const { isCompact } = useCompactLayout(768);
const colors = CHART_COLORS;

const items = computed(() => {
  const { top, other } = groupCategoriesForPie(props.categories);
  const grand = props.categories.reduce((s, c) => s + c.total, 0);
  const pct = (total: number) => (grand ? Math.round((total / grand) * 100) : 0);

  const result = top.map((c) => ({
    name: c.category_en,
    value: roundMoney(c.total),
    pct: pct(c.total),
  }));
  if (other.length) {
    const otherTotal = roundMoney(other.reduce((s, c) => s + c.total, 0));
    result.push({
      name: otherBucketLabel(other.length),
      value: otherTotal,
      pct: pct(otherTotal),
    });
  }
  return result;
});
</script>
