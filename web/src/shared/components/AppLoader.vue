<template>
  <!-- Blocking actions (uploads, processing): spinner card with optional steps. -->
  <div v-if="overlay" class="app-loader app-loader-overlay">
    <div class="app-loader-card" role="status" aria-live="polite">
      <div class="app-loader-spinner" aria-hidden="true">
        <span class="app-loader-ring" />
      </div>
      <p class="app-loader-title">{{ title }}</p>
      <p v-if="subtitle" class="app-loader-subtitle">{{ subtitle }}</p>
      <ul v-if="steps.length" class="app-loader-steps">
        <li
          v-for="(step, i) in steps"
          :key="step"
          :class="{
            'is-active': i === activeStep,
            'is-done': i < activeStep,
          }"
        >
          <span class="app-loader-step-icon" aria-hidden="true">{{ i < activeStep ? "✓" : i === activeStep ? "●" : "○" }}</span>
          <span>{{ step }}</span>
        </li>
      </ul>
    </div>
  </div>

  <!-- Screen and section loading: a shimmering outline of what is coming, no text wall. -->
  <div
    v-else
    class="skeleton"
    :class="[`skeleton--${compact ? 'compact' : variant}`]"
    role="status"
    aria-live="polite"
  >
    <span class="skeleton-sr">{{ title }}</span>

    <template v-if="compact">
      <div class="skeleton-row"><span class="skeleton-line skeleton-line--w60" /><span class="skeleton-line skeleton-line--w20" /></div>
      <div class="skeleton-row"><span class="skeleton-line skeleton-line--w45" /><span class="skeleton-line skeleton-line--w20" /></div>
    </template>

    <template v-else-if="variant === 'hero'">
      <!-- Same shape as the budget card, so nothing jumps when it loads. -->
      <div class="skeleton-block skeleton-block--hero">
        <div class="skeleton-row"><span class="skeleton-line skeleton-line--pill" /><span class="skeleton-line skeleton-line--w20" /></div>
        <span class="skeleton-line skeleton-line--w30" />
        <span class="skeleton-line skeleton-line--xxl skeleton-line--w45" />
        <span class="skeleton-line skeleton-line--w60" />
        <span class="skeleton-chart" />
        <div class="skeleton-row skeleton-row--start"><span class="skeleton-line skeleton-line--chip" /><span class="skeleton-line skeleton-line--chip" /></div>
        <div class="skeleton-row"><span class="skeleton-line skeleton-line--w40" /><span class="skeleton-line skeleton-line--w20" /></div>
        <span class="skeleton-line skeleton-line--bar" />
        <div class="skeleton-tiles skeleton-tiles--3">
          <span class="skeleton-col"><span class="skeleton-line skeleton-line--sm skeleton-line--w60" /><span class="skeleton-line skeleton-line--lg skeleton-line--w80" /></span>
          <span class="skeleton-col"><span class="skeleton-line skeleton-line--sm skeleton-line--w60" /><span class="skeleton-line skeleton-line--lg skeleton-line--w80" /></span>
          <span class="skeleton-col"><span class="skeleton-line skeleton-line--sm skeleton-line--w60" /><span class="skeleton-line skeleton-line--lg skeleton-line--w80" /></span>
        </div>
      </div>
      <span class="skeleton-line skeleton-line--title" />
      <div v-for="n in 4" :key="n" class="skeleton-row skeleton-row--card">
        <span class="skeleton-dot" />
        <span class="skeleton-col">
          <span class="skeleton-line" :class="n % 2 ? 'skeleton-line--w55' : 'skeleton-line--w40'" />
          <span class="skeleton-line skeleton-line--sm skeleton-line--w30" />
        </span>
        <span class="skeleton-line skeleton-line--w20" />
      </div>
    </template>

    <template v-else-if="variant === 'card'">
      <div class="skeleton-block skeleton-block--card">
        <span class="skeleton-line skeleton-line--w40" />
        <span class="skeleton-line skeleton-line--lg skeleton-line--w60" />
        <span class="skeleton-line skeleton-line--w80" />
      </div>
    </template>

    <template v-else>
      <div v-for="n in rows" :key="n" class="skeleton-row skeleton-row--card">
        <span class="skeleton-col">
          <span class="skeleton-line" :class="n % 2 ? 'skeleton-line--w60' : 'skeleton-line--w45'" />
          <span class="skeleton-line skeleton-line--sm skeleton-line--w35" />
        </span>
        <span class="skeleton-line skeleton-line--w20" />
      </div>
    </template>

    <Transition name="skeleton-caption">
      <p v-if="slowStage > 0" class="skeleton-caption">
        {{ slowStage > 1 ? "Still loading. The server may be waking up, this can take up to a minute." : `${title}…` }}
      </p>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    steps?: string[];
    activeStep?: number;
    overlay?: boolean;
    compact?: boolean;
    /** Shape of the placeholder: a hero summary, a list of rows, or a single card. */
    variant?: "hero" | "list" | "card";
    rows?: number;
  }>(),
  {
    subtitle: "",
    steps: () => [],
    activeStep: 0,
    overlay: false,
    compact: false,
    variant: "list",
    rows: 9,
  },
);

// Skeletons alone are enough for fast loads; only say something when it takes a while.
const slowStage = ref(0);
const timers: ReturnType<typeof setTimeout>[] = [];

onMounted(() => {
  if (props.overlay) return;
  timers.push(setTimeout(() => (slowStage.value = 1), 2500));
  timers.push(setTimeout(() => (slowStage.value = 2), 9000));
});

onUnmounted(() => timers.forEach(clearTimeout));
</script>
