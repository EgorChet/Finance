/** BTC, S&P 500, and USD→ILS/RUB for the side menu market panel. */
const MEXC_API = "https://api.mexc.com/api/v3/ticker/price";
const YAHOO_SP500 = "https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=1d";
const FRANKFURTER = "https://api.frankfurter.dev/v2/rates?base=USD&quotes=ILS,RUB";
const CACHE_MS = 600_000;
const USER_AGENT = "Finance/1.0 (market-snapshot)";

export type MarketSnapshot = {
  btc_usd: number;
  sp500: number;
  usd_ils: number;
  usd_rub: number;
  updated_at: string;
  stale?: boolean;
};

type MemoryCache = MarketSnapshot & { fetchedAt: number };

let memoryCache: MemoryCache | null = null;
let inflight: Promise<MarketSnapshot> | null = null;

async function fetchBtcUsd(): Promise<number | null> {
  const res = await fetch(`${MEXC_API}?symbol=BTCUSDT`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { price?: string };
  const price = Number(data.price);
  return Number.isFinite(price) && price > 0 ? price : null;
}

async function fetchSp500(): Promise<number | null> {
  const res = await fetch(YAHOO_SP500, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    chart?: { result?: { meta?: { regularMarketPrice?: number } }[] };
  };
  const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
  return price != null && Number.isFinite(price) && price > 0 ? price : null;
}

async function fetchUsdFx(): Promise<{ usd_ils: number; usd_rub: number } | null> {
  const res = await fetch(FRANKFURTER, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const data = (await res.json()) as { rates?: { ILS?: number; RUB?: number } };
  const usd_ils = data.rates?.ILS;
  const usd_rub = data.rates?.RUB;
  if (
    usd_ils == null ||
    usd_rub == null ||
    !Number.isFinite(usd_ils) ||
    !Number.isFinite(usd_rub) ||
    usd_ils <= 0 ||
    usd_rub <= 0
  ) {
    return null;
  }
  return { usd_ils, usd_rub };
}

function snapshotFromCache(cache: MemoryCache, stale: boolean): MarketSnapshot {
  return {
    btc_usd: cache.btc_usd,
    sp500: cache.sp500,
    usd_ils: cache.usd_ils,
    usd_rub: cache.usd_rub,
    updated_at: cache.updated_at,
    stale: stale || undefined,
  };
}

async function refreshSnapshot(): Promise<MarketSnapshot> {
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const [btc, sp500, fx] = await Promise.all([fetchBtcUsd(), fetchSp500(), fetchUsdFx()]);
      const prev = memoryCache;
      const now = Date.now();

      const next: MemoryCache = {
        btc_usd: btc ?? prev?.btc_usd ?? 0,
        sp500: sp500 ?? prev?.sp500 ?? 0,
        usd_ils: fx?.usd_ils ?? prev?.usd_ils ?? 0,
        usd_rub: fx?.usd_rub ?? prev?.usd_rub ?? 0,
        updated_at: new Date(now).toISOString(),
        fetchedAt: now,
      };

      const hasAny = next.btc_usd > 0 || next.sp500 > 0 || (next.usd_ils > 0 && next.usd_rub > 0);
      if (!hasAny) {
        if (prev) return snapshotFromCache(prev, true);
        throw new Error("Market snapshot unavailable");
      }

      const partial = btc == null || sp500 == null || fx == null;
      memoryCache = next;
      return snapshotFromCache(next, partial);
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export async function getMarketSnapshot(opts?: { force?: boolean }): Promise<MarketSnapshot> {
  const force = opts?.force === true;
  const now = Date.now();

  if (!force && memoryCache && now - memoryCache.fetchedAt < CACHE_MS) {
    return snapshotFromCache(memoryCache, false);
  }

  return refreshSnapshot();
}
