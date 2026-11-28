<template>
  <div class="cp">
    <div class="cp-bar">
      <button type="button" class="cp-step" :aria-label="t('Older cycle')" :disabled="!older" @click="older && emit('update:modelValue', older.key)">‹</button>
      <button type="button" class="cp-current" :aria-haspopup="'dialog'" @click="open = true">
        <span class="cp-name">{{ currentLabel }}</span>
        <span v-if="currentTag" class="cp-tag">{{ currentTag }}</span>
        <span class="cp-caret" aria-hidden="true">▾</span>
      </button>
      <button type="button" class="cp-step" :aria-label="t('Newer cycle')" :disabled="!newer" @click="newer && emit('update:modelValue', newer.key)">›</button>
    </div>

    <BottomSheet :open="open" :title="t('Pick a cycle')" @close="open = false">
      <div class="cp-list">
        <button type="button" class="cp-row" :class="{ 'cp-row--on': modelValue === null }" @click="pick(null)">
          <span class="cp-row-name">{{ t("All cycles") }}</span>
        </button>
        <template v-for="g in groups" :key="g.year">
          <h4 class="cp-year">{{ g.year }}</h4>
          <button
            v-for="m in g.items"
            :key="m.key"
            type="button"
            class="cp-row"
            :class="{ 'cp-row--on': modelValue === m.key }"
            @click="pick(m.key)"
          >
            <span class="cp-row-name">{{ tr(m.label) }}</span>
            <span v-if="tagOf(m)" class="cp-tag">{{ tagOf(m) }}</span>
          </button>
        </template>
      </div>
    </BottomSheet>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { t, tr } from "@/shared/i18n";
import BottomSheet from "@/shared/components/BottomSheet.vue";
import type { MonthItem } from "@/shared/types";

/** `months` come newest first; null is the "all cycles" view. */
const props = defineProps<{ months: MonthItem[]; modelValue: string | null }>();
const emit = defineEmits<{ "update:modelValue": [string | null] }>();

const open = ref(false);

const index = computed(() => (props.modelValue === null ? -1 : props.months.findIndex((m) => m.key === props.modelValue)));
const older = computed(() => props.months[index.value + 1] ?? null);
const newer = computed(() => (index.value > 0 ? props.months[index.value - 1] : null));

function tagOf(m: MonthItem): string {
  if (m.inProgress || m.isCurrentCycle) return t("now");
  if (m.pendingStatement) return t("pending");
  return "";
}

const current = computed(() => (index.value >= 0 ? props.months[index.value] : null));
const currentLabel = computed(() => (current.value ? tr(current.value.label) : t("All cycles")));
const currentTag = computed(() => (current.value ? tagOf(current.value) : ""));

const groups = computed(() => {
  const out: { year: string; items: MonthItem[] }[] = [];
  for (const m of props.months) {
    const year = m.label.match(/\d{4}/)?.[0] ?? m.billing_date.slice(0, 4);
    const last = out[out.length - 1];
    if (last && last.year === year) last.items.push(m);
    else out.push({ year, items: [m] });
  }
  return out;
});

function pick(key: string | null) {
  open.value = false;
  emit("update:modelValue", key);
}
</script>

<style scoped>
.cp {
  margin: 0 0 1rem;
}
.cp-bar {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  gap: 0.4rem;
}
.cp-step,
.cp-current {
  min-height: 44px;
  border: 0;
  border-radius: 14px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.cp-step {
  font-size: 1.5rem;
  line-height: 1;
  color: var(--text-muted);
}
.cp-step:disabled {
  opacity: 0.35;
  cursor: default;
}
.cp-current {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-width: 0;
  padding: 0 0.9rem;
  font-weight: 650;
}
.cp-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cp-caret {
  color: var(--text-muted);
  font-size: 0.8rem;
}
.cp-tag {
  flex: none;
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
  font-size: 0.74rem;
  font-weight: 650;
}
.cp-list {
  display: grid;
}
.cp-year {
  margin: 0.9rem 0 0.2rem;
  font-size: 0.82rem;
  font-weight: 650;
  color: var(--text-muted);
}
.cp-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 48px;
  padding: 0 0.2rem;
  border: 0;
  border-radius: 0;
  border-top: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.cp-year + .cp-row {
  border-top: 0;
}
.cp-row--on .cp-row-name {
  color: var(--accent);
  font-weight: 700;
}
.cp-row--on::after {
  content: "✓";
  color: var(--accent);
}
.cp-row-name {
  flex: 1;
}
@media (min-width: 1024px) {
  .cp-bar {
    max-width: 420px;
  }
}
</style>
