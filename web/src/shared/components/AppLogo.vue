<template>
  <svg class="lg" :class="{ 'lg--anim': animated, 'lg--scrub': scrubbing }" :viewBox="lockup ? '0 0 195 60' : '0 0 60 60'" role="img" aria-label="Ч-Банк" focusable="false" xmlns="http://www.w3.org/2000/svg">
    <rect class="lg-fill" :style="scrub?.fill" x="0" y="0" width="60" height="60" rx="17" />
    <rect class="lg-frame" :style="scrub?.frame" x="1.25" y="1.25" width="57.5" height="57.5" rx="16" fill="none" stroke-width="2.5" pathLength="100" />
    <!-- The Ч is the same glyph, size and stroke as the letters of the word: cap height 32, stroke 6. -->
    <g class="lg-ch" transform="translate(17 14)" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path class="lg-s1" :style="scrub?.s1" pathLength="100" d="M3 3V14Q3 19 8 19H23" />
      <path class="lg-s2" :style="scrub?.s2" pathLength="100" d="M23 3V29" />
    </g>
    <!-- The mark is the first letter of the name, so the word only spells БАНК. Drawn with lines, not a font. -->
    <g v-if="lockup" class="lg-word" transform="translate(76 14)" stroke="currentColor" stroke-width="6" fill="none" stroke-linejoin="round" stroke-linecap="round">
      <path d="M23 3H3V29H14Q23 29 23 23.5Q23 18 14 18H3" /><path transform="translate(30 0)" d="M3 29L13 3L23 29M6.2 21H19.8" /><path transform="translate(60 0)" d="M3 3V29M23 3V29M3 16H23" /><path transform="translate(93 0)" d="M3 3V29M23 3L3 17M9.5 12.5L23 29" />
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";

/**
 * The Ч-Банк mark: a rounded square in the palette's fill colour holding the letter Ч; the lockup adds БАНК.
 * One letter construction for all five letters (cap height 32, stroke 6, round caps and joins), and the Ч in the
 * square has exactly the word's cap height and stroke, so nothing looks smaller or from another font.
 * `animated` plays the draw-on once, as on the launch screen. Keep the paths in step with the inline copy in
 * index.html and scripts/make-icons.mjs.
 */
const props = defineProps<{ animated?: boolean; lockup?: boolean; /** 0..1: draw the mark by hand, as far as this (pull to refresh). */ progress?: number }>();

const scrubbing = computed(() => props.progress != null);
const clamp = (n: number) => Math.max(0, Math.min(1, n));
/** The same order as the launch animation: frame, fill, then the two strokes, driven by `progress`. */
const scrub = computed(() => {
  if (props.progress == null) return null;
  const p = props.progress;
  return {
    frame: { opacity: 1, strokeDasharray: 100, strokeDashoffset: 100 * (1 - clamp(p / 0.55)) },
    fill: { opacity: clamp((p - 0.6) / 0.2) },
    s1: { opacity: p > 0.4 ? 1 : 0, strokeDasharray: 100, strokeDashoffset: 100 * (1 - clamp((p - 0.4) / 0.35)) },
    s2: { opacity: p > 0.7 ? 1 : 0, strokeDasharray: 100, strokeDashoffset: 100 * (1 - clamp((p - 0.7) / 0.3)) },
  };
});
</script>

<style scoped>
.lg {
  display: block;
  overflow: visible;
}
.lg-fill {
  fill: var(--accent-fill);
}
.lg-frame {
  opacity: 0;
  stroke: var(--accent-fill);
}
.lg-ch {
  stroke: var(--accent-contrast);
}
/* Animated: the frame is drawn, the fill comes in, the two strokes are drawn, the word wipes in. */
.lg--anim .lg-fill {
  opacity: 0;
  animation: lg-fade 0.4s 0.55s ease-out forwards;
}
.lg--anim .lg-frame {
  opacity: 1;
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
  animation: lg-draw 0.7s 0.05s cubic-bezier(0.6, 0, 0.2, 1) forwards;
}
.lg--anim .lg-s1,
.lg--anim .lg-s2 {
  opacity: 0;
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
}
.lg--anim .lg-s1 {
  animation: lg-draw 0.55s 0.8s cubic-bezier(0.6, 0, 0.2, 1) forwards;
}
.lg--anim .lg-s2 {
  animation: lg-draw 0.4s 1.2s cubic-bezier(0.6, 0, 0.2, 1) forwards;
}
.lg--anim .lg-word {
  clip-path: inset(0 100% 0 0);
  animation: lg-wipe 0.7s 1.2s cubic-bezier(0.7, 0, 0.2, 1) forwards;
}
@keyframes lg-draw {
  from {
    opacity: 1;
  }
  to {
    opacity: 1;
    stroke-dashoffset: 0;
  }
}
@keyframes lg-fade {
  to {
    opacity: 1;
  }
}
@keyframes lg-wipe {
  to {
    clip-path: inset(0 0 0 0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .lg--anim .lg-fill,
  .lg--anim .lg-frame,
  .lg--anim .lg-s1,
  .lg--anim .lg-s2,
  .lg--anim .lg-word {
    animation: none;
  }
  .lg--anim .lg-fill {
    opacity: 1;
  }
  .lg--anim .lg-frame {
    opacity: 0;
  }
  .lg--anim .lg-s1,
  .lg--anim .lg-s2 {
    opacity: 1;
    stroke-dashoffset: 0;
  }
  .lg--anim .lg-word {
    clip-path: none;
  }
}
</style>
