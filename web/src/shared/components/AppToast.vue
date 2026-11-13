<template>
  <Teleport to="body">
    <Transition name="app-toast">
      <div v-if="toastState.message" :key="toastState.id" class="app-toast" role="status" aria-live="polite">
        <span class="app-toast-text">{{ toastState.message }}</span>
        <button v-if="toastState.action" type="button" class="app-toast-action" @click="runToastAction">
          {{ toastState.action }}
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { runToastAction, toastState } from "@/shared/composables/useToast";
</script>
