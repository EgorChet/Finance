import { randomBytes, randomUUID } from "crypto";
import { readCalendar, writeCalendar } from "../storage/index.js";
import type { CalendarData, CalendarEvent } from "../types.js";

function generateFeedToken(): string {
  return randomBytes(24).toString("base64url");
}

function normalizeEvent(raw: Partial<CalendarEvent>): CalendarEvent | null {
  const title = String(raw.title ?? "").trim();
  const date = String(raw.date ?? "").trim().slice(0, 10);
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    id: String(raw.id ?? "").trim() || randomUUID(),
    title,
    date,
    description: raw.description?.trim() || undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

export async function loadCalendarData(): Promise<CalendarData> {
  const data = await readCalendar();
  return {
    events: (data.events || []).slice().sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)),
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

export async function addCalendarEvent(input: {
  title: string;
  date: string;
  description?: string;
}): Promise<CalendarEvent> {
  const event = normalizeEvent(input);
  if (!event) throw new Error("title and date (YYYY-MM-DD) required");
  const now = new Date().toISOString();
  event.created_at = now;
  event.updated_at = now;
  const data = await readCalendar();
  const events = [...(data.events || []), event];
  await saveCalendarData({ ...data, events, feed_token: data.feed_token || (await ensureFeedToken()) });
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
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.id}@finance-app`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART;VALUE=DATE:${ev.date.replace(/-/g, "")}`);
    lines.push(`DTEND;VALUE=DATE:${addDays(ev.date, 1).replace(/-/g, "")}`);
    lines.push(`SUMMARY:${escapeIcs(ev.title)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeIcs(ev.description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export async function getIcsFeed(): Promise<string> {
  const data = await loadCalendarData();
  return buildIcsFeed(data.events);
}
