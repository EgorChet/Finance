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
      <span class="legend-btn-left">
        <span class="swatch" :style="{ background: colors[idx % colors.length] }" />
        <span class="legend-btn-name">{{ item.name }}</span>
      </span>
      <span class="legend-btn-amount">{{ formatIls(item.value) }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CategorySummary } from "../types";
import { CHART_COLORS, formatIls, roundMoney } from "../utils/format";
import { groupCategoriesForPie, otherBucketLabel } from "../categories";

const props = defineProps<{ categories: CategorySummary[] }>();
defineEmits<{ select: [string] }>();

const colors = CHART_COLORS;

const items = computed(() => {
  const { top, other } = groupCategoriesForPie(props.categories);
  const result = top.map((c) => ({ name: c.category_en, value: roundMoney(c.total) }));
  if (other.length) {
    result.push({
      name: otherBucketLabel(other.length),
      value: roundMoney(other.reduce((s, c) => s + c.total, 0)),
    });
  }
  return result;
});
</script>
