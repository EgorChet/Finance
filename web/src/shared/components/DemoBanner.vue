<template>
  <div v-if="auth.isDemo" class="demo-banner demo-banner--edit">
    <span>{{ t("Demo household — try anything: edits stay in this browser only.") }}</span>
    <span class="demo-banner-actions">
      <button v-if="edited" type="button" class="demo-banner-link" @click="reset">{{ t("Reset demo") }}</button>
      <button type="button" class="demo-banner-link" @click="goSignIn">{{ t("Sign in") }}</button>
    </span>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { t } from "@/shared/i18n";
import { demoHasEdits } from "@/shared/demo/backend";
import { resetDemoAndReload } from "@/shared/demo/reset";
import { useAuthStore } from "@/shared/stores/auth";
import { goToSignIn } from "@/features/auth/utils/signIn";

const auth = useAuthStore();
const router = useRouter();
const edited = ref(demoHasEdits());

function reset() {
  void resetDemoAndReload();
}

function goSignIn() {
  void goToSignIn(router);
}
</script>
