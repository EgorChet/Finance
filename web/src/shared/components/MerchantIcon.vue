<template>
  <span class="tx-row-icon" :class="{ 'tx-row-icon--logo': showLogo }" aria-hidden="true">
    <img v-if="showLogo" :src="logo!" alt="" loading="lazy" decoding="async" @error="failed = true" />
    <template v-else>{{ fallback }}</template>
  </span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { merchantLogoUrl } from "@/shared/utils/merchantLogos";

/** Round merchant icon: the brand's logo when known, otherwise the category emoji. */
const props = defineProps<{ merchantHe?: string | null; merchantEn?: string | null; fallback: string }>();

const failed = ref(false);
const logo = computed(() => merchantLogoUrl(props.merchantHe, props.merchantEn));
watch(logo, () => (failed.value = false));
const showLogo = computed(() => !!logo.value && !failed.value);
</script>
