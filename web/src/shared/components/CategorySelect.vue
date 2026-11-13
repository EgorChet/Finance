<template>
  <select
    class="input select-field"
    :value="modelValue"
    :disabled="disabled"
    :aria-label="t(ariaLabel)"
    @change="onChange"
  >
    <option v-if="allowEmpty" value="">{{ t(emptyLabel) }}</option>
    <option v-for="c in options" :key="c" :value="c">{{ catName(c) }}</option>
  </select>
</template>

<script setup lang="ts">
import { catName, t } from "@/shared/i18n";
withDefaults(
  defineProps<{
    modelValue: string;
    options: readonly string[];
    disabled?: boolean;
    allowEmpty?: boolean;
    emptyLabel?: string;
    ariaLabel?: string;
  }>(),
  {
    disabled: false,
    allowEmpty: false,
    emptyLabel: "Choose category",
    ariaLabel: "Category",
  },
);

const emit = defineEmits<{ "update:modelValue": [string] }>();

function onChange(e: Event) {
  emit("update:modelValue", (e.target as HTMLSelectElement).value);
}
</script>
