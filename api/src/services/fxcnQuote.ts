/** FXCN NAV from FinEx GraphQL (same data as finex-etf.ru/calc/nav). */
import { readFxcnPriceCache, writeFxcnPriceCache } from "../storage/index.js";
import { percentChange } from "./investment.js";

const FINEX_GRAPHQL = "https://api.finex-etf.ru/graphql/";
const FINEX_TICKER = "FXCN";
const CACHE_MS = 6 * 60 * 60 * 1000; // ~4 refreshes per day; NAV updates infrequently
const DEFAULT_LOTS = 488;
const USER_AGENT = "Finance/1.0 (fxcn-quote)";

const NAV_QUERY = `
  query FxcnNav {
    fonds(first: 100) {
      edges {
        node {
          ticker
          navPerShare
          currencyNav
        }
      }
    }
  }
`;

const ID_QUERY = `query FxcnId { fonds(first: 100) { edges { node { id ticker } } } }`;
const HISTORY_QUERY = `
  query FxcnHistory($id: ID!) {
    fond(id: $id) { fondhistorySet(last: 400) { edges { node { date value } } } }
  }
`;
const YEAR_START_RETRY_MS = 3_600_000;

type MemoryCache = { navUsd: number; fetchedAt: number; source: string };

let memoryCache: MemoryCache | null = null;
let inflight: Promise<number | null> | null = null;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundNav(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function fxcnLots(): number {
  const raw = process.env.FXCN_LOTS?.trim();
  if (!raw) return DEFAULT_LOTS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_LOTS;
}

export type FxcnQuote = {
  enabled: true;
  nav_usd: number;
  lots: number;
  portfolio_usd: number;
  updated_at: string;
  source: string;
  stale?: boolean;
  /** Change of the whole holding against the amount invested, in percent. Added by the route, for the owner only. */
  all_time_pct?: number;
  /** NAV at the end of last year, and the change since then in percent. Absent when unknown. */
  year_open_nav_usd?: number;
  year_change_pct?: number;
  /** Date (YYYY-MM-DD) of the latest NAV the fund published: old when the fund has stopped trading. */
  nav_date?: string;
};

async function fetchFromFinex(): Promise<number | null> {
  const res = await fetch(FINEX_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({ query: NAV_QUERY }),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    data?: {
      fonds?: {
        edges?: { node?: { ticker?: string; navPerShare?: number; currencyNav?: string } | null }[];
      };
    };
  };

  const edges = data.data?.fonds?.edges ?? [];
  const node = edges.map((e) => e.node).find((n) => n?.ticker === FINEX_TICKER);
  const nav = node?.navPerShare;
  if (nav == null || !Number.isFinite(nav) || nav <= 0) return null;
  return nav;
}

type NavPoint = { date?: string; value?: number };

/** The last published NAV dated before 1 January of `year` (the close of the year before); null when none. */
export function pickYearStartNav(points: NavPoint[], year: number): number | null {
  const limit = `${year}-01-01`;
  let best: NavPoint | null = null;
  for (const p of points) {
    if (typeof p.date !== "string" || p.date >= limit) continue;
    if (typeof p.value !== "number" || !Number.isFinite(p.value) || p.value <= 0) continue;
    if (!best || p.date > (best.date as string)) best = p;
  }
  return best ? (best.value as number) : null;
}

async function finexQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T | null> {
  const res = await fetch(FINEX_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) return null;
  return ((await res.json()) as { data?: T }).data ?? null;
}

/** Date of the newest valid NAV point (YYYY-MM-DD), or null. The fund may have stopped publishing. */
export function latestNavDate(points: NavPoint[]): string | null {
  let best: string | null = null;
  for (const p of points) {
    if (typeof p.date !== "string" || typeof p.value !== "number" || !(p.value > 0)) continue;
    if (!best || p.date > best) best = p.date;
  }
  return best;
}

async function fetchNavHistory(): Promise<NavPoint[] | null> {
  const ids = await finexQuery<{ fonds?: { edges?: { node?: { id?: string; ticker?: string } | null }[] } }>(ID_QUERY);
  const id = ids?.fonds?.edges?.map((e) => e.node).find((n) => n?.ticker === FINEX_TICKER)?.id;
  if (!id) return null;
  const hist = await finexQuery<{ fond?: { fondhistorySet?: { edges?: { node?: NavPoint | null }[] } } }>(HISTORY_QUERY, { id });
  const edges = hist?.fond?.fondhistorySet?.edges;
  if (!edges) return null;
  return edges.map((e) => e.node).filter((n): n is NavPoint => !!n);
}

type HistoryInfo = { year: number; fetchedAt: number; yearStartNav: number | null; latestDate: string | null };
let historyCache: HistoryInfo | null = null;
let historyFailedAt = 0;

/** Start-of-year NAV and the date of the latest NAV, read together from the fund history (cached like the quote). */
async function loadHistoryInfo(now: number): Promise<HistoryInfo | null> {
  const year = new Date(now).getUTCFullYear();
  if (historyCache?.year === year && now - historyCache.fetchedAt < CACHE_MS) return historyCache;
  if (now - historyFailedAt >= YEAR_START_RETRY_MS) {
    try {
      const points = await fetchNavHistory();
      if (points) {
        historyCache = { year, fetchedAt: now, yearStartNav: pickYearStartNav(points, year), latestDate: latestNavDate(points) };
        return historyCache;
      }
    } catch {
      /* no history: the quote simply has no year change */
    }
    historyFailedAt = now;
  }
  return historyCache?.year === year ? historyCache : null; // an older answer of this year beats none
}

async function persistNav(navUsd: number, source: string): Promise<void> {
  const now = Date.now();
  memoryCache = { navUsd, fetchedAt: now, source };
  await writeFxcnPriceCache({
    updated_at: new Date(now).toISOString(),
    nav_usd: navUsd,
    source,
  });
}

async function refreshNav(): Promise<number | null> {
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const nav = await fetchFromFinex();
      if (nav != null) {
        await persistNav(nav, "finex");
        return nav;
      }
      return null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

async function loadCachedNav(): Promise<MemoryCache | null> {
  if (memoryCache) return memoryCache;

  const stored = await readFxcnPriceCache();
  if (stored.nav_usd > 0 && stored.updated_at) {
    memoryCache = {
      navUsd: stored.nav_usd,
      fetchedAt: new Date(stored.updated_at).getTime(),
      source: stored.source ?? "cache",
    };
    return memoryCache;
  }

  return null;
}

function quoteFromCache(cached: MemoryCache, stale: boolean): FxcnQuote {
  const lots = fxcnLots();
  const nav = roundNav(cached.navUsd);
  return {
    enabled: true,
    nav_usd: nav,
    lots,
    portfolio_usd: roundMoney(lots * nav),
    updated_at: new Date(cached.fetchedAt).toISOString(),
    source: cached.source,
    stale: stale || undefined,
  };
}

export async function getFxcnQuote(options?: { force?: boolean }): Promise<FxcnQuote> {
  const force = options?.force ?? false;
  const now = Date.now();

  if (force) {
    memoryCache = null;
  }

  let cached = force ? null : await loadCachedNav();

  if (force || !cached || now - cached.fetchedAt > CACHE_MS) {
    const fresh = await refreshNav();
    if (fresh != null) {
      cached = memoryCache;
    }
  }

  if (!cached) {
    throw new Error("FXCN NAV unavailable");
  }

  const quote = quoteFromCache(cached, now - cached.fetchedAt > CACHE_MS);
  const info = await loadHistoryInfo(now);
  if (info?.yearStartNav != null) {
    quote.year_open_nav_usd = roundNav(info.yearStartNav);
    quote.year_change_pct = percentChange(info.yearStartNav, quote.nav_usd);
  }
  if (info?.latestDate) quote.nav_date = info.latestDate;
  return quote;
}
