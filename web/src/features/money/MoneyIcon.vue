<template>
  <svg class="mi" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <template v-if="name === 'pension'">
      <path d="M12 3a8 8 0 0 0-8 8h16a8 8 0 0 0-8-8Z" />
      <path d="M12 11v7a2 2 0 0 0 4 0" />
    </template>
    <template v-else-if="name === 'pitzuim'">
      <path d="M12 3 5 6v5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </template>
    <template v-else-if="name === 'study'">
      <path d="m3 9 9-4 9 4-9 4-9-4Z" />
      <path d="M7 11.5V16c0 1.2 2.2 2.5 5 2.5s5-1.3 5-2.5v-4.5M21 9v5" />
    </template>
    <template v-else-if="name === 'stocks'">
      <path d="M4 18 9 12l4 3 7-9" />
      <path d="M15 6h5v5" />
    </template>
    <template v-else-if="name === 'calc'">
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <path d="M8.5 7.5h7M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01" />
    </template>
    <template v-else-if="name === 'check'">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.3 2.4 2.4 4.6-5" />
    </template>
    <template v-else-if="name === 'receipt'">
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6M9 12h6" />
    </template>
  </svg>
</template>

<script setup lang="ts">
defineProps<{ name: "pension" | "pitzuim" | "study" | "stocks" | "receipt" | "calc" | "check" }>();
</script>

<style scoped>
.mi {
  width: 22px;
  height: 22px;
}
</style>
