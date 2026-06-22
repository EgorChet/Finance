<template>
  <button
    type="button"
    class="btn btn-icon"
    :class="{ 'btn-icon-danger': variant === 'danger' }"
    :aria-label="label"
    :disabled="disabled"
    @click="$emit('click')"
  >
    <span v-if="icon === 'close'" class="icon-button-glyph" aria-hidden="true">×</span>
    <svg v-else-if="icon === 'plus'" class="icon-button-svg" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
    </svg>
    <svg v-else-if="icon === 'trash'" class="icon-button-svg" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.5 5h9M6 5V3.5h4V5M5 5v7.5h6V5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.35"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path d="M6.25 7v4M8 7v4M9.75 7v4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
    </svg>
  </button>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    icon: "close" | "plus" | "trash";
    label: string;
    variant?: "default" | "danger";
    disabled?: boolean;
  }>(),
  { variant: "default", disabled: false },
);

defineEmits<{ click: [] }>();
</script>
