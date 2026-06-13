<template>
  <v-chart class="chart" :option="option" autoresize @click="onClick" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { PieChart } from "echarts/charts";
import { TooltipComponent, LegendComponent } from "echarts/components";
import VChart from "vue-echarts";
import type { CategorySummary } from "../types";
import { CHART_COLORS, formatIls, roundMoney } from "../utils/format";
import { groupCategoriesForPie, otherBucketLabel } from "../categories";

use([CanvasRenderer, PieChart, TooltipComponent, LegendComponent]);

const props = defineProps<{
  categories: CategorySummary[];
  selected?: string;
}>();

const emit = defineEmits<{ select: [string] }>();

const pieData = computed(() => {
  const { top, other } = groupCategoriesForPie(props.categories);
  const items = top.map((c) => ({ name: c.category_en, value: roundMoney(c.total) }));
  if (other.length) {
    items.push({
      name: otherBucketLabel(other.length),
      value: roundMoney(other.reduce((s, c) => s + c.total, 0)),
    });
  }
  return items;
});

const option = computed(() => ({
  tooltip: {
    trigger: "item",
    formatter: (p: { name?: string; value?: number; percent?: number }) => {
      const v = typeof p.value === "number" ? p.value : 0;
      const pct = typeof p.percent === "number" ? p.percent.toFixed(1) : "0";
      return `${p.name}: ${formatIls(v)} (${pct}%)`;
    },
  },
  series: [
    {
      type: "pie",
      radius: ["32%", "70%"],
      data: pieData.value,
      selectedMode: "single",
      itemStyle: {
        color: (p: { dataIndex: number }) => CHART_COLORS[p.dataIndex % CHART_COLORS.length],
      },
      emphasis: {
        itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.3)" },
      },
    },
  ],
}));

function onClick(params: { name?: string }) {
  if (params.name) emit("select", params.name);
}
</script>

<style scoped>
.chart {
  height: 420px;
  width: 100%;
}
</style>
