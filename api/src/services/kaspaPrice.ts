/** Kaspa spot price in USDT. MEXC KASUSDT primary; CoinPaprika fallback; stale cache on errors. */
import { readKaspaPriceCache, writeKaspaPriceCache } from "../storage/index.js";

const MEXC_API = "https://api.mexc.com/api/v3/ticker/price";
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
  stale?: boolean;
};

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
  return {
    enabled: true,
    price_usdt: cached.priceUsdt,
    balance_kas: balance,
    portfolio_usdt: roundMoney(balance * cached.priceUsdt),
    updated_at: new Date(cached.fetchedAt).toISOString(),
    stale: stale || undefined,
  };
}

export async function getKaspaQuote(): Promise<KaspaQuote> {
  const now = Date.now();
  let cached = await loadCachedPrice();

  if (!cached || now - cached.fetchedAt > CACHE_MS) {
    const fresh = await refreshPrice();
    if (fresh != null) {
      cached = memoryCache;
    }
  }

  if (!cached) {
    throw new Error("Kaspa price unavailable");
  }

  return quoteFromCache(cached, now - cached.fetchedAt > CACHE_MS);
}
