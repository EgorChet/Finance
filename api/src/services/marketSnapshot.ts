/** BTC, KAS, S&P 500, ProShares Short Dow30 (DOG) and USD→ILS/RUB for the side menu market panel. */
const MEXC_24H = "https://api.mexc.com/api/v3/ticker/24hr";
const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";
const FRANKFURTER = "https://api.frankfurter.dev/v2/rates?base=USD&quotes=ILS,RUB";
const CACHE_MS = 600_000;
const USER_AGENT = "Finance/1.0 (market-snapshot)";

/** Last price and the change since the previous close (or 24 h ago for crypto), in percent. */
type Quote = { price: number; changePct: number | null };

export type MarketSnapshot = {
  btc_usd: number;
  sp500: number;
  kas_usd?: number;
  /** ProShares Short Dow30 (DOG). */
  dog_usd?: number;
  /** Day change in percent per ticker; a missing key means the source gave none. */
  change_pct?: { btc?: number; kas?: number; sp500?: number; dog?: number };
  usd_ils: number;
  usd_rub: number;
  updated_at: string;
  stale?: boolean;
};

type MemoryCache = MarketSnapshot & { fetchedAt: number };

let memoryCache: MemoryCache | null = null;
let inflight: Promise<MarketSnapshot> | null = null;

async function fetchMexc(symbol: string): Promise<Quote | null> {
  const res = await fetch(`${MEXC_24H}?symbol=${symbol}`, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const data = (await res.json()) as { lastPrice?: string; openPrice?: string };
  const price = Number(data.lastPrice);
  if (!Number.isFinite(price) || price <= 0) return null;
  const open = Number(data.openPrice);
  return { price, changePct: Number.isFinite(open) && open > 0 ? ((price - open) / open) * 100 : null };
}

async function fetchYahoo(symbol: string): Promise<Quote | null> {
  const res = await fetch(`${YAHOO_CHART}/${encodeURIComponent(symbol)}?interval=1d&range=1d`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    chart?: { result?: { meta?: { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number } }[] };
  };
  const meta = data.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  const prev = meta?.chartPreviousClose ?? meta?.previousClose;
  return { price, changePct: prev != null && Number.isFinite(prev) && prev > 0 ? ((price - prev) / prev) * 100 : null };
}

const orNull = <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

async function fetchUsdFx(): Promise<{ usd_ils: number; usd_rub: number } | null> {
  const res = await fetch(FRANKFURTER, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  // The v2 endpoint answers with a list of {quote, rate}; the older shape was {rates: {ILS, RUB}}.
  const data = (await res.json()) as unknown;
  const rateOf = (code: "ILS" | "RUB"): number | undefined => {
    if (Array.isArray(data)) return (data as { quote?: string; rate?: number }[]).find((r) => r.quote === code)?.rate;
    return (data as { rates?: Record<string, number> } | null)?.rates?.[code];
  };
  const usd_ils = rateOf("ILS");
  const usd_rub = rateOf("RUB");
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
    kas_usd: cache.kas_usd,
    dog_usd: cache.dog_usd,
    change_pct: cache.change_pct,
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
      const [btc, kas, sp500, dog, fx] = await Promise.all([
        orNull(fetchMexc("BTCUSDT")),
        orNull(fetchMexc("KASUSDT")),
        orNull(fetchYahoo("^GSPC")),
        orNull(fetchYahoo("DOG")),
        orNull(fetchUsdFx()),
      ]);
      const prev = memoryCache;
      const now = Date.now();

      const next: MemoryCache = {
        btc_usd: btc?.price ?? prev?.btc_usd ?? 0,
        sp500: sp500?.price ?? prev?.sp500 ?? 0,
        kas_usd: kas?.price ?? prev?.kas_usd,
        dog_usd: dog?.price ?? prev?.dog_usd,
        change_pct: {
          btc: btc ? btc.changePct ?? undefined : prev?.change_pct?.btc,
          kas: kas ? kas.changePct ?? undefined : prev?.change_pct?.kas,
          sp500: sp500 ? sp500.changePct ?? undefined : prev?.change_pct?.sp500,
          dog: dog ? dog.changePct ?? undefined : prev?.change_pct?.dog,
        },
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

      const partial = btc == null || kas == null || sp500 == null || dog == null || fx == null;
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
