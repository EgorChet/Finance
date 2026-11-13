<template>
  <section class="pd">
    <div class="pd-hero">
      <div class="pd-hero-top">
        <span class="pd-hero-label">{{ tr(analysis.current.label) }}</span>
        <span class="pd-hero-range">{{ formatRange(analysis.current) }}</span>
      </div>
      <p class="pd-hero-value">{{ whole(analysis.currentTotal) }}</p>
      <p class="pd-hero-sub">
        {{ t("{amount} a month on average", { amount: whole(analysis.avgPerMonth) }) }} · {{ t("{n} {n|charge|charges}", { n: analysis.transactionCount }) }}
      </p>
      <p v-if="analysis.priorComparable && totalTrend" class="pd-chip" :class="`pd-chip--${totalTrend.cls}`">
        {{ totalTrend.text }}
      </p>
      <p v-else-if="!analysis.priorComparable" class="pd-hero-note">
        {{ t("No comparison — the statements don't reach far enough back.") }}
      </p>

      <div class="bh-stats">
        <div>
          <span>{{ t("Everyday") }}</span>
          <strong>{{ whole(analysis.everyday) }}</strong>
        </div>
        <div>
          <span>{{ t("Bills & fixed") }}</span>
          <strong>{{ whole(analysis.fixed) }}</strong>
        </div>
        <div>
          <span>{{ t("Months") }}</span>
          <strong>{{ analysis.monthsWithData }}</strong>
        </div>
      </div>
    </div>

    <MonthBars v-if="monthItems.length > 1" :items="monthItems" />

    <section class="pd-card">
      <h3 class="pd-card-title">{{ t("Where it went") }}</h3>
      <ul v-if="topCategories.length" class="pd-cats">
        <li v-for="row in topCategories" :key="row.category" class="pd-cat">
          <CategoryIcon :category="row.category" />
          <span class="pd-cat-body">
            <span class="pd-cat-top">
              <span class="pd-cat-name">{{ catName(row.category) }}</span>
              <b>{{ whole(row.current) }}</b>
            </span>
            <span class="pd-cat-track"><span :style="{ width: `${row.barPct}%` }" /></span>
            <span class="pd-cat-meta">
              <span>{{ t("{pct}% of spending", { pct: Math.round(row.sharePct) }) }}</span>
              <span v-if="row.trend" :class="`pd-trend--${row.trend.cls}`">{{ row.trend.text }}</span>
            </span>
          </span>
        </li>
      </ul>
      <p v-else class="bx-empty-line">{{ t("No spending in this period.") }}</p>
    </section>
  </section>
</template>

<script setup lang="ts">
import { catName, dateTag, isRu, t, tr } from "@/shared/i18n";
import CategoryIcon from "@/shared/components/CategoryIcon.vue";
import { computed } from "vue";
import { formatIlsWhole } from "@/shared/utils/format";
import MonthBars from "@/features/spending/components/MonthBars.vue";
import type { SpendingPeriodAnalysis } from "@/features/spending/utils/spendingPeriod";

const props = defineProps<{ analysis: SpendingPeriodAnalysis }>();

const whole = (n: number) => formatIlsWhole(n);

/** Changes under ₪50 or 5% are noise. */
function trend(delta: number, base: number): { text: string; cls: "up" | "down" } | null {
  if (Math.abs(delta) < 50 || (base > 0 && Math.abs(delta) / base < 0.05)) return null;
  const pct = base > 0 ? ` (${Math.round((Math.abs(delta) / base) * 100)}%)` : "";
  return delta > 0 ? { text: `▲ ${whole(delta)}${pct}`, cls: "up" } : { text: `▼ ${whole(-delta)}${pct}`, cls: "down" };
}

const totalTrend = computed(() => {
  const a = props.analysis;
  const tt = trend(a.totalDelta, a.priorTotal);
  const prior = isRu() ? tr(a.prior.label) : a.prior.label.toLowerCase();
  if (!tt) return { text: t("About the same as the {prior}", { prior }), cls: "flat" };
  return { text: t("{change} vs the {prior}", { change: tt.text, prior }), cls: tt.cls };
});

const topCategories = computed(() => {
  const rows = props.analysis.categories.filter((r) => r.current > 0).slice(0, 10);
  const max = Math.max(1, ...rows.map((r) => r.current));
  return rows.map((r) => ({
    ...r,
    barPct: Math.max(2, Math.round((r.current / max) * 100)),
    trend: props.analysis.priorComparable ? trend(r.delta, r.prior) : null,
  }));
});

const monthItems = computed(() =>
  props.analysis.monthlyTotals.map((m) => {
    const [y, mo] = m.key.split("-").map(Number);
    return { key: m.key, label: new Date(y, mo - 1, 1).toLocaleDateString(dateTag(), { month: "short" }), total: m.total };
  }),
);

function formatRange(window: { start: string; end: string }): string {
  const fmt = (iso: string) =>
    new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(dateTag(), { day: "numeric", month: "short", year: "numeric" });
  return `${fmt(window.start)} – ${fmt(window.end)}`;
}
</script>
