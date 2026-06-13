<template>
  <div class="pie-chart-shell">
    <v-chart class="chart" :option="option" autoresize @click="onClick" />
  </div>
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

function chartTextColor(): string {
  if (typeof document === "undefined") return "#f9fafb";
  return getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#f9fafb";
}

function shortLabel(name: string): string {
  return name.length > 18 ? `${name.slice(0, 16)}…` : name;
}

const option = computed(() => {
  const textColor = chartTextColor();
  return {
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
      radius: ["38%", "72%"],
      center: ["50%", "50%"],
      data: pieData.value,
      selectedMode: "single",
      minShowLabelAngle: 6,
      avoidLabelOverlap: true,
      label: {
        show: true,
        position: "outside",
        alignTo: "edge",
        edgeDistance: "8%",
        formatter: (p: { name?: string; percent?: number }) => {
          const pct = typeof p.percent === "number" ? p.percent.toFixed(0) : "0";
          return `${shortLabel(p.name || "")}\n${pct}%`;
        },
        color: textColor,
        fontSize: 11,
        lineHeight: 14,
      },
      labelLine: {
        show: true,
        length: 10,
        length2: 8,
        smooth: true,
        lineStyle: { color: textColor, opacity: 0.4 },
      },
      labelLayout: {
        hideOverlap: true,
        moveOverlap: "shiftY",
      },
      itemStyle: {
        color: (p: { dataIndex: number }) => CHART_COLORS[p.dataIndex % CHART_COLORS.length],
      },
      emphasis: {
        label: { show: true, fontSize: 12, fontWeight: "bold" },
        itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.3)" },
      },
    },
  ],
};
});

function onClick(params: { name?: string }) {
  if (params.name) emit("select", params.name);
}
</script>

<style scoped>
.pie-chart-shell {
  width: 100%;
  height: 100%;
  min-height: 320px;
}

.chart {
  width: 100%;
  height: 100%;
}
</style>
