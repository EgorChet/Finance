<template>
  <div class="pie-chart-shell" :class="{ 'pie-chart-shell--compact': isCompact }">
    <p v-if="isCompact" class="pie-chart-mobile-hint">Tap a slice for amount · full list below</p>
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
import { useCompactLayout } from "../composables/useCompactLayout";

use([CanvasRenderer, PieChart, TooltipComponent, LegendComponent]);

const props = defineProps<{
  categories: CategorySummary[];
  selected?: string;
}>();

const emit = defineEmits<{ select: [string] }>();

const { isCompact } = useCompactLayout(768);

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

const pieTotal = computed(() => roundMoney(pieData.value.reduce((s, d) => s + d.value, 0)));

function chartTextColor(): string {
  if (typeof document === "undefined") return "#f9fafb";
  return getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#f9fafb";
}

function chartMutedColor(): string {
  if (typeof document === "undefined") return "#9ca3af";
  return getComputedStyle(document.documentElement).getPropertyValue("--text-muted").trim() || "#9ca3af";
}

function shortLabel(name: string, maxLen: number): string {
  return name.length > maxLen ? `${name.slice(0, maxLen - 1)}…` : name;
}

const MIN_LABEL_PERCENT = 4;

const option = computed(() => {
  const textColor = chartTextColor();
  const muted = chartMutedColor();
  const compact = isCompact.value;

  return {
    tooltip: {
      trigger: "item",
      confine: true,
      formatter: (p: { name?: string; value?: number; percent?: number }) => {
        const v = typeof p.value === "number" ? p.value : 0;
        const pct = typeof p.percent === "number" ? p.percent.toFixed(1) : "0";
        return `${p.name}: ${formatIls(v)} (${pct}%)`;
      },
    },
    graphic: compact
      ? [
          {
            type: "text",
            left: "center",
            top: "center",
            style: {
              text: `${formatIls(pieTotal.value)}\n${pieData.value.length} categories`,
              fill: textColor,
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 18,
              align: "center",
            },
          },
        ]
      : undefined,
    series: [
      {
        type: "pie",
        radius: compact ? ["46%", "72%"] : ["40%", "76%"],
        center: ["50%", compact ? "52%" : "50%"],
        data: pieData.value,
        selectedMode: "single",
        minShowLabelAngle: compact ? 360 : 14,
        avoidLabelOverlap: !compact,
        label: {
          show: !compact,
          position: "outside",
          alignTo: "edge",
          edgeDistance: "12%",
          formatter: (p: { name?: string; percent?: number }) => {
            const percent = p.percent ?? 0;
            if (percent < MIN_LABEL_PERCENT) return "";
            const pct = percent.toFixed(0);
            return `${shortLabel(p.name || "", 24)}\n${pct}%`;
          },
          color: textColor,
          fontSize: 11,
          lineHeight: 14,
        },
        labelLine: {
          show: !compact,
          length: 12,
          length2: 10,
          smooth: true,
          lineStyle: { color: muted, opacity: 0.35 },
        },
        labelLayout: compact
          ? undefined
          : {
              hideOverlap: true,
              moveOverlap: "shiftY",
            },
        itemStyle: {
          color: (p: { dataIndex: number }) => CHART_COLORS[p.dataIndex % CHART_COLORS.length],
        },
        emphasis: {
          scale: true,
          scaleSize: compact ? 6 : 8,
          label: {
            show: !compact,
            fontSize: 12,
            fontWeight: "bold",
          },
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

.pie-chart-shell--compact {
  min-height: 240px;
}

.pie-chart-mobile-hint {
  display: none;
  margin: 0 0 0.5rem;
  font-size: 0.82rem;
  color: var(--text-muted);
  text-align: center;
}

.pie-chart-shell--compact .pie-chart-mobile-hint {
  display: block;
}

.chart {
  width: 100%;
  height: 100%;
  min-height: inherit;
}
</style>
