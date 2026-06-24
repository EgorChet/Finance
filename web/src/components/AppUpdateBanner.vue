<template>
  <div v-if="updateAvailable" class="app-update-banner" role="status">
    <span>A new version of the app is available.</span>
    <div class="app-update-banner-actions">
      <button type="button" class="btn btn-primary btn-sm" @click="refreshApp">Refresh</button>
      <button type="button" class="btn btn-ghost btn-sm" @click="dismissUpdate">Not now</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAppUpdate } from "../composables/useAppUpdate";

const { updateAvailable, refreshApp, dismissUpdate } = useAppUpdate();
</script>
