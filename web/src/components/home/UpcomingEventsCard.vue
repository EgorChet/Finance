<template>
  <section class="home-card home-card-events">
    <header class="home-card-head">
      <h3 class="home-card-title">Coming up</h3>
      <RouterLink class="home-card-link" to="/app/calendar">Calendar →</RouterLink>
    </header>
    <AppLoader v-if="loading" compact title="Loading events" subtitle="Fetching your calendar" />
    <template v-else>
      <p v-if="error" class="home-card-error">{{ error }}</p>
      <p v-else-if="!upcoming.length" class="home-card-empty">Nothing scheduled in the next 30 days.</p>
      <ul v-else class="home-events-list">
        <li v-for="item in upcoming" :key="`${item.event.id}-${item.date}`" class="home-event-row">
          <span class="calendar-importance-dot" :class="importanceClass(item.event)" aria-hidden="true" />
          <div class="home-event-text">
            <span class="home-event-title">
              {{ item.event.title }}
              <span v-if="item.event.created_by" class="calendar-creator-badge" :class="creatorClass(item.event.created_by)">
                {{ auth.labelFor(item.event.created_by) }}
              </span>
            </span>
            <span class="home-event-when">{{ formatEventWhen(item.event, item.date) }}</span>
          </div>
        </li>
      </ul>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppLoader from "../AppLoader.vue";
import { useAuthStore } from "../../stores/auth";
import type { CalendarEvent } from "../../types";
import { formatEventWhen, inferImportance, upcomingOccurrences } from "../../utils/calendarEvents";
import { creatorClass } from "../../utils/users";

const auth = useAuthStore();

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

function importanceClass(event: CalendarEvent): string {
  return `calendar-importance-dot--${inferImportance(event)}`;
}

const upcoming = computed(() => {
  const today = props.today ?? new Date().toISOString().slice(0, 10);
  return upcomingOccurrences(props.events, today, addDays(today, 30), 6);
});
</script>
