<template>
  <div class="pill-row">
    <button
      v-for="m in months"
      :key="m.key"
      class="pill"
      :class="{ active: modelValue === m.key }"
      @click="$emit('update:modelValue', m.key)"
    >
      {{ m.label }}
    </button>
    <button class="pill" :class="{ active: modelValue === null }" @click="$emit('update:modelValue', null)">
      All months
    </button>
  </div>
</template>

<script setup lang="ts">
import type { MonthItem } from "../types";

defineProps<{ months: MonthItem[]; modelValue: string | null }>();
defineEmits<{ "update:modelValue": [string | null] }>();
</script>
