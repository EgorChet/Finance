<template>
  <RouterView />
  <ConfirmDialog />
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import ConfirmDialog from "./components/ConfirmDialog.vue";
import { useAuthStore } from "./stores/auth";

const auth = useAuthStore();
onMounted(() => {
  auth.checkStatus().catch(() => undefined);
});
</script>
