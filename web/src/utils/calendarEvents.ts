import type { CalendarEvent, CalendarImportance, CalendarRecurrence } from "../types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type CalendarPeriodFilter = "today" | "week" | "month";

export const CALENDAR_RECURRENCE_OPTIONS: { value: CalendarRecurrence; label: string }[] = [
  { value: "none", label: "Does not repeat" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
  { value: "yearly", label: "Every year" },
];

export const CALENDAR_IMPORTANCE_OPTIONS: {
  value: CalendarImportance;
  label: string;
  hint: string;
  durationMinutes: number | null;
}[] = [
  { value: "quick", label: "Quick", hint: "1 hour", durationMinutes: 60 },
  { value: "normal", label: "Normal", hint: "2 hours", durationMinutes: 120 },
  { value: "important", label: "Important", hint: "3 hours", durationMinutes: 180 },
  { value: "all_day", label: "All day", hint: "Full day", durationMinutes: null },
];

function parseDateParts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { y, m, d };
}

function parseTimeMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function defaultEndTime(startTime: string, durationMinutes = 60): string {
  return minutesToTime(parseTimeMinutes(startTime) + durationMinutes);
}

export function importanceDurationMinutes(importance: CalendarImportance): number | null {
  return CALENDAR_IMPORTANCE_OPTIONS.find((o) => o.value === importance)?.durationMinutes ?? 120;
}

export function applyImportance(
  importance: CalendarImportance,
  startTime = "10:00",
): { all_day: boolean; start_time?: string; end_time?: string } {
  if (importance === "all_day") {
    return { all_day: true };
  }
  const mins = importanceDurationMinutes(importance) ?? 120;
  return {
    all_day: false,
    start_time: startTime,
    end_time: defaultEndTime(startTime, mins),
  };
}

export function inferImportance(event: CalendarEvent): CalendarImportance {
  if (event.importance) return event.importance;
  if (isAllDayEvent(event)) return "all_day";
  if (!event.start_time || !event.end_time) return "normal";
  const mins = parseTimeMinutes(event.end_time) - parseTimeMinutes(event.start_time);
  if (mins <= 75) return "quick";
  if (mins <= 150) return "normal";
  return "important";
}

export function importanceLabel(importance: CalendarImportance): string {
  return CALENDAR_IMPORTANCE_OPTIONS.find((o) => o.value === importance)?.label ?? "Normal";
}

export function isAllDayEvent(event: CalendarEvent): boolean {
  if (event.importance === "all_day") return true;
  if (event.all_day === true) return true;
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

export function emptyEventForm(date: string) {
  return {
    title: "",
    date,
    importance: "normal" as CalendarImportance,
    start_time: "10:00",
    description: "",
    recurrence: "none" as CalendarRecurrence,
  };
}

export function eventToForm(event: CalendarEvent) {
  const importance = inferImportance(event);
  return {
    title: event.title,
    date: event.date,
    importance,
    start_time: event.start_time ?? "10:00",
    description: event.description ?? "",
    recurrence: event.recurrence ?? "none",
  };
}

export type CalendarEventFormState = {
  title: string;
  date: string;
  importance: CalendarImportance;
  start_time?: string;
  description?: string;
  recurrence?: CalendarRecurrence;
};

export function formToPayload(form: CalendarEventFormState): CalendarEventFormState & {
  all_day: boolean;
  end_time?: string;
} {
  const timing = applyImportance(form.importance, form.start_time ?? "10:00");
  return {
    ...form,
    title: form.title.trim(),
    description: form.description?.trim() || undefined,
    all_day: timing.all_day,
    start_time: timing.start_time,
    end_time: timing.end_time,
  };
}

export function defaultPeriodFilter(events: CalendarEvent[], todayIso: string): CalendarPeriodFilter {
  if (listOccurrences(events, todayIso, todayIso).length > 0) return "today";
  return "week";
}
