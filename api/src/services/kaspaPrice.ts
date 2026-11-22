/** Kaspa spot price in USDT. MEXC KASUSDT primary; CoinPaprika fallback; stale cache on errors. */
import { readKaspaPriceCache, writeKaspaPriceCache } from "../storage/index.js";
import { allTimePct, investedUsd, percentChange } from "./investment.js";

const MEXC_API = "https://api.mexc.com/api/v3/ticker/price";
const MEXC_KLINES = "https://api.mexc.com/api/v3/klines";
const DAY_MS = 86_400_000;
const YEAR_OPEN_RETRY_MS = 3_600_000;
const COINPAPRIKA_URL = "https://api.coinpaprika.com/v1/tickers/kas-kaspa";
const CACHE_MS = 600_000;
const DEFAULT_BALANCE = 347_078.071;
const DEFAULT_MEXC_SYMBOL = "KASUSDT";
const USER_AGENT = "Finance/1.0 (kaspa-price)";

type MemoryCache = { priceUsdt: number; fetchedAt: number; source: string };

let memoryCache: MemoryCache | null = null;
let inflight: Promise<number | null> | null = null;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function kasBalance(): number {
  const raw = process.env.KAS_BALANCE?.trim();
  if (!raw) return DEFAULT_BALANCE;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_BALANCE;
}

function mexcSymbol(): string {
  return process.env.KAS_MEXC_SYMBOL?.trim() || DEFAULT_MEXC_SYMBOL;
}

export type KaspaQuote = {
  enabled: true;
  price_usdt: number;
  balance_kas: number;
  portfolio_usdt: number;
  updated_at: string;
  source: string;
  stale?: boolean;
  /** Price on 1 January (UTC) of this year, and the price change since then in percent. Absent when unknown. */
  year_open_usdt?: number;
  year_change_pct?: number;
  /** Change of the whole holding against the amount invested (server setting KAS_INVESTED_USD), in percent. */
  all_time_pct?: number;
};

function roundPrice(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

async function fetchFromMexc(): Promise<number | null> {
  const symbol = mexcSymbol();
  const res = await fetch(`${MEXC_API}?symbol=${encodeURIComponent(symbol)}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { price?: string };
  const price = Number(data.price);
  return Number.isFinite(price) && price > 0 ? price : null;
}

/**
 * Open of the 1 January daily candle (UTC). MEXC needs both startTime and endTime here:
 * with startTime alone it ignores the date and returns the latest candle.
 */
export async function fetchYearOpen(year: number): Promise<number | null> {
  const start = Date.UTC(year, 0, 1);
  const url = `${MEXC_KLINES}?symbol=${encodeURIComponent(mexcSymbol())}&interval=1d&startTime=${start}&endTime=${start + DAY_MS}&limit=1`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const rows = (await res.json()) as unknown;
  if (!Array.isArray(rows) || !Array.isArray(rows[0])) return null;
  const [openTime, open] = rows[0] as [number, string];
  if (openTime !== start) return null; // not the 1 January candle: never guess
  const price = Number(open);
  return Number.isFinite(price) && price > 0 ? price : null;
}

/** Percent change from `open` to `price`, one decimal. */
export function priceChangePct(open: number, price: number): number {
  return percentChange(open, price);
}

let yearOpenCache: { year: number; price: number } | null = null;
let yearOpenFailedAt = 0;

async function loadYearOpen(now: number): Promise<number | null> {
  const year = new Date(now).getUTCFullYear();
  if (yearOpenCache?.year === year) return yearOpenCache.price;
  if (now - yearOpenFailedAt < YEAR_OPEN_RETRY_MS) return null;
  try {
    const price = await fetchYearOpen(year);
    if (price != null) {
      yearOpenCache = { year, price };
      return price;
    }
  } catch {
    /* no history: the quote simply has no year change */
  }
  yearOpenFailedAt = now;
  return null;
}

async function fetchFromCoinPaprika(): Promise<number | null> {
  const res = await fetch(COINPAPRIKA_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const data = (await res.json()) as { quotes?: { USD?: { price?: number } } };
  const price = data.quotes?.USD?.price;
  return price != null && Number.isFinite(price) && price > 0 ? price : null;
}

async function persistPrice(price: number, source: string): Promise<void> {
  const now = Date.now();
  memoryCache = { priceUsdt: price, fetchedAt: now, source };
  await writeKaspaPriceCache({
    updated_at: new Date(now).toISOString(),
    price_usdt: price,
    source,
  });
}

async function refreshPrice(): Promise<number | null> {
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      let price = await fetchFromMexc();
      if (price != null) {
        await persistPrice(price, "mexc");
        return price;
      }

      price = await fetchFromCoinPaprika();
      if (price != null) {
        await persistPrice(price, "coinpaprika");
        return price;
      }

      return null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

async function loadCachedPrice(): Promise<MemoryCache | null> {
  if (memoryCache) return memoryCache;

  const stored = await readKaspaPriceCache();
  if (stored.price_usdt > 0 && stored.updated_at) {
    memoryCache = {
      priceUsdt: stored.price_usdt,
      fetchedAt: new Date(stored.updated_at).getTime(),
      source: stored.source ?? "cache",
    };
    return memoryCache;
  }

  return null;
}

function quoteFromCache(cached: MemoryCache, stale: boolean): KaspaQuote {
  const balance = kasBalance();
  const price = roundPrice(cached.priceUsdt);
  return {
    enabled: true,
    price_usdt: price,
    balance_kas: balance,
    portfolio_usdt: roundMoney(balance * price),
    updated_at: new Date(cached.fetchedAt).toISOString(),
    source: cached.source,
    stale: stale || undefined,
    all_time_pct: allTimePct(roundMoney(balance * price), investedUsd("KAS_INVESTED_USD")),
  };
}

function cacheNeedsRefresh(cached: MemoryCache | null, now: number): boolean {
  if (!cached) return true;
  if (now - cached.fetchedAt > CACHE_MS) return true;
  // After switching to MEXC, replace older provider entries even if still "fresh".
  if (cached.source !== "mexc") return true;
  return false;
}

export async function getKaspaQuote(options?: { force?: boolean }): Promise<KaspaQuote> {
  const force = options?.force ?? false;
  const now = Date.now();

  if (force) {
    memoryCache = null;
  }

  let cached = force ? null : await loadCachedPrice();

  if (force || cacheNeedsRefresh(cached, now)) {
    const fresh = await refreshPrice();
    if (fresh != null) {
      cached = memoryCache;
    }
  }

  if (!cached) {
    throw new Error("Kaspa price unavailable");
  }

  const quote = quoteFromCache(cached, now - cached.fetchedAt > CACHE_MS);
  const open = await loadYearOpen(now);
  if (open != null) {
    quote.year_open_usdt = roundPrice(open);
    quote.year_change_pct = priceChangePct(open, quote.price_usdt);
  }
  return quote;
}
