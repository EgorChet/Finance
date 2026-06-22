<template>
  <div class="calendar-page">
    <div v-if="auth.isDemo" class="demo-banner">
      Demo mode — calendar is read-only. Sign in to add events and subscribe in Apple Calendar.
    </div>
    <h2 class="page-title">Calendar</h2>
    <div class="calendar-page-head">
      <p class="page-lead calendar-page-lead">Shared family events — appointments, birthdays, and reminders.</p>
      <button
        v-if="!auth.isDemo && !loading"
        type="button"
        class="btn btn-primary calendar-add-btn"
        @click="openAddForm"
      >
        {{ showForm ? "Close form" : "+ Add event" }}
      </button>
    </div>

    <AppLoader v-if="loading" title="Loading calendar" subtitle="Fetching events" />
    <template v-else>
      <p v-if="error" style="color: var(--danger)">{{ error }}</p>

      <CalendarEventForm
        v-if="!auth.isDemo && showForm"
        ref="formPanelRef"
        :model-date="selectedDate"
        :default-user="auth.userId ?? 'egor'"
        :editing="!!editingEvent"
        :event="editingEvent"
        :saving="saving"
        @save="saveEvent"
        @cancel="closeForm"
        @delete="deleteEditing"
      />

      <section class="calendar-month">
        <div class="calendar-month-head">
          <button type="button" class="btn btn-icon" aria-label="Previous month" @click="prevMonth">‹</button>
          <h3 class="calendar-month-label">{{ monthLabel }}</h3>
          <button type="button" class="btn btn-icon" aria-label="Next month" @click="nextMonth">›</button>
        </div>
        <div class="calendar-grid">
          <div v-for="dow in weekdays" :key="dow" class="calendar-dow">{{ dow }}</div>
          <button
            v-for="cell in monthCells"
            :key="cell.key"
            type="button"
            class="calendar-cell"
            :class="{
              'calendar-cell--outside': !cell.inMonth,
              'calendar-cell--today': cell.isToday,
              'calendar-cell--selected': cell.date === selectedDate,
              'calendar-cell--has-events': cell.eventCount > 0,
            }"
            @click="selectDate(cell.date, cell.inMonth)"
          >
            <span class="calendar-cell-day">{{ cell.day }}</span>
            <span v-if="cell.eventCount" class="calendar-cell-dot" :title="`${cell.eventCount} event(s)`" />
          </button>
        </div>
      </section>

      <section ref="eventsPanelRef" class="calendar-events-panel">
        <fieldset v-if="!listAnchorDate" class="calendar-period-filter">
          <legend class="sr-only">Show events for</legend>
          <div class="calendar-radio-group calendar-radio-group--inline">
            <label
              v-for="opt in periodOptions"
              :key="opt.value"
              class="calendar-radio-option calendar-radio-option--compact"
              :class="{ 'calendar-radio-option--active': periodFilter === opt.value }"
            >
              <input v-model="periodFilter" type="radio" name="period" :value="opt.value" />
              <span class="calendar-radio-label">{{ opt.label }}</span>
            </label>
          </div>
        </fieldset>

        <div v-else class="calendar-day-focus">
          <span>{{ dayFocusLabel }}</span>
          <button type="button" class="btn btn-ghost calendar-day-focus-clear" @click="clearDayFocus">Show all</button>
        </div>

        <p v-if="!listAnchorDate && !auth.isDemo" class="calendar-events-hint">Tap a day above, or use Edit on an event.</p>

        <p v-if="!filteredOccurrences.length" class="calendar-empty">{{ emptyPeriodLabel }}</p>
        <ul v-else class="calendar-event-list">
          <li v-for="item in filteredOccurrences" :key="`${item.event.id}-${item.date}`" class="calendar-event-item list-row">
            <div class="calendar-event-body">
              <span class="calendar-importance-dot" :class="importanceClass(item.event)" aria-hidden="true" />
              <div class="calendar-event-text">
                <p class="calendar-event-title">
                  {{ item.event.title }}
                  <span v-if="item.event.created_by" class="calendar-creator-badge" :class="creatorClass(item.event.created_by)">
                    {{ auth.labelFor(item.event.created_by) }}
                  </span>
                </p>
                <p class="calendar-event-meta">{{ formatEventWhen(item.event, item.date) }}</p>
                <p v-if="item.event.description" class="calendar-event-desc">{{ item.event.description }}</p>
              </div>
            </div>
            <button
              v-if="!auth.isDemo"
              type="button"
              class="btn btn-edit calendar-event-edit"
              @click="startEdit(item.event)"
            >
              Edit
            </button>
          </li>
        </ul>
      </section>

      <details v-if="!auth.isDemo && feedUrl" class="calendar-subscribe calendar-subscribe--bottom">
        <summary class="calendar-subscribe-summary">Subscribe in Apple Calendar</summary>
        <p class="calendar-subscribe-lead">
          One-time setup — paste this link on each iPhone. Updates sync automatically (read-only in Apple Calendar).
        </p>
        <div class="calendar-feed-row">
          <input class="input calendar-feed-input" :value="feedUrl" readonly @focus="($event.target as HTMLInputElement).select()" />
          <button type="button" class="btn" @click="copyFeedUrl">{{ copied ? "Copied" : "Copy link" }}</button>
        </div>
        <ol class="calendar-subscribe-steps">
          <li>Settings → Calendar → Accounts → Add Account → Other</li>
          <li>Add Subscribed Calendar → paste the link above</li>
          <li>Save — events appear in the Calendar app</li>
        </ol>
        <button type="button" class="btn btn-ghost calendar-regenerate" :disabled="regenerating" @click="regenerateToken">
          {{ regenerating ? "Regenerating…" : "Generate new link (invalidates old one)" }}
        </button>
      </details>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import {
  addCalendarEvent,
  calendarFeedUrl,
  deleteCalendarEvent,
  fetchCalendar,
  regenerateCalendarFeedToken,
  updateCalendarEvent,
} from "../api/client";
import AppLoader from "../components/AppLoader.vue";
import CalendarEventForm from "../components/CalendarEventForm.vue";
import { useAuthStore } from "../stores/auth";
import type { CalendarEvent } from "../types";
import { referenceDate } from "../utils/appDate";
import {
  defaultPeriodFilter,
  eventsOnDate,
  formatEventWhen,
  inferImportance,
  listOccurrences,
  periodRange,
  type CalendarPeriodFilter,
  formToPayload,
} from "../utils/calendarEvents";
import { creatorClass } from "../utils/users";

