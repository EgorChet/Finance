<template>
  <div class="info-tip">
    <button type="button" class="info-tip__btn" :aria-expanded="open" @click="open = !open">
      <span class="info-tip__i" aria-hidden="true">i</span>{{ t(label) }}
    </button>
    <p v-if="open" class="info-tip__text">{{ text }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { t } from "@/shared/i18n";

/** An explanation that stays out of the way until asked for: a small "i" button, the text below it. */
withDefaults(defineProps<{ text: string; label?: string }>(), { label: "How it's counted" });
const open = ref(false);
</script>

<style scoped>
.info-tip {
  margin: 0.5rem 0 0;
}
.info-tip__btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 32px;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
}
.info-tip__i {
  display: inline-grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border: 1.5px solid currentColor;
  border-radius: 50%;
  font-size: 0.68rem;
  font-style: italic;
  font-weight: 700;
  line-height: 1;
}
.info-tip__text {
  margin: 0.15rem 0 0;
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--text-faint);
}
</style>
