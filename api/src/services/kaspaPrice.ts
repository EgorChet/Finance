/** Kaspa spot price via CoinGecko (USD ≈ USDT for display). */
const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price?ids=kaspa&vs_currencies=usd";
const CACHE_MS = 120_000;
const DEFAULT_BALANCE = 347_078.071;

let cache: { priceUsdt: number; fetchedAt: number } | null = null;

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
};

export async function getKaspaQuote(): Promise<KaspaQuote> {
  const balance = kasBalance();
  const now = Date.now();

  if (!cache || now - cache.fetchedAt > CACHE_MS) {
    const res = await fetch(COINGECKO_URL, {
      headers: { "User-Agent": "Finance/1.0 (kaspa-price)" },
    });
    if (!res.ok) throw new Error(`CoinGecko error ${res.status}`);
    const data = (await res.json()) as { kaspa?: { usd?: number } };
    const price = data.kaspa?.usd;
    if (price == null || !Number.isFinite(price) || price <= 0) {
      throw new Error("Kaspa price missing from CoinGecko");
    }
    cache = { priceUsdt: price, fetchedAt: now };
  }

  return {
    enabled: true,
    price_usdt: cache.priceUsdt,
    balance_kas: balance,
    portfolio_usdt: roundMoney(balance * cache.priceUsdt),
    updated_at: new Date(cache.fetchedAt).toISOString(),
  };
}