const auth = useAuthStore();
const loading = ref(true);
const saving = ref(false);
const error = ref("");
const events = ref<CalendarEvent[]>([]);
const feedToken = ref<string | null>(null);
const editingEvent = ref<CalendarEvent | null>(null);
const showForm = ref(false);

const viewYear = ref(0);
const viewMonth = ref(0);
const selectedDate = ref("");
const listAnchorDate = ref<string | null>(null);
const eventsPanelRef = ref<HTMLElement | null>(null);
const formPanelRef = ref<{ $el: HTMLElement } | null>(null);
const periodFilter = ref<CalendarPeriodFilter>("week");
const copied = ref(false);
const regenerating = ref(false);

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const todayIso = computed(() => referenceDate(auth.isDemo, auth.demoAsOf).toISOString().slice(0, 10));

const feedUrl = computed(() => (feedToken.value ? calendarFeedUrl(feedToken.value) : ""));

const hasEventsToday = computed(() => listOccurrences(events.value, todayIso.value, todayIso.value).length > 0);

const hasEventsThisWeek = computed(() => {
  const [from, through] = periodRange("week", todayIso.value);
  return listOccurrences(events.value, from, through).length > 0;
});

const periodOptions = computed(() => {
  const opts: { value: CalendarPeriodFilter; label: string }[] = [];
  if (hasEventsToday.value) opts.push({ value: "today", label: "Today" });
  opts.push({ value: "week", label: "This week" });
  opts.push({ value: "month", label: "This month" });
  return opts;
});

watch(hasEventsToday, (hasToday) => {
  if (!hasToday && periodFilter.value === "today") {
    periodFilter.value = hasEventsThisWeek.value ? "week" : "month";
  }
});

