import { computed, onUnmounted, ref } from "vue";

type GradualRevealOptions = {
  /** Base reveal speed when the buffer is only slightly ahead. */
  charsPerSecond?: number;
};

/**
 * Smoothly reveals streamed text character-by-character instead of in network chunks.
 * The buffer can grow while reveal catches up; speed adapts when lag increases.
 */
export function useGradualReveal(options: GradualRevealOptions = {}) {
  const baseCharsPerSecond = options.charsPerSecond ?? 52;

  const buffer = ref("");
  const visible = ref("");
  const isRevealing = computed(() => visible.value.length < buffer.value.length);

  let rafId = 0;
  let lastTime = 0;

  function stop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function tick(now: number) {
    const lag = buffer.value.length - visible.value.length;
    if (lag <= 0) {
      stop();
      return;
    }

    const dt = Math.min(now - lastTime, 120);
    lastTime = now;

    const speedMultiplier = 1 + Math.min(lag / 72, 4);
    const chars = Math.max(1, Math.round((baseCharsPerSecond * speedMultiplier * dt) / 1000));
    visible.value = buffer.value.slice(0, visible.value.length + chars);

    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (rafId) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function append(text: string) {
    if (!text) return;
    buffer.value += text;
    start();
  }

  function reset() {
    stop();
    buffer.value = "";
    visible.value = "";
  }

  function flush() {
    visible.value = buffer.value;
    stop();
  }

  onUnmounted(stop);

  return { buffer, visible, isRevealing, append, reset, flush };
}
