<template>
  <Teleport to="body">
    <div v-if="state.open" class="confirm-overlay" @click.self="cancel">
      <div
        class="confirm-dialog adjust-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adjust-dialog-title"
      >
        <h3 id="adjust-dialog-title" class="confirm-dialog-title">{{ state.title }}</h3>
        <p v-if="state.transaction" class="adjust-dialog-lead">
          {{ merchantLabel }} · {{ formatIls(state.transaction.charge_amount) }} total
        </p>
        <p class="adjust-dialog-hint">
          How much was paid back to you? Only the remainder counts toward your spending.
        </p>

        <label class="adjust-field">
          <span class="adjust-field-label">Reimbursed to you (₪)</span>
          <input
            ref="inputRef"
            v-model="state.reimbursement"
            type="number"
            min="0"
            step="0.01"
            :max="state.transaction?.charge_amount"
            class="adjust-input"
            inputmode="decimal"
            @keydown.enter.prevent="submit"
          />
        </label>

        <label class="adjust-field">
          <span class="adjust-field-label">Note (optional)</span>
          <input
            v-model="state.note"
            type="text"
            class="adjust-input"
            placeholder="Friends paid back"
            @keydown.enter.prevent="submit"
          />
        </label>

        <p v-if="previewNet != null" class="adjust-preview">
          Your spend: <strong>{{ formatIls(previewNet) }}</strong>
        </p>
        <p v-if="error" class="adjust-error">{{ error }}</p>

        <div class="confirm-dialog-actions">
          <button type="button" class="btn" @click="cancel">Cancel</button>
          <button type="button" class="btn btn-primary" @click="submit">Save</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { useAdjustChargeState } from "@/shared/composables/useAdjustCharge";
import { formatIls, roundMoney } from "@/shared/utils/format";

const { state, accept, cancel } = useAdjustChargeState();
const inputRef = ref<HTMLInputElement | null>(null);
const error = ref("");

const merchantLabel = computed(() => {
  const tx = state.transaction;
  if (!tx) return "";
  return tx.merchant_en || tx.merchant_he;
});

const previewNet = computed(() => {
  const tx = state.transaction;
  if (!tx) return null;
  const reimbursed = Number.parseFloat(state.reimbursement);
  if (!Number.isFinite(reimbursed) || reimbursed <= 0) return null;
  return roundMoney(Math.max(0, tx.charge_amount - reimbursed));
});

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") cancel();
}

function submit() {
  error.value = "";
  const tx = state.transaction;
  if (!tx) return;
  const reimbursed = roundMoney(Number.parseFloat(state.reimbursement));
  if (!Number.isFinite(reimbursed) || reimbursed <= 0) {
    error.value = "Enter how much was reimbursed to you.";
    return;
  }
  if (reimbursed >= tx.charge_amount) {
    error.value = "Use Exclude if the full charge isn’t yours.";
    return;
  }
  accept(reimbursed, state.note.trim() || undefined);
}

watch(
  () => state.open,
  (open) => {
    error.value = "";
    document.body.style.overflow = open ? "hidden" : "";
    if (open) {
      document.addEventListener("keydown", onKeydown);
      void nextTick(() => inputRef.value?.focus());
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

<style scoped>
.adjust-dialog-lead {
  margin: 0 0 0.35rem;
  color: var(--text-muted);
  font-size: 0.92rem;
}

.adjust-dialog-hint {
  margin: 0 0 1rem;
  font-size: 0.88rem;
  color: var(--text-muted);
}

.adjust-field {
  display: block;
  margin-bottom: 0.85rem;
}

.adjust-field-label {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.adjust-input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
}

.adjust-preview {
  margin: 0 0 0.75rem;
  font-size: 0.92rem;
}

.adjust-error {
  margin: 0 0 0.75rem;
  color: var(--danger);
  font-size: 0.88rem;
}
</style>
