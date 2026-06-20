import { randomBytes, randomUUID } from "crypto";
import { readCalendar, writeCalendar } from "../storage/index.js";
import type { CalendarData, CalendarEvent, CalendarImportance, CalendarRecurrence, HouseholdUserId } from "../types.js";
import { defaultEventCreator, isHouseholdUserId, userProfile } from "../users.js";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function generateFeedToken(): string {
  return randomBytes(24).toString("base64url");
}

function parseTimeMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function normalizeImportance(value: unknown): CalendarImportance | undefined {
  if (value === "quick" || value === "normal" || value === "important" || value === "all_day") return value;
  return undefined;
}

function importanceDuration(importance: CalendarImportance): number | null {
  switch (importance) {
    case "quick":
      return 60;
    case "normal":
      return 120;
    case "important":
      return 180;
    default:
      return null;
  }
}

function applyImportance(
  importance: CalendarImportance,
  startTime: string,
): { all_day: boolean; start_time?: string; end_time?: string } {
  if (importance === "all_day") return { all_day: true };
  const mins = importanceDuration(importance) ?? 120;
  const start = startTime.trim();
  if (!TIME_RE.test(start)) return { all_day: false, start_time: "10:00", end_time: defaultEndTime("10:00", mins) };
  return { all_day: false, start_time: start, end_time: defaultEndTime(start, mins) };
}

function defaultEndTime(startTime: string, durationMinutes = 60): string {
  const total = parseTimeMinutes(startTime) + durationMinutes;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function normalizeRecurrence(value: unknown): CalendarRecurrence {
  if (value === "weekly" || value === "monthly" || value === "yearly") return value;
  return "none";
}

function isAllDay(event: CalendarEvent): boolean {
  if (event.all_day === true) return true;
  if (event.all_day === false) return false;
  return !event.start_time;
}

export function normalizeEvent(raw: Partial<CalendarEvent>, existing?: CalendarEvent): CalendarEvent | null {
  const title = String(raw.title ?? existing?.title ?? "").trim();
  const date = String(raw.date ?? existing?.date ?? "").trim().slice(0, 10);
  if (!title || !DATE_RE.test(date)) return null;

  const importance =
    normalizeImportance(raw.importance ?? existing?.importance) ??
    (raw.all_day === true || existing?.all_day === true ? "all_day" : undefined);

  let all_day: boolean;
  let start_time: string | undefined;
  let end_time: string | undefined;
  let resolvedImportance: CalendarImportance | undefined = importance;

  if (importance) {
    const timing = applyImportance(importance, String(raw.start_time ?? existing?.start_time ?? "10:00"));
    all_day = timing.all_day;
    start_time = timing.start_time;
    end_time = timing.end_time;
  } else {
    const startProvided = raw.start_time !== undefined ? String(raw.start_time).trim() : existing?.start_time;
    const allDayExplicit = raw.all_day ?? existing?.all_day;
    all_day = allDayExplicit === true || (allDayExplicit !== false && !startProvided);

    if (!all_day) {
      const start = String(raw.start_time ?? existing?.start_time ?? "10:00").trim();
      if (!TIME_RE.test(start)) return null;
      start_time = start;
      const end = String(raw.end_time ?? existing?.end_time ?? defaultEndTime(start)).trim();
      if (!TIME_RE.test(end)) return null;
      if (parseTimeMinutes(end) <= parseTimeMinutes(start)) return null;
      end_time = end;
    }
    resolvedImportance = all_day ? "all_day" : "normal";
  }

  const recurrence = normalizeRecurrence(raw.recurrence ?? existing?.recurrence ?? "none");
  const description = String(raw.description ?? existing?.description ?? "").trim() || undefined;
  const created_by = isHouseholdUserId(raw.created_by)
    ? raw.created_by
    : defaultEventCreator(existing?.created_by);

  return {
    id: String(raw.id ?? existing?.id ?? "").trim() || randomUUID(),
    title,
    date,
    all_day,
    start_time,
    end_time,
    importance: resolvedImportance,
    description,
    recurrence,
    created_by,
    created_at: existing?.created_at,
    updated_at: existing?.updated_at,
  };
}

export type CalendarEventInput = {
  title: string;
  date: string;
  all_day?: boolean;
  start_time?: string;
  end_time?: string;
  importance?: CalendarImportance;
  description?: string;
  recurrence?: CalendarRecurrence;
  created_by?: HouseholdUserId;
};

export async function loadCalendarData(): Promise<CalendarData> {
  const data = await readCalendar();
  return {
    events: (data.events || [])
      .map((ev) => normalizeEvent(ev, ev) ?? ev)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)),
    feed_token: data.feed_token,
    updated_at: data.updated_at ?? null,
  };
}

async function saveCalendarData(data: CalendarData): Promise<CalendarData> {
  await writeCalendar(data);
  return loadCalendarData();
}

