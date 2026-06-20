<template>
  <div class="calendar-page">
    <div v-if="auth.isDemo" class="demo-banner">
      Demo mode — calendar is read-only. Sign in to add events and subscribe in Apple Calendar.
    </div>
    <h2 class="page-title">Calendar</h2>
    <p class="page-lead">Family events shared between you and your partner.</p>

    <AppLoader v-if="loading" title="Loading calendar" subtitle="Fetching events" />
    <template v-else>
      <p v-if="error" style="color: var(--danger)">{{ error }}</p>

      <section v-if="!auth.isDemo && feedUrl" class="calendar-subscribe">
        <h3 class="calendar-section-title">Subscribe in Apple Calendar</h3>
        <p class="calendar-subscribe-lead">
          Add this URL once on each iPhone. Events update automatically (read-only in Apple Calendar).
        </p>
        <div class="calendar-feed-row">
          <input class="input calendar-feed-input" :value="feedUrl" readonly @focus="($event.target as HTMLInputElement).select()" />
          <button type="button" class="btn" @click="copyFeedUrl">{{ copied ? "Copied" : "Copy link" }}</button>
        </div>
        <details class="calendar-subscribe-help">
          <summary>iPhone setup steps</summary>
          <ol>
            <li>Settings → Calendar → Accounts → Add Account → Other</li>
            <li>Add Subscribed Calendar → paste the link above</li>
            <li>Save — events appear in the Calendar app</li>
          </ol>
        </details>
        <button type="button" class="btn btn-ghost calendar-regenerate" :disabled="regenerating" @click="regenerateToken">
          {{ regenerating ? "Regenerating…" : "Generate new link (invalidates old one)" }}
        </button>
      </section>

      <div v-if="!auth.isDemo" class="calendar-add">
        <h3 class="calendar-section-title">Add event</h3>
        <div class="calendar-add-fields">
          <input v-model="newTitle" class="input" placeholder="Title" />
          <input v-model="newDate" class="input" type="date" />
          <input v-model="newDescription" class="input" placeholder="Note (optional)" />
          <button type="button" class="btn btn-primary" :disabled="adding || !newTitle.trim() || !newDate" @click="addEvent">
            {{ adding ? "Adding…" : "Add event" }}
          </button>
        </div>
      </div>

      <section class="calendar-month">
        <div class="calendar-month-head">
          <button type="button" class="btn btn-icon" aria-label="Previous month" @click="prevMonth">‹</button>
          <h3 class="calendar-month-label">{{ monthLabel }}</h3>
          <button type="button" class="btn btn-icon" aria-label="Next month" @click="nextMonth">›</button>
        </div>
        <div class="calendar-grid">
          <div v-for="dow in weekdays" :key="dow" class="calendar-dow">{{ dow }}</div>
          <div
            v-for="cell in monthCells"
            :key="cell.key"
            class="calendar-cell"
            :class="{
              'calendar-cell--outside': !cell.inMonth,
              'calendar-cell--today': cell.isToday,
              'calendar-cell--selected': cell.date === selectedDate,
            }"
            @click="cell.inMonth && (selectedDate = cell.date)"
          >
            <span class="calendar-cell-day">{{ cell.day }}</span>
            <span v-if="cell.eventCount" class="calendar-cell-dot" :title="`${cell.eventCount} event(s)`" />
          </div>
        </div>
      </section>

      <section class="calendar-events-panel">
        <h3 class="calendar-section-title">{{ selectedLabel }}</h3>
        <p v-if="!selectedEvents.length" class="calendar-empty">No events this day.</p>
        <ul v-else class="calendar-event-list">
          <li v-for="ev in selectedEvents" :key="ev.id" class="calendar-event-item">
            <div>
              <p class="calendar-event-title">{{ ev.title }}</p>
              <p v-if="ev.description" class="calendar-event-desc">{{ ev.description }}</p>
            </div>
            <button
              v-if="!auth.isDemo"
              type="button"
              class="btn btn-ghost calendar-event-delete"
              :disabled="deletingId === ev.id"
              @click="removeEvent(ev.id)"
            >
              {{ deletingId === ev.id ? "…" : "Delete" }}
            </button>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  addCalendarEvent,
  calendarFeedUrl,
  deleteCalendarEvent,
  fetchCalendar,
  regenerateCalendarFeedToken,
} from "../api/client";
import AppLoader from "../components/AppLoader.vue";
import { useAuthStore } from "../stores/auth";
import type { CalendarEvent } from "../types";
import { referenceDate } from "../utils/appDate";

const auth = useAuthStore();
const loading = ref(true);
const error = ref("");
const events = ref<CalendarEvent[]>([]);
const feedToken = ref<string | null>(null);

const viewYear = ref(0);
const viewMonth = ref(0);
const selectedDate = ref("");
const newTitle = ref("");
const newDate = ref("");
const newDescription = ref("");
const adding = ref(false);
const deletingId = ref<string | null>(null);
const copied = ref(false);
const regenerating = ref(false);

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const todayIso = computed(() => referenceDate(auth.isDemo, auth.demoAsOf).toISOString().slice(0, 10));

