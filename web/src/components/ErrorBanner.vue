<template>
  <div class="error-banner" role="alert">
    <div class="error-banner-body">
      <p class="error-banner-title">{{ title }}</p>
      <p class="error-banner-message">{{ message }}</p>
    </div>
    <button v-if="dismissible" type="button" class="btn btn-ghost error-banner-dismiss" @click="$emit('dismiss')">
      Dismiss
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title?: string;
  message: string;
  dismissible?: boolean;
}>();

defineEmits<{ dismiss: [] }>();
</script>
