import { getFxcnQuote, type FxcnQuote } from "./fxcnQuote.js";
import { getKaspaQuote, type KaspaQuote } from "./kaspaPrice.js";

/** Sample holdings for demo mode — never expose real balances. */
export const DEMO_KAS_BALANCE = 12_500;
export const DEMO_FXCN_LOTS = 42;

const DEMO_KAS_PRICE = 0.095;
const DEMO_FXCN_NAV = 52.4;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function getDemoKaspaQuote(options?: { force?: boolean }): Promise<KaspaQuote> {
  try {
    const live = await getKaspaQuote(options);
    return {
      ...live,
      balance_kas: DEMO_KAS_BALANCE,
      portfolio_usdt: roundMoney(DEMO_KAS_BALANCE * live.price_usdt),
      source: `demo · ${live.source}`,
    };
  } catch {
    return {
      enabled: true,
      price_usdt: DEMO_KAS_PRICE,
      balance_kas: DEMO_KAS_BALANCE,
      portfolio_usdt: roundMoney(DEMO_KAS_BALANCE * DEMO_KAS_PRICE),
      updated_at: new Date().toISOString(),
      source: "demo",
    };
  }
}

export async function getDemoFxcnQuote(options?: { force?: boolean }): Promise<FxcnQuote> {
  try {
    const live = await getFxcnQuote(options);
    return {
      ...live,
      lots: DEMO_FXCN_LOTS,
      portfolio_usd: roundMoney(DEMO_FXCN_LOTS * live.nav_usd),
      source: `demo · ${live.source}`,
    };
  } catch {
    return {
      enabled: true,
      nav_usd: DEMO_FXCN_NAV,
      lots: DEMO_FXCN_LOTS,
      portfolio_usd: roundMoney(DEMO_FXCN_LOTS * DEMO_FXCN_NAV),
      updated_at: new Date().toISOString(),
      source: "demo",
    };
  }
}
