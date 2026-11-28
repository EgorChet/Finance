<template>
  <svg class="lg" :class="{ 'lg--anim': animated }" :viewBox="lockup ? '0 0 240 48' : '0 0 48 48'" role="img" aria-label="Ч-Банк" focusable="false" xmlns="http://www.w3.org/2000/svg">
    <rect class="lg-fill" x="2" y="2" width="44" height="44" rx="13" fill="#FFCF3F" />
    <rect class="lg-frame" x="2" y="2" width="44" height="44" rx="13" fill="none" stroke="#FFCF3F" stroke-width="2.5" pathLength="100" />
    <g stroke="#111114" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path class="lg-s1" pathLength="100" d="M15 12V26Q15 30 20 30H33" />
      <path class="lg-s2" pathLength="100" d="M33 12V38" />
    </g>
    <!-- The Ч is the mark itself, so the word only spells БАНК. Letters are drawn with lines, not a font. -->
    <g v-if="lockup" class="lg-word" transform="translate(58 8)" stroke="currentColor" stroke-width="5.5" fill="none" stroke-linejoin="bevel" stroke-linecap="butt">
      <path d="M34 4H4V36H22Q34 36 34 28Q34 20 22 20H4" /><path transform="translate(46 0)" d="M4 36L20 4L36 36M10 26H30" /><path transform="translate(92 0)" d="M4 4V36M36 4V36M4 20H36" /><path transform="translate(138 0)" d="M4 4V36M34 4L4 21M12 16L36 36" />
    </g>
  </svg>
</template>

<script setup lang="ts">
/**
 * The Ч-Банк mark: a yellow rounded square with a Ч drawn in two strokes; the lockup adds БАНК.
 * `animated` plays the draw-on once, as on the launch screen.
 * Keep the paths in step with the inline copy in index.html and scripts/make-icons.mjs.
 */
defineProps<{ animated?: boolean; lockup?: boolean }>();
</script>

<style scoped>
.lg {
  display: block;
  overflow: visible;
}
.lg-frame {
  opacity: 0;
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
