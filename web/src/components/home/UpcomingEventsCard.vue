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
        <li v-for="item in upcoming" :key="`${item.event.id}-${item.date}`" class="home-event-row">
          <span class="home-event-when">{{ formatEventWhen(item.event, item.date) }}</span>
          <span class="home-event-title">{{ item.event.title }}</span>
        </li>
      </ul>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppLoader from "../AppLoader.vue";
import type { CalendarEvent } from "../../types";
import { formatEventWhen, upcomingOccurrences } from "../../utils/calendarEvents";

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
  return upcomingOccurrences(props.events, today, addDays(today, 30), 6);
});
</script>
