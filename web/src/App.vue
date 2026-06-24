<template>
  <RouterView />
  <ConfirmDialog />
  <AppUpdateBanner />
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import AppUpdateBanner from "./components/AppUpdateBanner.vue";
import ConfirmDialog from "./components/ConfirmDialog.vue";
import { useAuthStore } from "./stores/auth";

const auth = useAuthStore();
onMounted(() => {
  auth.checkStatus().catch(() => undefined);
  auth.refreshMe().catch(() => undefined);
});
</script>
