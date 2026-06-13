import { onMounted, onUnmounted, ref } from "vue";

/** True when viewport is phone-sized (default ≤640px). */
export function useCompactLayout(breakpoint = 640) {
  const isCompact = ref(false);
  let mq: MediaQueryList | null = null;

  const update = () => {
    isCompact.value = mq?.matches ?? false;
  };

  onMounted(() => {
    mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    update();
    mq.addEventListener("change", update);
  });

  onUnmounted(() => {
    mq?.removeEventListener("change", update);
  });

  return { isCompact };
}
