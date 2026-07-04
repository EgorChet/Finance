<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  message: string;
  state: "syncing" | "done" | "error";
}>();

const emit = defineEmits<{
  dismiss: [];
  "show-error": [];
}>();

const displayMessage = computed(() => {
  const text = props.message?.trim();
  if (text) return text;
  if (props.state === "syncing") return "Syncing with Cal…";
  if (props.state === "done") return "Cal sync complete";
  return "Cal sync failed";
});
</script>

<template>
  <div
    class="cal-sync-float"
    :class="`cal-sync-float--${state}`"
    role="status"
    aria-live="polite"
    @click="state === 'error' ? emit('show-error') : undefined"
  >
    <span v-if="state === 'syncing'" class="cal-sync-float-icon cal-sync-float-spin" aria-hidden="true">↻</span>
    <span v-else-if="state === 'done'" class="cal-sync-float-icon" aria-hidden="true">✓</span>
    <span v-else class="cal-sync-float-icon" aria-hidden="true">!</span>
    <span class="cal-sync-float-text">{{ displayMessage }}</span>
    <button
      v-if="state === 'error' || state === 'done'"
      type="button"
      class="cal-sync-float-dismiss"
      :aria-label="state === 'error' ? 'View details' : 'Dismiss'"
      @click.stop="state === 'error' ? emit('show-error') : emit('dismiss')"
    >
      {{ state === "error" ? "…" : "×" }}
    </button>
  </div>
</template>

<style scoped>
.cal-sync-float {
  position: fixed;
  right: 1rem;
  bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
  z-index: 8500;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  max-width: min(22rem, calc(100vw - 2rem));
  padding: 0.55rem 0.75rem;
  border-radius: 999px;
  background: var(--surface, #fff);
  border: 1px solid var(--border, #ccc);
  box-shadow: 0 4px 20px rgb(0 0 0 / 0.15);
  font-size: 0.85rem;
  pointer-events: auto;
}

.cal-sync-float--done {
  border-color: #2ecc71;
  background: #ecfdf3;
  color: #14532d;
}

.cal-sync-float--error {
  border-color: var(--danger, #c0392b);
  background: #fff5f5;
  color: #991b1b;
  cursor: pointer;
}

.cal-sync-float-icon {
  flex-shrink: 0;
  width: 1.25rem;
  height: 1.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.95rem;
}

.cal-sync-float--done .cal-sync-float-icon {
  color: #1e8e4a;
}

.cal-sync-float--error .cal-sync-float-icon {
  color: var(--danger, #c0392b);
}

.cal-sync-float-spin {
  animation: cal-sync-spin 0.9s linear infinite;
}

@keyframes cal-sync-spin {
  to {
    transform: rotate(360deg);
  }
}

.cal-sync-float-text {
  flex: 1;
  min-width: 0;
  line-height: 1.3;
}

.cal-sync-float--syncing .cal-sync-float-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cal-sync-float--done .cal-sync-float-text,
.cal-sync-float--error .cal-sync-float-text {
  white-space: normal;
}

.cal-sync-float-dismiss {
  flex-shrink: 0;
  border: none;
  background: transparent;
  font-size: 1.1rem;
  line-height: 1;
  padding: 0 0.15rem;
  cursor: pointer;
  color: inherit;
  opacity: 0.7;
}
</style>
