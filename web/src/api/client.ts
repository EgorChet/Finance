import type {
  ExcludedItem,
  MerchantRules,
  MerchantRow,
  MonthItem,
  ReviewQueueItem,
  SpendingReport,
  Transaction,
} from "../types";
import type { ConfiguredCharge } from "../utils/fixedCharges";

const BASE = import.meta.env.VITE_API_URL || "";

function prefix(demo: boolean): string {
  return demo ? `${BASE}/api/demo` : `${BASE}/api`;
}

async function readApiError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as { error?: string };
    if (parsed.error) return parsed.error;
  } catch {
    /* plain text */
  }
  return text || `Request failed (${res.status})`;
}

function headers(token?: string): HeadersInit {
  const h: HeadersInit = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function get<T>(url: string, token?: string): Promise<T> {
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json() as Promise<T>;
}

async function post<T>(url: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: headers(token),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json() as Promise<T>;
}

async function put<T>(url: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(url, {
    method: "PUT",
    headers: headers(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json() as Promise<T>;
}

export async function authStatus() {
  return get<{ auth_required: boolean }>(`${BASE}/api/auth/status`);
}

export async function login(password: string) {
  return post<{ token: string; auth_required: boolean }>(`${BASE}/api/auth/login`, { password });
}

export async function fetchMonths(demo: boolean, token?: string) {
  return get<{
    months: MonthItem[];
    summary: { month: string; billing_date: string; total: number; transactions: number }[];
    demo_as_of?: string;
  }>(`${prefix(demo)}/months`, token);
}

export async function fetchReport(demo: boolean, month: string | null, token?: string) {
  const q = month ? `?month=${encodeURIComponent(month)}` : "";
  return get<SpendingReport>(`${prefix(demo)}/report${q}`, token);
}

export async function fetchFixedCharges(demo: boolean, token?: string) {
  return get<{ charges: ConfiguredCharge[] }>(`${prefix(demo)}/fixed-charges`, token);
}

export async function saveFixedCharges(charges: ConfiguredCharge[], token?: string) {
  return put<{ saved: boolean; charges: ConfiguredCharge[] }>(
    `${prefix(false)}/fixed-charges`,
    { charges },
    token,
  );
}

export async function fetchLivingBudget(demo: boolean, token?: string) {
  return get<{ segments: import("../utils/livingBudget").LivingBudgetSegment[] }>(
    `${prefix(demo)}/living-budget`,
    token,
  );
}

export async function saveLivingBudget(
  segments: import("../utils/livingBudget").LivingBudgetSegment[],
  token?: string,
) {
  return put<{ saved: boolean; segments: import("../utils/livingBudget").LivingBudgetSegment[] }>(
    `${prefix(false)}/living-budget`,
    { segments },
    token,
  );
}

export async function fetchRules(demo: boolean, token?: string) {
  return get<MerchantRules>(`${prefix(demo)}/rules`, token);
}

export async function saveRules(rules: MerchantRules, token?: string) {
  return put<{ saved: boolean }>(`${prefix(false)}/rules`, rules, token);
}

export async function saveRuleEntry(
  body: { hebrew: string; english: string; category?: string },
  token?: string,
) {
  return post<{ ok: boolean }>(`${prefix(false)}/rules/entry`, body, token);
}

export async function fetchMerchants(demo: boolean, month: string | null, token?: string) {
  const q = month ? `?month=${encodeURIComponent(month)}` : "";
  return get<MerchantRow[]>(`${prefix(demo)}/merchants${q}`, token);
}

export async function syncStatements(token?: string, autoTranslate = true) {
  return post<{ synced: string[]; total_months: number }>(
    `${prefix(false)}/sync`,
    { auto_translate: autoTranslate },
    token,
  );
}

export async function warmApi(token?: string) {
  return get<{ status: string; analyzer?: boolean }>(`${prefix(false)}/health?deep=1`, token);
}

export async function fetchAppConfig(token?: string) {
  return get<{ analyzer_wake_url: string | null; analyzer_wake_from_browser: boolean }>(
    `${prefix(false)}/config`,
    token,
  );
}

export type KaspaQuote = {
  enabled: true;
  price_usdt: number;
  balance_kas: number;
  portfolio_usdt: number;
  updated_at: string;
  source: string;
  stale?: boolean;
};

export async function fetchKaspaQuote(demo: boolean, token?: string, force = false) {
  const q = force ? "?refresh=1" : "";
  return get<KaspaQuote>(`${prefix(demo)}/kaspa${q}`, token);
}

export type FxcnQuote = {
  enabled: true;
  nav_usd: number;
  lots: number;
  portfolio_usd: number;
  updated_at: string;
  source: string;
  stale?: boolean;
};

export async function fetchFxcnQuote(demo: boolean, token?: string, force = false) {
  const q = force ? "?refresh=1" : "";
  return get<FxcnQuote>(`${prefix(demo)}/fxcn${q}`, token);
}

export type MarketSnapshot = {
  btc_usd: number;
  sp500: number;
  usd_ils: number;
  usd_rub: number;
  updated_at: string;
  stale?: boolean;
};

export async function fetchMarketSnapshot(demo: boolean, token?: string, force = false) {
  const q = force ? "?refresh=1" : "";
  return get<MarketSnapshot>(`${prefix(demo)}/market-snapshot${q}`, token);
}

/** Server-side wake — fallback when analyzer is on internal network. */
export async function warmAnalyzerService(token?: string) {
  const res = await fetch(`${prefix(false)}/warm-analyzer`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json() as Promise<{ ready: boolean }>;
}

export async function uploadStatement(
  file: File,
  statementType: "partial" | "final",
  token?: string,
  autoTranslate = true,
) {
  const form = new FormData();
  form.append("file", file);
  form.append("auto_translate", String(autoTranslate));
  form.append("statement_type", statementType);
  let res: Response;
  try {
    res = await fetch(`${prefix(false)}/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
  } catch {
    throw new Error(
      "Could not reach the API. If you just opened the app, wait ~30 seconds for Render to wake up and try again.",
    );
  }
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json();
}

export async function fetchReviewQueue(
  demo: boolean,
  opts: { month?: string; includeReviewed?: boolean; includeLabeled?: boolean; onePerMerchant?: boolean },
  token?: string,
) {
  const params = new URLSearchParams();
  if (opts.month) params.set("month", opts.month);
  if (opts.includeReviewed) params.set("include_reviewed", "true");
  if (opts.includeLabeled) params.set("include_labeled", "true");
  if (opts.onePerMerchant === false) params.set("one_per_merchant", "false");
  const q = params.toString() ? `?${params}` : "";
  return get<{ queue: ReviewQueueItem[]; total: number; reviewed_count: number }>(
    `${prefix(demo)}/review/queue${q}`,
    token,
  );
}

export async function fetchReviewSuggestion(hebrew: string, token?: string): Promise<string> {
  const q = encodeURIComponent(hebrew);
  const data = await get<{ english: string }>(`${prefix(false)}/review/suggest?hebrew=${q}`, token);
  return data.english || "";
}

export async function confirmReview(
  body: { hebrew: string; english: string; category?: string; mark_all_merchant?: boolean; keys?: string[] },
  token?: string,
) {
  return post<{ ok: boolean; reviewed_count: number }>(`${prefix(false)}/review/confirm`, body, token);
}

export async function resetReviewProgress(token?: string) {
  return post(`${prefix(false)}/review/progress/reset`, {}, token);
}

export async function fetchExclusions(demo: boolean, token?: string) {
  return get<{ entries: ExcludedItem[]; total: number }>(`${prefix(demo)}/exclusions`, token);
}

export async function addExclusion(
  body: { key?: string; note?: string; transaction?: Transaction },
  token?: string,
) {
  return post<{ ok: boolean; entry: ExcludedItem }>(`${prefix(false)}/exclusions`, body, token);
}

export async function removeExclusion(key: string, token?: string) {
  return post<{ ok: boolean }>(`${prefix(false)}/exclusions/remove`, { key }, token);
}

export type CalendarEvent = import("../types").CalendarEvent;

export type CalendarResponse = {
  events: CalendarEvent[];
  feed_token: string | null;
  updated_at?: string | null;
  demo?: boolean;
};

export function calendarFeedUrl(feedToken: string): string {
  const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  return `${base}/calendar/feed.ics?token=${encodeURIComponent(feedToken)}`;
}

export async function fetchCalendar(demo: boolean, token?: string) {
  return get<CalendarResponse>(`${prefix(demo)}/calendar`, token);
}

export async function addCalendarEvent(
  body: { title: string; date: string; description?: string },
  token?: string,
) {
  return post<{ ok: boolean; event: CalendarEvent }>(`${prefix(false)}/calendar/events`, body, token);
}

export async function deleteCalendarEvent(id: string, token?: string) {
  const res = await fetch(`${prefix(false)}/calendar/events/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json() as Promise<{ ok: boolean }>;
}

export async function regenerateCalendarFeedToken(token?: string) {
  return post<{ ok: boolean; feed_token: string }>(`${prefix(false)}/calendar/regenerate-token`, {}, token);
}
