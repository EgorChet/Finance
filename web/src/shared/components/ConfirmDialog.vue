<template>
  <Teleport to="body">
    <div
      v-if="state.open"
      class="confirm-overlay"
      @click.self="cancel"
    >
      <div
        class="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="messageId"
      >
        <h3
          :id="titleId"
          class="confirm-dialog-title"
          :class="{ 'confirm-dialog-title--danger': state.tone === 'danger' }"
        >
          {{ t(state.title) }}
        </h3>
        <p :id="messageId" class="confirm-dialog-message">{{ t(state.message) }}</p>
        <div class="confirm-dialog-actions">
          <button ref="cancelBtn" type="button" class="btn" @click="cancel">
            {{ t(state.cancelLabel) }}
          </button>
          <button
            type="button"
            class="btn"
            :class="state.tone === 'danger' ? 'btn-danger' : 'btn-primary'"
            @click="accept"
          >
            {{ t(state.confirmLabel) }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { t } from "@/shared/i18n";
import { nextTick, onUnmounted, ref, watch } from "vue";
import { useConfirmState } from "@/shared/composables/useConfirm";

const { state, accept, cancel } = useConfirmState();
const cancelBtn = ref<HTMLButtonElement | null>(null);
const titleId = "confirm-dialog-title";
const messageId = "confirm-dialog-message";

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") cancel();
}

watch(
  () => state.open,
  (open) => {
    document.body.style.overflow = open ? "hidden" : "";
    if (open) {
      document.addEventListener("keydown", onKeydown);
      void nextTick(() => cancelBtn.value?.focus());
    } else {
      document.removeEventListener("keydown", onKeydown);
    }
  },
);

onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
  document.body.style.overflow = "";
});
</script>
