<template>
  <div class="month-select" :class="{ 'month-select--disabled': disabled }">
    <select
      class="input select-field month-select-month"
      :value="monthPart"
      :disabled="disabled"
      aria-label="Month"
      @change="onMonthChange"
    >
      <option v-for="m in monthOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
    </select>
    <select
      class="input select-field month-select-year"
      :value="yearPart"
      :disabled="disabled"
      aria-label="Year"
      @change="onYearChange"
    >
      <option v-for="y in yearOptions" :key="y" :value="y">{{ y }}</option>
    </select>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    disabled?: boolean;
    minYear?: number;
    maxYear?: number;
  }>(),
  {
    disabled: false,
    minYear: 2018,
    maxYear: 2035,
  },
);

const emit = defineEmits<{ "update:modelValue": [string] }>();

const MONTHS = [
  { value: "01", label: "Jan" },
  { value: "02", label: "Feb" },
  { value: "03", label: "Mar" },
  { value: "04", label: "Apr" },
  { value: "05", label: "May" },
  { value: "06", label: "Jun" },
  { value: "07", label: "Jul" },
  { value: "08", label: "Aug" },
  { value: "09", label: "Sep" },
  { value: "10", label: "Oct" },
  { value: "11", label: "Nov" },
  { value: "12", label: "Dec" },
];

const monthOptions = MONTHS;

const yearPart = computed(() => props.modelValue?.slice(0, 4) || String(new Date().getFullYear()));
const monthPart = computed(() => props.modelValue?.slice(5, 7) || "01");

const yearOptions = computed(() => {
  const years: number[] = [];
  for (let y = props.maxYear; y >= props.minYear; y -= 1) years.push(y);
  return years;
});

function emitValue(year: string, month: string) {
  emit("update:modelValue", `${year}-${month}`);
}

function onMonthChange(e: Event) {
  emitValue(yearPart.value, (e.target as HTMLSelectElement).value);
}

function onYearChange(e: Event) {
  emitValue((e.target as HTMLSelectElement).value, monthPart.value);
}
</script>
