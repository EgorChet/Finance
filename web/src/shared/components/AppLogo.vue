<template>
  <svg class="lg" :class="{ 'lg--anim': animated, 'lg--loop': loop, 'lg--scrub': scrubbing }" :viewBox="lockup ? '0 0 285 84' : '0 0 84 84'" role="img" aria-label="Ч-Банк" focusable="false" xmlns="http://www.w3.org/2000/svg">
    <rect class="lg-fill" :style="scrub?.fill" x="0" y="0" width="84" height="84" rx="22" />
    <rect class="lg-frame" :style="scrub?.frame" x="1.25" y="1.25" width="81.5" height="81.5" rx="21" fill="none" stroke-width="2.5" pathLength="100" />
    <!-- Mark and word share one cap height (36) and the same top and bottom lines, as in the T-Bank logo. -->
    <path class="lg-ch" :style="scrub?.ch" transform="translate(22 23)" d="M0 0H9V12.5Q9 18 15.5 18H31V0H40V36H31V27H13Q0 27 0 15Z" />
    <!-- The square holds the first letter of the name, so the word only spells БАНК. Drawn with paths, not a font. -->
    <g v-if="lockup" class="lg-word" transform="translate(105 23)" fill="currentColor">
      <path fill-rule="evenodd" d="M0 0H40V9H9V13.5H24Q40 13.5 40 24.75Q40 36 24 36H0Z M9 22.5V27H24Q31 27 31 24.75Q31 22.5 24 22.5Z" /><path fill-rule="evenodd" transform="translate(41.5 0)" d="M0 36L17.5 0H28.5L46 36H35L32.6 31H13.4L11 36Z M17.3 23H28.7L23 11.3Z" /><path transform="translate(90.7 0)" d="M0 0H9V14.5H31V0H40V36H31V23.5H9V36H0Z" /><path transform="translate(137.1 0)" d="M0 0H9V15.2L30.5 0H42.5L21.2 17.6L43 36H30.8L14.6 22.6L9 27.3V36H0Z" />
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";

/**
 * The Ч-Банк mark: a rounded square in the palette's fill colour holding the letter Ч; the lockup adds БАНК.
 * Proportions follow the T-Bank logo (see docs/BRAND.md): mark and word share one cap height and the same top and
 * bottom lines, heavy wide letters, tight spacing. `animated` plays the draw-on once, as on the launch screen.
 * Keep the paths in step with the inline copy in index.html and scripts/make-icons.mjs.
 */
const props = defineProps<{ animated?: boolean; /** Repeat the draw-on until it is removed (while something loads). */ loop?: boolean; lockup?: boolean; /** 0..1: draw the mark by hand, as far as this (pull to refresh). */ progress?: number }>();

const scrubbing = computed(() => props.progress != null);
const clamp = (n: number) => Math.max(0, Math.min(1, n));
/** The same order as the launch animation: frame, fill, then the Ч revealed top to bottom, driven by `progress`. */
const scrub = computed(() => {
  if (props.progress == null) return null;
  const p = props.progress;
  return {
    frame: { opacity: 1, strokeDasharray: 100, strokeDashoffset: 100 * (1 - clamp(p / 0.55)) },
    fill: { opacity: clamp((p - 0.5) / 0.25) },
    ch: { clipPath: `inset(0 0 ${100 * (1 - clamp((p - 0.55) / 0.45))}% 0)` },
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
  fill: var(--accent-contrast);
}
/* Animated: the frame is drawn, the fill comes in, the Ч is revealed top to bottom, the word wipes in. */
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
.lg--anim .lg-ch {
  clip-path: inset(0 0 100% 0);
  animation: lg-reveal 0.6s 0.85s cubic-bezier(0.7, 0, 0.2, 1) forwards;
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
@keyframes lg-reveal {
  to {
    clip-path: inset(0 0 0 0);
  }
}
@keyframes lg-wipe {
  to {
    clip-path: inset(0 0 0 0);
  }
}
/* Loop: the same draw-on over and over while something loads, so the mark never freezes. */
.lg--loop .lg-frame {
  opacity: 1;
  stroke-dasharray: 100;
  animation: lg-c-frame 1.8s cubic-bezier(0.6, 0, 0.2, 1) infinite;
}
.lg--loop .lg-fill {
  opacity: 0;
  animation: lg-c-fill 1.8s ease-out infinite;
}
.lg--loop .lg-ch {
  clip-path: inset(0 0 100% 0);
  animation: lg-c-ch 1.8s cubic-bezier(0.7, 0, 0.2, 1) infinite;
}
@keyframes lg-c-frame {
  0% {
    stroke-dashoffset: 100;
    opacity: 1;
  }
  35% {
    stroke-dashoffset: 0;
    opacity: 1;
  }
  85% {
    stroke-dashoffset: 0;
    opacity: 1;
  }
  100% {
    stroke-dashoffset: 0;
    opacity: 0;
  }
}
@keyframes lg-c-fill {
  0%,
  28% {
    opacity: 0;
  }
  45%,
  85% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
@keyframes lg-c-ch {
  0%,
  40% {
    clip-path: inset(0 0 100% 0);
    opacity: 1;
  }
  65%,
  85% {
    clip-path: inset(0 0 0 0);
    opacity: 1;
  }
  100% {
    clip-path: inset(0 0 0 0);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .lg--anim .lg-fill,
  .lg--anim .lg-frame,
  .lg--anim .lg-ch,
  .lg--anim .lg-word,
  .lg--loop .lg-fill,
  .lg--loop .lg-frame,
  .lg--loop .lg-ch {
    animation: none;
  }
  .lg--loop .lg-fill {
    opacity: 1;
  }
  .lg--loop .lg-frame {
    opacity: 0;
  }
  .lg--loop .lg-ch {
    clip-path: none;
  }
  .lg--anim .lg-fill {
    opacity: 1;
  }
  .lg--anim .lg-frame {
    opacity: 0;
  }
  .lg--anim .lg-ch,
  .lg--anim .lg-word {
    clip-path: none;
  }
}
</style>
