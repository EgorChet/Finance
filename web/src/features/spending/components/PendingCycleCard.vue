<template>
  <section class="bx-empty pending-cycle">
    <p class="pending-cycle__icon" aria-hidden="true">🧾</p>
    <p class="pending-cycle__title">{{ cycleLabel }} is waiting for its statement</p>
    <p class="pending-cycle__text">
      {{ cycleRange }}. The numbers and categories appear as soon as the card syncs — tap Sync Cal or
      ask Totoshka to upload the statement.
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { openCycleTabLabel } from "@/shared/utils/format";
import { getCycleRangeForStart, loadCycleDay } from "@/features/spending/utils/pace";

const props = defineProps<{ cycleStart: string }>();

const cycleLabel = computed(() => openCycleTabLabel(props.cycleStart));

const cycleRange = computed(() => {
  const { start, end } = getCycleRangeForStart(props.cycleStart, loadCycleDay());
  const fmt = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(start)} – ${fmt(end)}`;
});
</script>
