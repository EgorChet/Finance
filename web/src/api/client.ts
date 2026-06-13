import type {
  MerchantRules,
  MerchantRow,
  MonthItem,
  ReviewQueueItem,
  SpendingReport,
} from "../types";
import type { ConfiguredCharge } from "../utils/fixedCharges";

const BASE = import.meta.env.VITE_API_URL || "";

function prefix(demo: boolean): string {
  return demo ? `${BASE}/api/demo` : `${BASE}/api`;
}

function headers(token?: string): HeadersInit {
  const h: HeadersInit = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function get<T>(url: string, token?: string): Promise<T> {
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

async function post<T>(url: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: headers(token),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

async function put<T>(url: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(url, {
    method: "PUT",
    headers: headers(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
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
  }>(`${prefix(demo)}/months`, token);
}

export async function fetchReport(demo: boolean, month: string | null, token?: string) {
  const q = month ? `?month=${encodeURIComponent(month)}` : "";
  return get<SpendingReport>(`${prefix(demo)}/report${q}`, token);
}

export async function fetchFixedCharges(demo: boolean, token?: string) {
  return get<{ charges: ConfiguredCharge[] }>(`${prefix(demo)}/fixed-charges`, token);
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

export async function uploadStatement(file: File, token?: string, autoTranslate = true) {
  const form = new FormData();
  form.append("file", file);
  form.append("auto_translate", String(autoTranslate));
  const res = await fetch(`${prefix(false)}/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
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
