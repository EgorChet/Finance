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
import type { Transaction } from "../types";
import { subscriptionVendor } from "../utils/subscriptions";
import { formatIls, roundMoney } from "../utils/format";

use([CanvasRenderer, BarChart, GridComponent, TooltipComponent]);

const props = defineProps<{ transactions: Transaction[]; category: string }>();

const groupByCategory = computed(() => props.category.startsWith("Other"));
const groupSubscriptions = computed(() => props.category === "Subscriptions");

const merchants = computed(() => {
  const map = new Map<string, number>();
  for (const tx of props.transactions) {
    if (tx.category_en !== props.category && !props.category.startsWith("Other")) continue;
    let name: string;
    if (groupByCategory.value) {
      name = tx.category_en || "Uncategorized";
    } else if (groupSubscriptions.value) {
      name = subscriptionVendor(tx.merchant_en || tx.merchant_he);
    } else {
      name = tx.merchant_en || tx.merchant_he;
    }
    map.set(name, roundMoney((map.get(name) || 0) + tx.charge_amount));
  }
  return [...map.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => a.total - b.total)
    .slice(-12);
});

const option = computed(() => ({
  tooltip: {
    trigger: "axis",
    formatter: (params: { value?: number; name?: string } | { value?: number; name?: string }[]) => {
      const p = Array.isArray(params) ? params[0] : params;
      const v = typeof p?.value === "number" ? p.value : 0;
      return `${p?.name ?? ""}: ${formatIls(v)}`;
    },
  },
  grid: { left: 120, right: 40, top: 10, bottom: 10 },
  xAxis: { type: "value" },
  yAxis: {
    type: "category",
    data: merchants.value.map((m) => m.name),
    axisLabel: { width: 110, overflow: "truncate" },
  },
  series: [
    {
      type: "bar",
      data: merchants.value.map((m) => m.total),
      itemStyle: { color: "#38bdf8" },
    },
  ],
}));
</script>

<style scoped>
.chart {
  height: 380px;
  width: 100%;
}
</style>
