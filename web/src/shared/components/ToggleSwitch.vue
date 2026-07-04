<template>
  <span class="toggle-switch" :class="{ 'toggle-switch--disabled': disabled }">
    <input
      type="checkbox"
      class="toggle-switch-input"
      :checked="modelValue"
      :disabled="disabled"
      @change="onChange"
    />
    <span class="toggle-switch-track" aria-hidden="true" />
  </span>
</template>

<script setup lang="ts">
defineProps<{ modelValue: boolean; disabled?: boolean }>();

const emit = defineEmits<{ "update:modelValue": [boolean] }>();

function onChange(e: Event) {
  emit("update:modelValue", (e.target as HTMLInputElement).checked);
}
</script>
