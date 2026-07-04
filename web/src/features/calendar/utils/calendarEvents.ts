import type { CalendarEvent, CalendarImportance, CalendarRecurrence } from "@/shared/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type CalendarPeriodFilter = "today" | "week" | "month";

export type EventImportance = "quick" | "normal" | "important";

export const CALENDAR_RECURRENCE_OPTIONS: { value: CalendarRecurrence; label: string }[] = [
  { value: "none", label: "Does not repeat" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
  { value: "yearly", label: "Every year" },
];

export const CALENDAR_IMPORTANCE_OPTIONS: { value: EventImportance; label: string; hint: string }[] = [
  { value: "quick", label: "Quick", hint: "Low priority" },
  { value: "normal", label: "Normal", hint: "Standard" },
  { value: "important", label: "Important", hint: "High priority" },
];

function parseDateParts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { y, m, d };
}

function parseTimeMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function defaultEndTime(startTime: string, durationMinutes = 60): string {
  const total = parseTimeMinutes(startTime) + durationMinutes;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function eventImportance(event: CalendarEvent): EventImportance {
  const imp = event.importance;
  if (imp === "quick" || imp === "normal" || imp === "important") return imp;
  return "normal";
}

/** @deprecated use eventImportance */
export function inferImportance(event: CalendarEvent): EventImportance {
  return eventImportance(event);
}

export function importanceLabel(importance: EventImportance): string {
  return CALENDAR_IMPORTANCE_OPTIONS.find((o) => o.value === importance)?.label ?? "Normal";
}

export function isAllDayEvent(event: CalendarEvent): boolean {
  if (event.all_day === true) return true;
  if (event.importance === "all_day") return true;
  if (event.all_day === false) return false;
  return !event.start_time;
}

export function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function endOfWeekIso(fromIso: string): string {
  const [y, m, d] = fromIso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay();
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  return addDaysIso(fromIso, daysUntilSunday);
}

export function endOfMonthIso(fromIso: string): string {
  const [y, m] = fromIso.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

export function periodRange(filter: CalendarPeriodFilter, todayIso: string): [string, string] {
  if (filter === "today") return [todayIso, todayIso];
  if (filter === "week") return [todayIso, endOfWeekIso(todayIso)];
  return [todayIso, endOfMonthIso(todayIso)];
}

export function eventOccursOn(event: CalendarEvent, dateIso: string): boolean {
  if (!DATE_RE.test(dateIso)) return false;
  const recurrence = event.recurrence ?? "none";
  if (recurrence === "none") return event.date === dateIso;
  if (dateIso < event.date) return false;

  const target = parseDateParts(dateIso);
  const start = parseDateParts(event.date);

  if (recurrence === "yearly") return target.m === start.m && target.d === start.d;
  if (recurrence === "monthly") return target.d === start.d;
  if (recurrence === "weekly") {
    const startMs = Date.UTC(start.y, start.m - 1, start.d);
    const targetMs = Date.UTC(target.y, target.m - 1, target.d);
    const diffDays = Math.round((targetMs - startMs) / 86_400_000);
    return diffDays >= 0 && diffDays % 7 === 0;
  }
  return false;
}

export function eventsOnDate(events: CalendarEvent[], dateIso: string): CalendarEvent[] {
  return events
    .filter((ev) => eventOccursOn(ev, dateIso))
    .sort((a, b) => {
      const aAll = isAllDayEvent(a);
      const bAll = isAllDayEvent(b);
      if (aAll !== bAll) return aAll ? -1 : 1;
      const aTime = a.start_time ?? "";
      const bTime = b.start_time ?? "";
      if (aTime !== bTime) return aTime.localeCompare(bTime);
      return a.title.localeCompare(b.title);
    });
}

export function listOccurrences(
  events: CalendarEvent[],
  fromIso: string,
  throughIso: string,
): { event: CalendarEvent; date: string }[] {
  const items: { event: CalendarEvent; date: string }[] = [];
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = throughIso.split("-").map(Number);
  const from = new Date(fy, fm - 1, fd);
  const through = new Date(ty, tm - 1, td);
  for (let d = new Date(from); d <= through; d.setDate(d.getDate() + 1)) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    for (const ev of eventsOnDate(events, iso)) {
      items.push({ event: ev, date: iso });
    }
  }
  return items;
}

export function upcomingOccurrences(
  events: CalendarEvent[],
  fromIso: string,
  throughIso: string,
  limit = 6,
): { event: CalendarEvent; date: string }[] {
  return listOccurrences(events, fromIso, throughIso).slice(0, limit);
}

export function recurrenceLabel(recurrence: CalendarRecurrence | undefined): string {
  return CALENDAR_RECURRENCE_OPTIONS.find((o) => o.value === (recurrence ?? "none"))?.label ?? "Does not repeat";
}

export function formatEventTime(event: CalendarEvent): string {
  if (isAllDayEvent(event)) return "All day";
  if (!event.start_time) return "";
  if (event.end_time) return `${event.start_time} – ${event.end_time}`;
  return event.start_time;
}

export function formatEventWhen(event: CalendarEvent, dateIso?: string): string {
  const date = dateIso ?? event.date;
  const d = new Date(date + "T12:00:00");
  const dateLabel = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const time = formatEventTime(event);
  const repeat = event.recurrence && event.recurrence !== "none" ? ` · ${recurrenceLabel(event.recurrence)}` : "";
  return time ? `${dateLabel} · ${time}${repeat}` : `${dateLabel}${repeat}`;
}

export function emptyEventForm(date: string, createdBy: import("@/shared/types").HouseholdUserId = "egor") {
  return {
    title: "",
    date,
    all_day: false,
    start_time: "10:00",
    end_time: "12:00",
    importance: "normal" as EventImportance,
    description: "",
    recurrence: "none" as CalendarRecurrence,
    created_by: createdBy,
  };
}

export function eventToForm(event: CalendarEvent) {
  const all_day = isAllDayEvent(event);
  return {
    title: event.title,
    date: event.date,
    all_day,
    start_time: event.start_time ?? "10:00",
    end_time: event.end_time ?? defaultEndTime(event.start_time ?? "10:00", 120),
    importance: eventImportance(event),
    description: event.description ?? "",
    recurrence: event.recurrence ?? "none",
    created_by: event.created_by ?? "egor",
  };
}

export type CalendarEventFormState = {
  title: string;
  date: string;
  all_day: boolean;
  start_time: string;
  end_time: string;
  importance: EventImportance;
  description?: string;
  recurrence?: CalendarRecurrence;
  created_by: import("@/shared/types").HouseholdUserId;
};

export function formTimesValid(form: Pick<CalendarEventFormState, "all_day" | "start_time" | "end_time">): boolean {
  if (form.all_day) return true;
  if (!form.start_time || !form.end_time) return false;
  return parseTimeMinutes(form.end_time) > parseTimeMinutes(form.start_time);
}

export type CalendarEventPayload = {
  title: string;
  date: string;
  all_day: boolean;
  start_time?: string;
  end_time?: string;
  importance: CalendarImportance;
  description?: string;
  recurrence?: CalendarRecurrence;
  created_by: import("@/shared/types").HouseholdUserId;
};

export function formToPayload(form: CalendarEventFormState): CalendarEventPayload {
  const base = {
    title: form.title.trim(),
    date: form.date,
    importance: form.importance,
    description: form.description?.trim() || undefined,
    recurrence: form.recurrence,
    created_by: form.created_by,
  };
  if (form.all_day) {
    return { ...base, all_day: true };
  }
  return {
    ...base,
    all_day: false,
    start_time: form.start_time,
    end_time: form.end_time,
  };
}

export function defaultPeriodFilter(events: CalendarEvent[], todayIso: string): CalendarPeriodFilter {
  if (listOccurrences(events, todayIso, todayIso).length > 0) return "today";
  const [weekFrom, weekThrough] = periodRange("week", todayIso);
  if (listOccurrences(events, weekFrom, weekThrough).length > 0) return "week";
  return "month";
}
