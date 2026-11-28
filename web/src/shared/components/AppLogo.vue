<template>
  <svg class="lg" :class="{ 'lg--anim': animated, 'lg--lockup': lockup }" :viewBox="lockup ? '0 0 360 48' : '0 0 48 48'" role="img" aria-label="Finance" focusable="false" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient :id="gid" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#7b6cff" />
        <stop offset="0.55" stop-color="#a35cff" />
        <stop offset="1" stop-color="#e255c8" />
      </linearGradient>
    </defs>
    <g>
      <rect class="lg-fill" x="2" y="2" width="44" height="44" rx="13" :fill="`url(#${gid})`" />
      <rect class="lg-frame" x="2" y="2" width="44" height="44" rx="13" fill="none" :stroke="`url(#${gid})`" stroke-width="2.5" pathLength="100" />
      <g stroke="#fff" stroke-width="4.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path class="lg-s1" pathLength="100" d="M14 34V14H22a6 6 0 0 1 6 6V28" />
        <path class="lg-s2" pathLength="100" d="M34 14V34H26a6 6 0 0 1-6-6V20" />
      </g>
      <circle class="lg-ring" cx="39" cy="9.5" r="3" fill="none" stroke="#4fc3ff" stroke-width="1.4" />
      <circle class="lg-dot" cx="39" cy="9.5" r="2.6" fill="#4fc3ff" />
    </g>
    <!-- Letters are drawn with lines, not a font, so the word looks the same on every device. -->
    <g v-if="lockup" class="lg-word" transform="translate(64 8)" stroke="currentColor" stroke-width="6" fill="none" stroke-linejoin="bevel" stroke-linecap="butt">
      <path d="M4 36V4H32M4 20H26" />
      <path transform="translate(48 0)" d="M4 4V36" />
      <path transform="translate(68 0)" d="M4 36V4L36 36V4" />
      <path transform="translate(116 0)" d="M4 36L20 4L36 36M10 26H30" />
      <path transform="translate(164 0)" d="M4 36V4L36 36V4" />
      <path transform="translate(212 0)" d="M36 8Q32 4 22 4Q4 4 4 20Q4 36 22 36Q32 36 36 32" />
      <path transform="translate(260 0)" d="M36 4H4V36H36M4 20H28" />
    </g>
  </svg>
</template>

<script setup lang="ts">
import { useId } from "vue";

/**
 * The Finance mark: a rounded square with the shekel drawn as two interlocking strokes, a cyan dot,
 * and (lockup) the word drawn with lines. `animated` plays the draw-on once, as on the launch screen.
 * Keep the paths in step with the inline copy in index.html and scripts/make-icons.
 */
defineProps<{ animated?: boolean; lockup?: boolean }>();
const gid = `lg-${useId()}`;
</script>

<style scoped>
.lg {
  display: block;
  overflow: visible;
}
.lg-frame,
.lg-ring {
  opacity: 0;
}
.lg-ring {
  transform-box: fill-box;
  transform-origin: center;
}
/* Static: everything in its final state. */
.lg:not(.lg--anim) .lg-fill,
.lg:not(.lg--anim) .lg-dot {
  opacity: 1;
}
/* Animated: the frame is drawn, the fill comes in, the two strokes are drawn, the dot pops, the word wipes in. */
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
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
}
.lg--anim .lg-s1 {
  animation: lg-draw 0.55s 0.6s cubic-bezier(0.6, 0, 0.2, 1) forwards;
}
.lg--anim .lg-s2 {
  animation: lg-draw 0.55s 0.95s cubic-bezier(0.6, 0, 0.2, 1) forwards;
}
.lg--anim .lg-dot {
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
  animation: lg-pop 0.5s 1.4s cubic-bezier(0.2, 1.4, 0.4, 1) forwards;
}
.lg--anim .lg-ring {
  animation: lg-ring 0.9s 1.45s ease-out forwards;
}
.lg--anim .lg-word {
  clip-path: inset(0 100% 0 0);
  animation: lg-wipe 0.7s 1.2s cubic-bezier(0.7, 0, 0.2, 1) forwards;
}
@keyframes lg-draw {
  to {
    stroke-dashoffset: 0;
  }
}
@keyframes lg-fade {
  to {
    opacity: 1;
  }
}
@keyframes lg-pop {
  from {
    opacity: 0;
    transform: scale(0.2);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes lg-ring {
  from {
    opacity: 0.9;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(3.2);
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
  .lg--anim .lg-dot,
  .lg--anim .lg-ring,
  .lg--anim .lg-word {
    animation: none;
  }
  .lg--anim .lg-fill,
  .lg--anim .lg-dot {
    opacity: 1;
  }
  .lg--anim .lg-frame,
  .lg--anim .lg-ring {
    opacity: 0;
  }
  .lg--anim .lg-s1,
  .lg--anim .lg-s2 {
    stroke-dashoffset: 0;
  }
  .lg--anim .lg-word {
    clip-path: none;
  }
}
</style>
