<template>
  <RouterView />
  <ConfirmDialog />
  <AppUpdateBanner />
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import AppUpdateBanner from "@/shared/components/AppUpdateBanner.vue";
import ConfirmDialog from "@/shared/components/ConfirmDialog.vue";
import { useAuthStore } from "@/shared/stores/auth";

const auth = useAuthStore();
onMounted(() => {
  auth.checkStatus().catch(() => undefined);
  auth.refreshMe().catch(() => undefined);
});
</script>
