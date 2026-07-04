<template>
  <EditPanel
    class="calendar-form-panel"
    :title="editing ? 'Edit event' : 'New event'"
    :done-label="saving ? 'Saving…' : editing ? 'Save changes' : 'Add event'"
    :disabled="saving || !canSave"
    :deletable="editing"
    delete-label="Delete event"
    @done="handleSave"
    @cancel="$emit('cancel')"
    @delete="$emit('delete')"
  >
    <div class="field-group">
      <label class="field-label">Title</label>
      <input v-model="form.title" class="input" placeholder="e.g. Dentist" />
    </div>
    <div class="field-group calendar-date-field">
      <label class="field-label">Date</label>
      <input v-model="form.date" class="input calendar-date-input" type="date" />
    </div>

    <fieldset class="calendar-radio-fieldset">
      <legend class="field-label">When</legend>
      <div class="calendar-radio-group calendar-radio-group--inline">
        <label
          class="calendar-radio-option calendar-radio-option--compact"
          :class="{ 'calendar-radio-option--active': !form.all_day }"
        >
          <input v-model="form.all_day" type="radio" name="when" :value="false" />
          <span class="calendar-radio-label">Set times</span>
        </label>
        <label
          class="calendar-radio-option calendar-radio-option--compact"
          :class="{ 'calendar-radio-option--active': form.all_day }"
        >
          <input v-model="form.all_day" type="radio" name="when" :value="true" />
          <span class="calendar-radio-label">All day</span>
        </label>
      </div>
    </fieldset>

    <div v-if="!form.all_day" class="calendar-time-row">
      <div class="field-group calendar-date-field">
        <label class="field-label">Start</label>
        <input v-model="form.start_time" class="input calendar-time-input" type="time" />
      </div>
      <div class="field-group calendar-date-field">
        <label class="field-label">End</label>
        <input v-model="form.end_time" class="input calendar-time-input" type="time" />
      </div>
    </div>
    <p v-if="!form.all_day && !timesValid" class="calendar-form-hint calendar-form-hint--error">
      End time must be after start time.
    </p>

    <fieldset class="calendar-radio-fieldset">
      <legend class="field-label">Importance</legend>
      <div class="calendar-radio-group calendar-radio-group--inline">
        <label
          v-for="opt in CALENDAR_IMPORTANCE_OPTIONS"
          :key="opt.value"
          class="calendar-radio-option calendar-radio-option--compact"
          :class="{ 'calendar-radio-option--active': form.importance === opt.value }"
        >
          <input v-model="form.importance" type="radio" name="importance" :value="opt.value" />
          <span class="calendar-radio-label">{{ opt.label }}</span>
        </label>
      </div>
    </fieldset>

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
  </EditPanel>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import EditPanel from "@/shared/components/EditPanel.vue";
import type { CalendarEvent, HouseholdUserId } from "@/shared/types";
import { useAuthStore } from "@/shared/stores/auth";
import {
  CALENDAR_IMPORTANCE_OPTIONS,
  CALENDAR_RECURRENCE_OPTIONS,
  emptyEventForm,
  eventToForm,
  formTimesValid,
  formToPayload,
} from "@/features/calendar/utils/calendarEvents";

const props = defineProps<{
  modelDate: string;
  defaultUser?: HouseholdUserId;
  editing?: boolean;
  event?: CalendarEvent | null;
  saving?: boolean;
}>();

const auth = useAuthStore();

const emit = defineEmits<{
  save: [payload: ReturnType<typeof formToPayload>];
  cancel: [];
  delete: [];
}>();

function currentUser(): HouseholdUserId {
  return props.defaultUser ?? auth.userId ?? "egor";
}

const form = reactive(emptyEventForm(props.modelDate, currentUser()));

watch(
  () => props.event,
  (ev) => {
    if (ev) {
      Object.assign(form, eventToForm(ev));
    } else {
      Object.assign(form, emptyEventForm(props.modelDate, currentUser()));
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
  () => [props.defaultUser, auth.userId, props.editing] as const,
  () => {
    if (!props.editing) form.created_by = currentUser();
  },
);

const timesValid = computed(() => formTimesValid(form));

const canSave = computed(() => !!form.title.trim() && !!form.date && timesValid.value);

function handleSave() {
  if (!canSave.value || props.saving) return;
  emit("save", formToPayload(form));
}
</script>
