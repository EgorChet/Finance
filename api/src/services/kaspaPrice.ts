/** Kaspa spot price (USD ≈ USDT). CoinPaprika primary; CoinGecko fallback; stale cache on rate limits. */
import { readKaspaPriceCache, writeKaspaPriceCache } from "../storage/index.js";

const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price?ids=kaspa&vs_currencies=usd";
const COINPAPRIKA_URL = "https://api.coinpaprika.com/v1/tickers/kas-kaspa";
const CACHE_MS = 600_000;
const DEFAULT_BALANCE = 347_078.071;
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

export type KaspaQuote = {
  enabled: true;
  price_usdt: number;
  balance_kas: number;
  portfolio_usdt: number;
  updated_at: string;
  stale?: boolean;
};

async function fetchFromCoinPaprika(): Promise<number | null> {
  const res = await fetch(COINPAPRIKA_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const data = (await res.json()) as { quotes?: { USD?: { price?: number } } };
  const price = data.quotes?.USD?.price;
  return price != null && Number.isFinite(price) && price > 0 ? price : null;
}

async function fetchFromCoinGecko(): Promise<number | null> {
  const headers: Record<string, string> = { "User-Agent": USER_AGENT };
  const key = process.env.COINGECKO_DEMO_API_KEY?.trim();
  if (key) headers["x-cg-demo-api-key"] = key;

  const res = await fetch(COINGECKO_URL, { headers });
  if (!res.ok) return null;
  const data = (await res.json()) as { kaspa?: { usd?: number } };
  const price = data.kaspa?.usd;
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
      let price = await fetchFromCoinPaprika();
      if (price != null) {
        await persistPrice(price, "coinpaprika");
        return price;
      }

      price = await fetchFromCoinGecko();
      if (price != null) {
        await persistPrice(price, "coingecko");
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
