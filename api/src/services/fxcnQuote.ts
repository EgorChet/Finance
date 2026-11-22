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

export async function fetchYearStartNav(year: number): Promise<number | null> {
  const ids = await finexQuery<{ fonds?: { edges?: { node?: { id?: string; ticker?: string } | null }[] } }>(ID_QUERY);
  const id = ids?.fonds?.edges?.map((e) => e.node).find((n) => n?.ticker === FINEX_TICKER)?.id;
  if (!id) return null;
  const hist = await finexQuery<{ fond?: { fondhistorySet?: { edges?: { node?: NavPoint | null }[] } } }>(HISTORY_QUERY, { id });
  const points = (hist?.fond?.fondhistorySet?.edges ?? []).map((e) => e.node).filter((n): n is NavPoint => !!n);
  return pickYearStartNav(points, year);
}

let yearStartCache: { year: number; nav: number } | null = null;
let yearStartFailedAt = 0;

async function loadYearStartNav(now: number): Promise<number | null> {
  const year = new Date(now).getUTCFullYear();
  if (yearStartCache?.year === year) return yearStartCache.nav;
  if (now - yearStartFailedAt < YEAR_START_RETRY_MS) return null;
  try {
    const nav = await fetchYearStartNav(year);
    if (nav != null) {
      yearStartCache = { year, nav };
      return nav;
    }
  } catch {
    /* no history: the quote simply has no year change */
  }
  yearStartFailedAt = now;
  return null;
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
  const open = await loadYearStartNav(now);
  if (open != null) {
    quote.year_open_nav_usd = roundNav(open);
    quote.year_change_pct = percentChange(open, quote.nav_usd);
  }
  return quote;
}
