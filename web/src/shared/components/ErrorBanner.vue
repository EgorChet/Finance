<template>
  <div class="error-banner" role="alert">
    <div class="error-banner-body">
      <p class="error-banner-title">{{ tr(title) }}</p>
      <p class="error-banner-message">{{ tr(message) }}</p>
    </div>
    <button v-if="dismissible" type="button" class="btn btn-ghost error-banner-dismiss" @click="$emit('dismiss')">
      {{ t("Dismiss") }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { t, tr } from "@/shared/i18n";
defineProps<{
  title?: string;
  message: string;
  dismissible?: boolean;
}>();

defineEmits<{ dismiss: [] }>();
</script>
