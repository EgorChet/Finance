import { combineScopedReports } from "@core/spending/combineScoped";
import type {
  ExcludedItem,
  MerchantRules,
  MonthItem,
  ReviewQueueItem,
  SpendingReport,
  Transaction,
} from "@/shared/types";
import type { ConfiguredCharge } from "@/features/household/utils/fixedCharges";

import { demoRequest } from "@/shared/demo/backend";

const BASE = import.meta.env.VITE_API_URL || "";

/** In the demo every call is answered in the browser (edits stay on this device). */
let demoActive = (() => {
  try {
    return !localStorage.getItem("finance_auth_token");
  } catch {
    return true;
  }
})();
export function setDemoActive(active: boolean): void {
  demoActive = active;
}
export function isDemoActive(): boolean {
  return demoActive;
}

/** Async so screens see the same timing as a real request. */
async function viaDemo<T>(method: string, url: string, body?: unknown): Promise<T | undefined> {
  if (!demoActive) return undefined;
  const hit = demoRequest(method, url, body);
  if (!hit) return undefined;
  await Promise.resolve();
  return hit.data as T;
}

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
  const demo = await viaDemo<T>("GET", url);
  if (demo !== undefined) return demo;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json() as Promise<T>;
}

async function post<T>(url: string, body?: unknown, token?: string): Promise<T> {
  const demo = await viaDemo<T>("POST", url, body);
  if (demo !== undefined) return demo;
  const res = await fetch(url, {
    method: "POST",
    headers: headers(token),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json() as Promise<T>;
}

async function put<T>(url: string, body: unknown, token?: string): Promise<T> {
  const demo = await viaDemo<T>("PUT", url, body);
  if (demo !== undefined) return demo;
  const res = await fetch(url, {
    method: "PUT",
    headers: headers(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json() as Promise<T>;
}

async function del<T>(url: string, token?: string): Promise<T> {
  const demo = await viaDemo<T>("DELETE", url);
  if (demo !== undefined) return demo;
  const res = await fetch(url, { method: "DELETE", headers: headers(token) });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json() as Promise<T>;
}

export async function authStatus() {
  return get<{ auth_required: boolean }>(`${BASE}/api/auth/status`);
}

type AuthUser = { id: import("@/shared/types").HouseholdUserId; label: string };

export async function fetchAuthMe(token?: string) {
  return get<{
    user: import("@/shared/types").HouseholdUserId;
    label: string;
    users?: AuthUser[];
  }>(`${BASE}/api/auth/me`, token);
}

export async function login(password: string, username: string) {
  return post<{
    token: string;
    auth_required: boolean;
    user: import("@/shared/types").HouseholdUserId;
    label: string;
    users?: AuthUser[];
  }>(`${BASE}/api/auth/login`, { password, username });
}

export async function fetchMonths(demo: boolean, token?: string) {
  return get<{
    months: MonthItem[];
    summary: { month: string; billing_date: string; total: number; transactions: number }[];
    demo_as_of?: string;
  }>(`${prefix(demo)}/months`, token);
}

export async function fetchHomeData(demo: boolean, token?: string, paceMonths = 4) {
  const q = `?lean=1${paceMonths > 0 ? `&pace_months=${paceMonths}` : ""}`;
  const bundle = await get<{
    months: MonthItem[];
    summary: { month: string; billing_date: string; total: number; transactions: number }[];
    report: SpendingReport | null;
    scoped_reports?: Record<string, SpendingReport>;
    pace_keys?: string[];
    pace_months?: number;
    pace_months_requested?: number;
    fixed_charges: ConfiguredCharge[];
    regular_charges?: import("@core/spending/regularCharges").RegularChargeOverrides;
    living_budget: {
      segments: import("@/features/household/utils/livingBudget").LivingBudgetSegment[];
      month_topups: import("@/features/household/utils/livingBudget").LivingBudgetMonthTopup[];
    };
    demo_as_of?: string;
  }>(`${prefix(demo)}/home-data${q}`, token);
  if (!bundle.report && bundle.scoped_reports) {
    bundle.report = combineScopedReports(Object.values(bundle.scoped_reports));
  }
  return bundle;
}

/** Remove one uploaded statement (billing key YYYY-MM-DD or legacy bucket like `unknown`). */
export async function deleteStatementMonth(monthKey: string, token?: string) {
  return del<{ ok: boolean; key: string; total_months: number }>(
    `${prefix(false)}/statements/${encodeURIComponent(monthKey)}`,
    token,
  );
}

export type ReportFetchOpts = {
  from?: string;
  to?: string;
  /** Recent billing keys count (excludes single-month `month` param). */
  months?: number;
};

export async function fetchReport(
  demo: boolean,
  month: string | null,
  token?: string,
  opts?: ReportFetchOpts,
) {
  const params = new URLSearchParams();
  if (month) params.set("month", month);
  else if (opts?.from && opts?.to) {
    params.set("from", opts.from);
    params.set("to", opts.to);
  } else if (opts?.months != null && opts.months > 0) {
    params.set("months", String(opts.months));
  }
  const q = params.toString() ? `?${params}` : "";
  return get<SpendingReport>(`${prefix(demo)}/report${q}`, token);
}

export async function saveRegularCharges(
  overrides: import("@core/spending/regularCharges").RegularChargeOverrides,
  token?: string,
) {
  return put<{ saved: boolean; overrides: import("@core/spending/regularCharges").RegularChargeOverrides }>(
    `${prefix(false)}/regular-charges`,
    { overrides },
    token,
  );
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
  return get<{
    segments: import("@/features/household/utils/livingBudget").LivingBudgetSegment[];
    month_topups: import("@/features/household/utils/livingBudget").LivingBudgetMonthTopup[];
  }>(`${prefix(demo)}/living-budget`, token);
}

export async function saveLivingBudget(
  payload: {
    segments: import("@/features/household/utils/livingBudget").LivingBudgetSegment[];
    month_topups?: import("@/features/household/utils/livingBudget").LivingBudgetMonthTopup[];
  },
  token?: string,
) {
  return put<{
    saved: boolean;
    segments: import("@/features/household/utils/livingBudget").LivingBudgetSegment[];
    month_topups: import("@/features/household/utils/livingBudget").LivingBudgetMonthTopup[];
  }>(`${prefix(false)}/living-budget`, payload, token);
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

export async function syncStatements(token?: string, autoTranslate = true) {
  return post<{ synced: string[]; total_months: number }>(
    `${prefix(false)}/sync`,
    { auto_translate: autoTranslate },
    token,
  );
}

export type CalSyncJob = {
  jobId: string;
  status: "waking" | "starting" | "logging_in" | "exporting" | "uploading" | "done" | "error";
  message: string;
  error?: string;
  result?: { key?: string; provisional?: boolean; skipped?: boolean };
};

export async function startCalSync(token?: string) {
  return post<CalSyncJob>(`${prefix(false)}/cal/sync`, {}, token);
}

export async function fetchCalSyncJob(jobId: string, token?: string) {
  return get<CalSyncJob>(`${prefix(false)}/cal/sync/${encodeURIComponent(jobId)}`, token);
}

export async function fetchAppConfig(token?: string) {
  return get<{
    analyzer_wake_url: string | null;
    analyzer_wake_from_browser: boolean;
  }>(`${prefix(false)}/config`, token);
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
  if (demoActive) return { ready: true };
  const res = await fetch(`${prefix(false)}/warm-analyzer`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json() as Promise<{ ready: boolean }>;
}

export interface UploadStatementResult {
  key?: string;
  provisional?: boolean;
  skipped?: boolean;
  upgraded?: boolean;
  reason?: string;
  report?: SpendingReport;
}

export type UploadJobStatus = "queued" | "waking" | "analyzing" | "done" | "error";

export type UploadJobResponse = {
  jobId: string;
  status: UploadJobStatus;
  message: string;
  filename: string;
  statement_type: "partial" | "final";
  created_at: string;
  updated_at: string;
  result?: UploadStatementResult;
  error?: string;
};

/** Background upload — returns as soon as the server has the file. */
export async function startUploadJob(
  file: File,
  statementType: "partial" | "final",
  token?: string,
  autoTranslate = true,
): Promise<UploadJobResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("auto_translate", String(autoTranslate));
  form.append("statement_type", statementType);
  if (demoActive) demoRequest("POST", `${prefix(false)}/upload/jobs`);
  let res: Response;
  try {
    res = await fetch(`${prefix(false)}/upload/jobs`, {
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

export async function fetchUploadJob(jobId: string, token?: string): Promise<UploadJobResponse> {
  return get<UploadJobResponse>(`${prefix(false)}/upload/jobs/${encodeURIComponent(jobId)}`, token);
}

export async function uploadStatement(
  file: File,
  statementType: "partial" | "final",
  token?: string,
  autoTranslate = true,
): Promise<UploadStatementResult> {
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

export interface LabelHints {
  translation: string;
  bank_category: string | null;
  bank_category_he: string | null;
  same_day: { merchant: string; category: string; amount: number }[];
  history: { date: string; amount: number }[];
  /** Totoshka's guess, when it has made one. */
  ai: { english_name: string; category: string; confidence: "low" | "medium" | "high"; reason: string; at?: string } | null;
  ai_status: "ok" | "waiting";
}

/** Translation, same-day charges, history and Claude's guess for one merchant in Review. */
export async function fetchLabelHints(
  demo: boolean,
  transaction: Pick<Transaction, "merchant_he" | "date" | "charge_amount" | "category_he" | "category_en">,
  token?: string,
) {
  return post<LabelHints>(
    `${prefix(demo)}/review/hints`,
    {
      transaction: {
        merchant_he: transaction.merchant_he,
        date: transaction.date,
        charge_amount: transaction.charge_amount,
        category_he: transaction.category_he,
        category_en: transaction.category_en,
      },
    },
    token,
  );
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

export async function fetchAdjustments(demo: boolean, token?: string) {
  return get<{ entries: import("@/shared/types").AdjustmentItem[]; total: number }>(
    `${prefix(demo)}/adjustments`,
    token,
  );
}

export async function upsertAdjustment(
  body: { key?: string; reimbursement: number; note?: string; transaction?: Transaction },
  token?: string,
) {
  return post<{ ok: boolean; entry: import("@/shared/types").AdjustmentItem }>(
    `${prefix(false)}/adjustments`,
    body,
    token,
  );
}

/** Category for one charge (e.g. what a BIT transfer was for); null restores the merchant's category. */
export async function setChargeCategory(
  transaction: Pick<Transaction, "date" | "merchant_he" | "charge_amount">,
  category: string | null,
  token?: string,
) {
  return post<{ ok: boolean; key: string; category: string | null }>(
    `${prefix(false)}/adjustments/category`,
    { transaction: { date: transaction.date, merchant_he: transaction.merchant_he, charge_amount: transaction.charge_amount }, category },
    token,
  );
}

export async function removeAdjustment(key: string, token?: string) {
  return post<{ ok: boolean }>(`${prefix(false)}/adjustments/remove`, { key }, token);
}

export async function fetchPaceSettings(token?: string) {
  return get<import("@core/spending/paceSettings").PaceSettings>(`${prefix(false)}/settings`, token);
}

export async function savePaceSettings(
  settings: import("@core/spending/paceSettings").PaceSettings,
  token?: string,
) {
  return put<import("@core/spending/paceSettings").PaceSettings>(`${prefix(false)}/settings`, settings, token);
}
