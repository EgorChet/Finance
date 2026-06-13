<template>
  <div class="pill-row">
    <button
      v-for="m in months"
      :key="m.key"
      type="button"
      class="pill"
      :class="{ active: modelValue === m.key, 'pill-current': m.inProgress || m.isCurrentCycle, 'pill-pending': m.pendingStatement, 'pill-partial': m.partial && !m.inProgress && !m.pendingStatement && !m.isCurrentCycle }"
      @click="$emit('update:modelValue', m.key)"
    >
      {{ m.label }}<span v-if="m.inProgress" class="pill-now"> · now</span><span v-else-if="m.pendingStatement" class="pill-pending-tag"> · pending</span>
    </button>
    <button
      type="button"
      class="pill"
      :class="{ active: modelValue === null }"
      @click="$emit('update:modelValue', null)"
    >
      All months
    </button>
  </div>
</template>

<script setup lang="ts">
import type { MonthItem } from "../types";

defineProps<{ months: MonthItem[]; modelValue: string | null }>();
defineEmits<{ "update:modelValue": [string | null] }>();
</script>

<style scoped>
.pill-current {
  border-style: dashed;
}

.pill-pending {
  border-style: dotted;
}

.pill-partial {
  border-style: dashed;
  opacity: 0.92;
}

.pill-now,
.pill-pending-tag {
  font-size: 0.82em;
  opacity: 0.9;
}
</style>
