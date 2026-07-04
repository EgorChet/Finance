<template>
  <div :class="['app-loader', { 'app-loader-overlay': overlay, 'app-loader-inline': !overlay, 'app-loader-compact': compact && !overlay }]">
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
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    steps?: string[];
    activeStep?: number;
    overlay?: boolean;
    compact?: boolean;
  }>(),
  {
    steps: () => [],
    activeStep: 0,
    overlay: false,
    compact: false,
  },
);
</script>
