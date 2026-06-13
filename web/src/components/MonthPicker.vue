<template>
  <div class="pill-row">
    <button
      v-for="m in months"
      :key="m.key"
      type="button"
      class="pill"
      :class="{ active: modelValue === m.key, 'pill-current': m.inProgress }"
      @click="$emit('update:modelValue', m.key)"
    >
      {{ m.label }}<span v-if="m.inProgress" class="pill-now"> · now</span>
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

.pill-now {
  font-size: 0.82em;
  opacity: 0.9;
}
</style>
