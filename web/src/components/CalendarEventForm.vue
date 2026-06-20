<template>
  <section class="calendar-form-panel">
    <div class="calendar-form-head">
      <h3 class="calendar-section-title">{{ editing ? "Edit event" : "New event" }}</h3>
      <button type="button" class="btn btn-icon calendar-form-close" aria-label="Close" @click="$emit('cancel')">×</button>
    </div>
    <div class="calendar-form-fields">
      <div class="field-group">
        <label class="field-label">Title</label>
        <input v-model="form.title" class="input" placeholder="e.g. Dentist" />
      </div>
      <div class="field-group calendar-date-field">
        <label class="field-label">Date</label>
        <input v-model="form.date" class="input calendar-date-input" type="date" />
      </div>

      <fieldset class="calendar-radio-fieldset">
        <legend class="field-label">Added by</legend>
        <div class="calendar-radio-group calendar-radio-group--inline">
          <label
            v-for="person in householdUsers"
            :key="person.id"
            class="calendar-radio-option calendar-radio-option--compact"
            :class="{ 'calendar-radio-option--active': form.created_by === person.id }"
          >
            <input v-model="form.created_by" type="radio" name="created_by" :value="person.id" />
            <span class="calendar-radio-label">{{ person.label }}</span>
          </label>
        </div>
      </fieldset>

      <fieldset class="calendar-radio-fieldset">
        <legend class="field-label">How long</legend>
        <div class="calendar-radio-group">
          <label
            v-for="opt in CALENDAR_IMPORTANCE_OPTIONS"
            :key="opt.value"
            class="calendar-radio-option"
            :class="{ 'calendar-radio-option--active': form.importance === opt.value }"
          >
            <input v-model="form.importance" type="radio" name="importance" :value="opt.value" />
            <span class="calendar-radio-label">{{ opt.label }}</span>
            <span class="calendar-radio-hint">{{ opt.hint }}</span>
          </label>
        </div>
      </fieldset>

      <div v-if="form.importance !== 'all_day'" class="field-group calendar-date-field">
        <label class="field-label">Start time</label>
        <input v-model="form.start_time" class="input calendar-time-input" type="time" />
      </div>

      <div class="field-group">
        <label class="field-label">Repeat</label>
        <select v-model="form.recurrence" class="input">
          <option v-for="opt in CALENDAR_RECURRENCE_OPTIONS" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>
      <div class="field-group">
        <label class="field-label">Notes</label>
        <textarea v-model="form.description" class="input calendar-notes" rows="3" placeholder="Address, gift ideas, etc." />
      </div>
      <div class="calendar-form-actions">
        <button type="button" class="btn btn-primary" :disabled="saving || !canSave" @click="handleSave">
          {{ saving ? "Saving…" : editing ? "Save changes" : "Add event" }}
        </button>
        <button v-if="editing" type="button" class="btn btn-ghost calendar-form-delete" :disabled="saving" @click="$emit('delete')">
          Delete
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import type { CalendarEvent, HouseholdUserId } from "../types";
import { useAuthStore } from "../stores/auth";
import {
  CALENDAR_IMPORTANCE_OPTIONS,
  CALENDAR_RECURRENCE_OPTIONS,
  emptyEventForm,
  eventToForm,
  formToPayload,
  type CalendarEventFormState,
} from "../utils/calendarEvents";

const props = defineProps<{
  modelDate: string;
  defaultUser?: HouseholdUserId;
  editing?: boolean;
  event?: CalendarEvent | null;
  saving?: boolean;
}>();

const auth = useAuthStore();
const householdUsers = computed(() => auth.householdUsers);

const emit = defineEmits<{
  save: [payload: ReturnType<typeof formToPayload>];
  cancel: [];
  delete: [];
}>();

const form = reactive(emptyEventForm(props.modelDate, props.defaultUser ?? "egor"));

watch(
  () => props.event,
  (ev) => {
    if (ev) {
      Object.assign(form, eventToForm(ev));
    } else {
      Object.assign(form, emptyEventForm(props.modelDate, props.defaultUser ?? "egor"));
    }
  },
  { immediate: true },
);

watch(
  () => props.modelDate,
  (date) => {
    if (!props.editing) form.date = date;
  },
);

watch(
  () => props.defaultUser,
  (user) => {
    if (!props.editing && user) form.created_by = user;
  },
);

const canSave = computed(() => !!form.title.trim() && !!form.date);

function handleSave() {
  emit("save", formToPayload(form));
}
</script>
