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
        d="M2.5 4.75h11M5.25 4.75V3.5a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1v1.25M4.5 4.75v8a1.25 1.25 0 0 0 1.25 1.25h5.5A1.25 1.25 0 0 0 12.5 12.75v-8"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M6.5 7.5v4.25M8 7.5v4.25M9.5 7.5v4.25"
        stroke="currentColor"
        stroke-width="1.35"
        stroke-linecap="round"
      />
    </svg>
    <svg v-else-if="icon === 'upload'" class="icon-button-svg" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 10.25V3.5M5.25 6.25 8 3.5l2.75 2.75"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M3.25 10.25v1.5a1.25 1.25 0 0 0 1.25 1.25h7a1.25 1.25 0 0 0 1.25-1.25v-1.5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
    <svg v-else-if="icon === 'logout'" class="icon-button-svg" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M6.25 2.75h4.5a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1h-4.5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M9.25 8H2.75M6.75 5.5 9.25 8l-2.5 2.5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </button>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    icon: "close" | "plus" | "trash" | "upload" | "logout";
    label: string;
    variant?: "default" | "danger";
    disabled?: boolean;
  }>(),
  { variant: "default", disabled: false },
);

defineEmits<{ click: [] }>();
</script>
