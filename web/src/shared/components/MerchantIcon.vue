<template>
  <span
    v-if="mark"
    class="tx-row-icon tx-row-icon--brand"
    :style="{ background: mark.bg, color: mark.fg }"
    aria-hidden="true"
  >
    <svg v-if="mark.kind === 'icon'" viewBox="0 0 24 24" width="20" height="20"><path :d="mark.path" fill="currentColor" /></svg>
    <span v-else class="tx-row-icon-text" :class="{ 'tx-row-icon-text--long': mark.text.length > 2 }">{{ mark.text }}</span>
  </span>
  <span v-else class="tx-row-icon" aria-hidden="true">{{ fallback }}</span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { merchantMark } from "@/shared/utils/merchantLogos";

/** Round merchant icon: the brand's mark when known, otherwise the category emoji. */
const props = defineProps<{ merchantHe?: string | null; merchantEn?: string | null; fallback: string }>();

const mark = computed(() => merchantMark(props.merchantHe, props.merchantEn));
</script>
