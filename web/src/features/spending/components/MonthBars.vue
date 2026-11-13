<template>
  <section class="pd-card">
    <h3 class="pd-card-title">{{ title }}</h3>
    <div class="pd-bars" role="img" :aria-label="`${title}, highest ${formatIlsWhole(max)}`">
      <div v-for="b in bars" :key="b.key" class="pd-bar" :class="{ 'pd-bar--max': b.max }">
        <span class="pd-bar-value">{{ b.short }}</span>
        <span class="pd-bar-fill" :style="{ height: `${b.pct}%` }" />
        <span class="pd-bar-label">{{ b.label }}</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { formatIlsWhole } from "@/shared/utils/format";

/** Simple month-by-month bars (the highest month in full colour). Shows the last 12. */
const props = withDefaults(
  defineProps<{ items: { key: string; label: string; total: number }[]; title?: string }>(),
  { title: "Month by month" },
);

const shown = computed(() => props.items.slice(-12));
const max = computed(() => Math.max(0, ...shown.value.map((m) => m.total)));

const bars = computed(() => {
  const top = Math.max(1, max.value);
  return shown.value.map((m) => ({
    key: m.key,
    label: m.label,
    short: m.total >= 1000 ? `${Math.round(m.total / 1000)}k` : String(Math.round(m.total)),
    pct: Math.max(3, Math.round((m.total / top) * 100)),
    max: m.total === top,
  }));
});
</script>