export async function ensureFeedToken(): Promise<string> {
  const data = await readCalendar();
  if (data.feed_token) return data.feed_token;
  const feed_token = generateFeedToken();
  await writeCalendar({ ...data, events: data.events || [], feed_token });
  return feed_token;
}

export async function regenerateFeedToken(): Promise<string> {
  const data = await readCalendar();
  const feed_token = generateFeedToken();
  await writeCalendar({ ...data, events: data.events || [], feed_token });
  return feed_token;
}

export async function verifyFeedToken(token: string | undefined): Promise<boolean> {
  if (!token?.trim()) return false;
  const data = await readCalendar();
  return !!data.feed_token && data.feed_token === token.trim();
}

export async function listCalendarEvents(): Promise<CalendarData & { feed_token: string }> {
  const feed_token = await ensureFeedToken();
  const data = await loadCalendarData();
  return { ...data, feed_token };
}

export async function addCalendarEvent(input: CalendarEventInput, defaultCreator?: HouseholdUserId): Promise<CalendarEvent> {
  const event = normalizeEvent({
    ...input,
    created_by: input.created_by ?? defaultCreator ?? "egor",
  });
  if (!event) throw new Error("Invalid event — check title, date, and times");
  const now = new Date().toISOString();
  event.created_at = now;
  event.updated_at = now;
  const data = await readCalendar();
  const events = [...(data.events || []), event];
  await saveCalendarData({ ...data, events, feed_token: data.feed_token || (await ensureFeedToken()) });
  return event;
}

export async function updateCalendarEvent(id: string, input: CalendarEventInput): Promise<CalendarEvent | null> {
  const data = await readCalendar();
  const existing = (data.events || []).find((e) => e.id === id);
  if (!existing) return null;
  const event = normalizeEvent({ ...input, id }, existing);
  if (!event) throw new Error("Invalid event — check title, date, and times");
  event.updated_at = new Date().toISOString();
  const events = (data.events || []).map((e) => (e.id === id ? event : e));
  await saveCalendarData({ ...data, events });
  return event;
}

export async function deleteCalendarEvent(id: string): Promise<boolean> {
  const data = await readCalendar();
  const before = data.events?.length ?? 0;
  const events = (data.events || []).filter((e) => e.id !== id);
  if (events.length === before) return false;
  await saveCalendarData({ ...data, events });
  return true;
}

function escapeIcs(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function dateToIcs(date: string): string {
  return date.replace(/-/g, "");
}

function timeToIcs(time: string): string {
  const [h, m] = time.split(":");
  return h.padStart(2, "0") + m.padStart(2, "0") + "00";
}

function recurrenceRule(recurrence: CalendarRecurrence | undefined): string | null {
  switch (recurrence) {
    case "yearly":
      return "FREQ=YEARLY";
    case "monthly":
      return "FREQ=MONTHLY";
    case "weekly":
      return "FREQ=WEEKLY";
    default:
      return null;
  }
}

function appendEventLines(lines: string[], ev: CalendarEvent, now: string): void {
  lines.push("BEGIN:VEVENT");
  lines.push("UID:" + ev.id + "@finance-app");
  lines.push("DTSTAMP:" + now);
  const dateIcs = dateToIcs(ev.date);

  if (isAllDay(ev)) {
    lines.push("DTSTART;VALUE=DATE:" + dateIcs);
    lines.push("DTEND;VALUE=DATE:" + dateToIcs(addDays(ev.date, 1)));
  } else if (ev.start_time && ev.end_time) {
    lines.push("DTSTART:" + dateIcs + "T" + timeToIcs(ev.start_time));
    lines.push("DTEND:" + dateIcs + "T" + timeToIcs(ev.end_time));
  }

  lines.push("SUMMARY:" + escapeIcs(ev.title));
  const creatorLabel = ev.created_by ? userProfile(ev.created_by).label : "";
  const creatorNote = creatorLabel ? `Added by ${creatorLabel}` : "";
  const description = [ev.description?.trim(), creatorNote].filter(Boolean).join("\n\n");
  if (description) lines.push("DESCRIPTION:" + escapeIcs(description));
  const rrule = recurrenceRule(ev.recurrence);
  if (rrule) lines.push("RRULE:" + rrule);
  const priority = icsPriority(ev.importance);
  if (priority) lines.push("PRIORITY:" + priority);
  lines.push("END:VEVENT");
}

function icsPriority(importance: CalendarImportance | undefined): string | null {
  switch (importance) {
    case "important":
      return "1";
    case "quick":
      return "9";
    case "normal":
      return "5";
    default:
      return null;
  }
}

export function buildIcsFeed(events: CalendarEvent[]): string {
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Finance App//Family Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Family Calendar",
  ];
  for (const ev of events) {
    appendEventLines(lines, ev, now);
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export async function getIcsFeed(): Promise<string> {
  const data = await loadCalendarData();
  return buildIcsFeed(data.events);
}