const feedUrl = computed(() => (feedToken.value ? calendarFeedUrl(feedToken.value) : ""));

const eventsByDate = computed(() => {
  const map = new Map<string, CalendarEvent[]>();
  for (const ev of events.value) {
    const list = map.get(ev.date) ?? [];
    list.push(ev);
    map.set(ev.date, list);
  }
  return map;
});

const monthLabel = computed(() => {
  const d = new Date(viewYear.value, viewMonth.value, 1);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
});

const monthCells = computed(() => {
  const first = new Date(viewYear.value, viewMonth.value, 1);
  const last = new Date(viewYear.value, viewMonth.value + 1, 0);
  const startPad = (first.getDay() + 6) % 7;
  const cells: {
    key: string;
    day: number;
    date: string;
    inMonth: boolean;
    isToday: boolean;
    eventCount: number;
  }[] = [];

  for (let i = 0; i < startPad; i += 1) {
    const d = new Date(viewYear.value, viewMonth.value, -startPad + i + 1);
    const date = iso(d);
    cells.push({
      key: `p-${date}`,
      day: d.getDate(),
      date,
      inMonth: false,
      isToday: date === todayIso.value,
      eventCount: eventsByDate.value.get(date)?.length ?? 0,
    });
  }

  for (let day = 1; day <= last.getDate(); day += 1) {
    const d = new Date(viewYear.value, viewMonth.value, day);
    const date = iso(d);
    cells.push({
      key: date,
      day,
      date,
      inMonth: true,
      isToday: date === todayIso.value,
      eventCount: eventsByDate.value.get(date)?.length ?? 0,
    });
  }

  while (cells.length % 7 !== 0) {
    const d = new Date(viewYear.value, viewMonth.value + 1, cells.length - startPad - last.getDate() + 1);
    const date = iso(d);
    cells.push({
      key: `n-${date}`,
      day: d.getDate(),
      date,
      inMonth: false,
      isToday: date === todayIso.value,
      eventCount: eventsByDate.value.get(date)?.length ?? 0,
    });
  }

  return cells;
});

const selectedEvents = computed(() => eventsByDate.value.get(selectedDate.value) ?? []);

const selectedLabel = computed(() => {
  if (!selectedDate.value) return "Events";
  const d = new Date(selectedDate.value + "T12:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
});

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function initViewDate() {
  const ref = referenceDate(auth.isDemo, auth.demoAsOf);
  viewYear.value = ref.getFullYear();
  viewMonth.value = ref.getMonth();
  selectedDate.value = todayIso.value;
  newDate.value = todayIso.value;
}

function prevMonth() {
  if (viewMonth.value === 0) {
    viewMonth.value = 11;
    viewYear.value -= 1;
  } else {
    viewMonth.value -= 1;
  }
}

function nextMonth() {
  if (viewMonth.value === 11) {
    viewMonth.value = 0;
    viewYear.value += 1;
  } else {
    viewMonth.value += 1;
  }
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const data = await fetchCalendar(auth.isDemo, auth.token || undefined);
    events.value = data.events;
    feedToken.value = data.feed_token;
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}

async function addEvent() {
  if (auth.isDemo) return;
  adding.value = true;
  try {
    const res = await addCalendarEvent(
      {
        title: newTitle.value.trim(),
        date: newDate.value,
        description: newDescription.value.trim() || undefined,
      },
      auth.token || undefined,
    );
    events.value = [...events.value, res.event].sort((a, b) => a.date.localeCompare(b.date));
    newTitle.value = "";
    newDescription.value = "";
    selectedDate.value = res.event.date;
    viewYear.value = parseInt(res.event.date.slice(0, 4), 10);
    viewMonth.value = parseInt(res.event.date.slice(5, 7), 10) - 1;
  } catch (e) {
    error.value = String(e);
  } finally {
    adding.value = false;
  }
}

async function removeEvent(id: string) {
  if (auth.isDemo) return;
  deletingId.value = id;
  try {
    await deleteCalendarEvent(id, auth.token || undefined);
    events.value = events.value.filter((e) => e.id !== id);
  } catch (e) {
    error.value = String(e);
  } finally {
    deletingId.value = null;
  }
}

async function copyFeedUrl() {
  if (!feedUrl.value) return;
  try {
    await navigator.clipboard.writeText(feedUrl.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    error.value = "Could not copy — select the URL and copy manually.";
  }
}

async function regenerateToken() {
  if (auth.isDemo) return;
  regenerating.value = true;
  try {
    const res = await regenerateCalendarFeedToken(auth.token || undefined);
    feedToken.value = res.feed_token;
  } catch (e) {
    error.value = String(e);
  } finally {
    regenerating.value = false;
  }
}

onMounted(() => {
  initViewDate();
  void load();
});
</script>
