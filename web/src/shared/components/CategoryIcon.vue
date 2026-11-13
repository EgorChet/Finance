<template>
  <span
    class="cat-icon"
    :class="`cat-icon--${size}`"
    :style="{ color: glyph.color, background: `color-mix(in srgb, ${glyph.color} 18%, transparent)` }"
    aria-hidden="true"
  >
    <!-- Static, generated Lucide markup (categoryGlyphs.ts), not user content. -->
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      v-html="glyph.svg"
    />
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { CATEGORY_GLYPHS } from "@/shared/utils/categoryGlyphs";

/** Round category icon: a line icon in the category's colour on a soft tint of it. */
const props = withDefaults(defineProps<{ category: string; size?: "md" | "sm" }>(), { size: "md" });

const glyph = computed(() => CATEGORY_GLYPHS[props.category] ?? CATEGORY_GLYPHS.Other);
</script>
