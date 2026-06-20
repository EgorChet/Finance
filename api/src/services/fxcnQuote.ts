/** FXCN NAV from FinEx GraphQL (same data as finex-etf.ru/calc/nav). */
import { readFxcnPriceCache, writeFxcnPriceCache } from "../storage/index.js";

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

  return quoteFromCache(cached, now - cached.fetchedAt > CACHE_MS);
}
