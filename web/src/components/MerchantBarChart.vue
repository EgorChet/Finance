<template>
  <v-chart class="chart" :class="{ 'chart--compact': isCompact }" :option="option" autoresize />
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
import { canonicalMerchantEnglish } from "../utils/merchantVendor";
import { formatIls, roundMoney } from "../utils/format";
import { useCompactLayout } from "../composables/useCompactLayout";

use([CanvasRenderer, BarChart, GridComponent, TooltipComponent]);

const props = defineProps<{ transactions: Transaction[]; category: string }>();

const { isCompact } = useCompactLayout(768);

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
      name = canonicalMerchantEnglish(tx.merchant_en || tx.merchant_he, tx.merchant_he);
    }
    map.set(name, roundMoney((map.get(name) || 0) + tx.charge_amount));
  }
  return [...map.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => a.total - b.total)
    .slice(isCompact.value ? -8 : -12);
});

const option = computed(() => {
  const compact = isCompact.value;
  return {
    tooltip: {
      trigger: "axis",
      confine: true,
      formatter: (params: { value?: number; name?: string } | { value?: number; name?: string }[]) => {
        const p = Array.isArray(params) ? params[0] : params;
        const v = typeof p?.value === "number" ? p.value : 0;
        return `${p?.name ?? ""}: ${formatIls(v)}`;
      },
    },
    grid: {
      left: compact ? 4 : 8,
      right: compact ? 12 : 40,
      top: 8,
      bottom: 8,
      containLabel: true,
    },
    xAxis: {
      type: "value",
      axisLabel: { fontSize: compact ? 10 : 12 },
    },
    yAxis: {
      type: "category",
      data: merchants.value.map((m) => m.name),
      axisLabel: {
        width: compact ? 88 : 110,
        overflow: "truncate",
        fontSize: compact ? 10 : 12,
      },
    },
    series: [
      {
        type: "bar",
        data: merchants.value.map((m) => m.total),
        barMaxWidth: compact ? 18 : 24,
        itemStyle: { color: "#38bdf8" },
      },
    ],
  };
});
</script>

<style scoped>
.chart {
  height: 380px;
  width: 100%;
}

.chart--compact {
  height: min(52vw, 300px);
  min-height: 220px;
}
</style>