watch(hasEventsThisWeek, (hasWeek) => {
  if (!listAnchorDate.value && !hasWeek && periodFilter.value === "week") {
    periodFilter.value = "month";
  }
});

watch(periodFilter, () => {
  if (listAnchorDate.value) return;
  if (periodFilter.value === "week" && !hasEventsThisWeek.value) {
    periodFilter.value = "month";
  }
});

const filteredOccurrences = computed(() => {
  if (listAnchorDate.value) {
    const d = listAnchorDate.value;
    return listOccurrences(events.value, d, d);
  }
  const [from, through] = periodRange(periodFilter.value, todayIso.value);
  return listOccurrences(events.value, from, through);
});

const dayFocusLabel = computed(() => {
  if (!listAnchorDate.value) return "";
  const d = new Date(listAnchorDate.value + "T12:00:00");
  return `Events on ${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`;
});

const emptyPeriodLabel = computed(() => {
  if (listAnchorDate.value) return "Nothing on this day.";
  if (periodFilter.value === "today") return "Nothing scheduled for today.";
  if (periodFilter.value === "week") return "Nothing scheduled this week.";
  return "Nothing scheduled this month.";
});

function importanceClass(ev: CalendarEvent): string {
  return `calendar-importance-dot--${inferImportance(ev)}`;
}

function countOnDate(dateIso: string): number {
  return eventsOnDate(events.value, dateIso).length;
}

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
      eventCount: countOnDate(date),
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
      eventCount: countOnDate(date),
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
      eventCount: countOnDate(date),
    });
  }

  return cells;
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
}

function openAddForm() {
  if (showForm.value && !editingEvent.value) {
    closeForm();
    return;
  }
  editingEvent.value = null;
  showForm.value = true;
}

function closeForm() {
  showForm.value = false;
  editingEvent.value = null;
}

function clearDayFocus() {
  listAnchorDate.value = null;
}

function scrollToEvents() {
  void nextTick(() => {
    eventsPanelRef.value?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function scrollToForm() {
  void nextTick(() => {
    formPanelRef.value?.$el?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function selectDate(date: string, inMonth: boolean) {
  selectedDate.value = date;
  listAnchorDate.value = date;
  if (!inMonth) {
    const d = new Date(date + "T12:00:00");
    viewYear.value = d.getFullYear();
    viewMonth.value = d.getMonth();
  }

  scrollToEvents();
  closeForm();
}

function startEdit(ev: CalendarEvent) {
  if (auth.isDemo) return;
  editingEvent.value = ev;
  showForm.value = true;
  scrollToForm();
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
    periodFilter.value = defaultPeriodFilter(data.events, todayIso.value);
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}

function upsertEvent(event: CalendarEvent) {
  const idx = events.value.findIndex((e) => e.id === event.id);
  if (idx >= 0) {
    const next = [...events.value];
    next[idx] = event;
    events.value = next.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  } else {
    events.value = [...events.value, event].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  }
}

async function saveEvent(payload: ReturnType<typeof formToPayload>) {
  if (auth.isDemo) return;
  saving.value = true;
  error.value = "";
  try {
    if (editingEvent.value) {
      const res = await updateCalendarEvent(editingEvent.value.id, payload, auth.token || undefined);
      upsertEvent(res.event);
      editingEvent.value = res.event;
    } else {
      const res = await addCalendarEvent(payload, auth.token || undefined);
      upsertEvent(res.event);
      selectedDate.value = res.event.date;
      viewYear.value = parseInt(res.event.date.slice(0, 4), 10);
      viewMonth.value = parseInt(res.event.date.slice(5, 7), 10) - 1;
      closeForm();
    }
  } catch (e) {
    error.value = String(e);
  } finally {
    saving.value = false;
  }
}

async function deleteEditing() {
  if (auth.isDemo || !editingEvent.value) return;
  saving.value = true;
  error.value = "";
  try {
    await deleteCalendarEvent(editingEvent.value.id, auth.token || undefined);
    events.value = events.value.filter((e) => e.id !== editingEvent.value!.id);
    closeForm();
  } catch (e) {
    error.value = String(e);
  } finally {
    saving.value = false;
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
