<template>
  <section class="home-card">
    <header class="home-card-head">
      <h3 class="home-card-title">Coming up</h3>
      <RouterLink class="home-card-link" to="/app/calendar">Calendar →</RouterLink>
    </header>
    <AppLoader v-if="loading" title="Loading events" subtitle="Fetching your calendar" />
    <template v-else>
      <p v-if="error" class="home-card-error">{{ error }}</p>
      <p v-else-if="!upcoming.length" class="home-card-empty">Nothing scheduled in the next 30 days.</p>
      <ul v-else class="home-events-list">
        <li v-for="ev in upcoming" :key="ev.id" class="home-event-row">
          <span class="home-event-date">{{ formatEventDate(ev.date) }}</span>
          <span class="home-event-title">{{ ev.title }}</span>
        </li>
      </ul>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppLoader from "../AppLoader.vue";
import type { CalendarEvent } from "../../types";

const props = defineProps<{
  loading: boolean;
  error?: string;
  events: CalendarEvent[];
  today?: string;
}>();

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

const upcoming = computed(() => {
  const today = props.today ?? new Date().toISOString().slice(0, 10);
  const horizon = addDays(today, 30);
  return props.events
    .filter((e) => e.date >= today && e.date <= horizon)
    .slice(0, 6);
});

function formatEventDate(date: string): string {
  const d = new Date(date + "T12:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
</script>
