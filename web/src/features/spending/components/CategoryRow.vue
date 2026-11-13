<template>
  <div class="cat-row" :class="{ 'cat-row--open': open, 'cat-row--nested': nested }">
    <button
      :id="anchorId"
      type="button"
      class="cat-row-head"
      :aria-expanded="open"
      @click="emit('toggle')"
    >
      <CategoryIcon v-if="icon" :category="icon" />
      <span class="cat-row-text">
      <span class="cat-row-line">
        <span class="cat-row-name">{{ name }}</span>
        <span class="cat-row-amount">{{ formatIlsWhole(amount) }}</span>
      </span>
      <span class="cat-row-line cat-row-line--sub">
        <span v-if="compareLine" class="cat-row-compare" :class="`cat-row-compare--${tone}`">
          <span aria-hidden="true">{{ toneArrow }}</span> {{ compareLine }}
        </span>
        <span v-else class="cat-row-compare cat-row-compare--unknown">{{ countLabel }}</span>
        <span class="cat-row-pct">{{ pct }}%</span>
      </span>
      </span>
    </button>

    <div v-if="open" class="cat-row-body">
      <div v-if="result && result.usual != null" class="cat-row-bars">
        <div v-for="bar in bars" :key="bar.label" class="cat-row-bar" :class="{ 'cat-row-bar--current': bar.current }">
          <span class="cat-row-bar-label">{{ bar.label }}</span>
          <span class="cat-row-bar-track">
            <span :style="{ width: `${bar.width}%` }" />
          </span>
          <span class="cat-row-bar-value">{{ formatIlsWhole(bar.value) }}</span>
        </div>
      </div>
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import CategoryIcon from "@/shared/components/CategoryIcon.vue";
import { computed } from "vue";
import {
  categoryCompareLine,
  categoryCompareTone,
  type CategoryCompareResult,
} from "@/features/spending/utils/categoryCompare";
import { formatIlsWhole } from "@/shared/utils/format";

const props = withDefaults(
  defineProps<{
    name: string;
    amount: number;
    /** Share of the parent total, 0–100. */
    pct: number;
    color?: string;
    /** Category whose icon to show. */
    icon?: string;
    count?: number;
    open: boolean;
    nested?: boolean;
    result?: CategoryCompareResult | null;
    currentLabel?: string;
    lastLabel?: string;
    pointLabel?: string;
    anchorId?: string;
  }>(),
  { nested: false, result: null, currentLabel: "This cycle", lastLabel: "Last cycle", pointLabel: "" },
);

const emit = defineEmits<{ toggle: [] }>();

const tone = computed(() => categoryCompareTone(props.result));
const compareLine = computed(() => categoryCompareLine(props.result));
const toneArrow = computed(() => {
  if (tone.value === "high" || tone.value === "new") return "▲";
  if (tone.value === "low") return "▼";
  return "•";
});

const countLabel = computed(() =>
  props.count != null ? `${props.count} ${props.count === 1 ? "charge" : "charges"}` : "",
);

const bars = computed(() => {
  const r = props.result;
  if (!r || r.usual == null) return [];
  const suffix = props.pointLabel ? ` ${props.pointLabel}` : "";
  const rows = [
    { label: props.currentLabel, value: r.current, current: true },
    ...(r.last != null ? [{ label: `${props.lastLabel}${suffix}`, value: r.last, current: false }] : []),
    {
      label: `Usual${suffix}`,
      value: r.usual,
      current: false,
    },
  ];
  const max = Math.max(1, ...rows.map((b) => b.value));
  return rows.map((b) => ({ ...b, width: Math.round((b.value / max) * 100) }));
});
</script>
