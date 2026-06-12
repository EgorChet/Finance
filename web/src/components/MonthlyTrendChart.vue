<template>
  <v-chart class="chart" :option="option" autoresize />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import VChart from "vue-echarts";
import { formatIls, roundMoney } from "../utils/format";

use([CanvasRenderer, BarChart, GridComponent, TooltipComponent]);

const props = defineProps<{
  summary: { month: string; total: number }[];
}>();

const option = computed(() => ({
  tooltip: {
    trigger: "axis",
    formatter: (params: { value?: number; name?: string } | { value?: number; name?: string }[]) => {
      const p = Array.isArray(params) ? params[0] : params;
      const v = typeof p?.value === "number" ? p.value : 0;
      return `${p?.name ?? ""}: ${formatIls(v)}`;
    },
  },
  grid: { left: 50, right: 20, top: 20, bottom: 40 },
  xAxis: { type: "category", data: props.summary.map((s) => s.month) },
  yAxis: { type: "value" },
  series: [
    {
      type: "bar",
      data: props.summary.map((s) => roundMoney(s.total)),
      itemStyle: { color: "#38bdf8" },
    },
  ],
}));
</script>

<style scoped>
.chart {
  height: 280px;
  width: 100%;
}
</style>
