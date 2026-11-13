<template>
  <div v-if="updateAvailable" class="app-update-banner" role="status">
    <span>{{ t("A new version of the app is available.") }}</span>
    <div class="app-update-banner-actions">
      <button type="button" class="btn btn-primary btn-sm" @click="refreshApp">{{ t("Refresh") }}</button>
      <button type="button" class="btn btn-ghost btn-sm" @click="dismissUpdate">{{ t("Not now") }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { t } from "@/shared/i18n";
import { useAppUpdate } from "@/shared/composables/useAppUpdate";

const { updateAvailable, refreshApp, dismissUpdate } = useAppUpdate();
</script>
