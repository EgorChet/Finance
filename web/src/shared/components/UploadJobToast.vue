<template>
  <div
    class="upload-job-toast"
    :class="`upload-job-toast--${state}`"
    role="status"
    aria-live="polite"
  >
    <div class="upload-job-toast-body">
      <span class="upload-job-toast-dot" aria-hidden="true" />
      <div class="upload-job-toast-copy">
        <p class="upload-job-toast-title">{{ title }}</p>
        <p class="upload-job-toast-message">{{ message }}</p>
      </div>
    </div>
    <div class="upload-job-toast-actions">
      <button
        v-if="state === 'error' && canRetry"
        type="button"
        class="btn btn-ghost upload-job-toast-btn"
        @click="$emit('retry')"
      >
        {{ t("Retry") }}
      </button>
      <button type="button" class="btn btn-ghost upload-job-toast-btn" @click="$emit('dismiss')">
        {{ state === 'syncing' ? t('Hide') : t('Dismiss') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { t } from "@/shared/i18n";
import { computed } from "vue";

const props = defineProps<{
  state: "syncing" | "done" | "error";
  message: string;
  canRetry?: boolean;
}>();

defineEmits<{
  dismiss: [];
  retry: [];
}>();

const title = computed(() => {
  if (props.state === "done") return t("Upload complete");
  if (props.state === "error") return t("Upload failed");
  return t("Uploading in background");
});
</script>
