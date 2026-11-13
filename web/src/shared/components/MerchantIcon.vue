<template>
  <span
    v-if="mark"
    class="tx-row-icon tx-row-icon--brand"
    :class="{ 'tx-row-icon--photo': photoOk }"
    :style="photoOk ? undefined : { background: mark.bg, color: mark.fg }"
    aria-hidden="true"
  >
    <svg v-if="mark.kind === 'icon'" viewBox="0 0 24 24" width="20" height="20"><path :d="mark.path" fill="currentColor" /></svg>
    <template v-else>
      <span v-if="!photoOk" class="tx-row-icon-text" :class="{ 'tx-row-icon-text--long': mark.text.length > 2 }">{{ mark.text }}</span>
      <img
        v-if="mark.logoUrl && !photoBad"
        v-show="photoOk"
        :src="mark.logoUrl"
        alt=""
        decoding="async"
        @load="onLoad"
        @error="onError"
      />
    </template>
  </span>
  <CategoryIcon v-else :category="category" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { logoState, merchantMark } from "@/shared/utils/merchantLogos";
import CategoryIcon from "@/shared/components/CategoryIcon.vue";

/**
 * Round merchant icon: the brand's real logo when it's available and sharp, otherwise a colour
 * badge with its initials, otherwise the category icon.
 */
const props = defineProps<{ merchantHe?: string | null; merchantEn?: string | null; category: string }>();

/** Below this the site has no proper logo (Google's globe is 16px) — keep the badge. */
const MIN_LOGO_PX = 48;

const mark = computed(() => merchantMark(props.merchantHe, props.merchantEn));
const url = computed(() => (mark.value?.kind === "badge" ? mark.value.logoUrl : null));
/** Whether each logo file loaded sharp — shared by every icon, so a re-render never loses it. */
const photoOk = computed(() => !!url.value && logoState[url.value] === "ok");
const photoBad = computed(() => !url.value || logoState[url.value] === "bad");

function onLoad(e: Event) {
  const img = e.target as HTMLImageElement;
  if (url.value) logoState[url.value] = img.naturalWidth >= MIN_LOGO_PX ? "ok" : "bad";
}

function onError() {
  if (url.value) logoState[url.value] = "bad";
}
</script>
