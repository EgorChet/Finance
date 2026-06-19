/** Foreign-currency → ILS for Leumi Visa exports (mirrors backend/fx.py). */
import type { Transaction } from "../types.js";
import { getRateToIls } from "./fxRates.js";

const HEBREW = /[\u0590-\u05FF]/;
const COUNTRY_SUFFIX = /\s([A-Z]{2})\s*$/;
const USD_MERCHANT =
  /OPENAI|CURSOR|AWS\s|APPLE\.COM|MIDJOURNEY|AIRBNB|GOOGLE|GITHUB|MICROSOFT|NETFLIX|SPOTIFY|TRIP\.COM|AIRALO|OMIO|BOUNCE|FILTERLY|SPECIALSCOMEDY|yollacalls|CONCERTPLACE|BANDCAMP|economybookings|TradeInn|Farfetch|HOTEL & RESORTS|DRIVALIA|SKIS ROSSIGNOL|EL AL \d/i;
const EUR_MERCHANT =
  /\b(SRL|SPA|OOD|EOOD|GMBH|TERMINI|ROMA|MILANO|AUTOGRILL|UBR\*|AVIS|ZARA|COS|UNIQLO|POLENE|VIvat|PAUL AIRPORT|DEDEM SPA|PIERLUIGI|SUMUP|MANGO ROMA)\b/i;
const BGN_MERCHANT = /\b(EOOD|OOD|BALGARIYA|BURGAS|BULGARIA|AMREST KOFI)\b/i;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function hasHebrew(text: string): boolean {
  return HEBREW.test(text);
}

export function inferCurrencyFromRatio(amount: number, charge: number): string | null {
  if (amount <= 0 || charge <= 0) return null;
  const ratio = charge / amount;
  if (ratio >= 3.2 && ratio <= 4.05) return "USD";
  if (ratio >= 3.85 && ratio <= 4.55) return "EUR";
  if (ratio >= 1.85 && ratio <= 2.25) return "BGN";
  if (ratio >= 4.5 && ratio <= 5.0) return "GBP";
  if (ratio >= 0.85 && ratio <= 1.05) return "PLN";
  if (ratio >= 0.005 && ratio <= 0.02) return "AMD";
  if (ratio >= 0.98 && ratio <= 1.02) return "ILS";
  return null;
}

export function detectCurrency(
  merchant: string,
  amount: number,
  charge: number | null,
  explicitCurrency?: string | null,
): string {
  if (explicitCurrency && explicitCurrency !== "ILS") return explicitCurrency;

  if (hasHebrew(merchant)) return "ILS";

  if (charge != null && charge > 0 && amount > 0) {
    const inferred = inferCurrencyFromRatio(amount, charge);
    if (inferred) return inferred;
  }

  const suffix = COUNTRY_SUFFIX.exec(merchant.trim());
  if (suffix) {
    const cc = suffix[1]!;
    if (cc === "US") return "USD";
    if (cc === "PL") return "PLN";
    if (["DE", "FR", "IT", "ES", "NL", "AT", "BE", "PT", "GR", "IE"].includes(cc)) return "EUR";
    if (cc === "GB") return "GBP";
    if (cc === "BG") return "BGN";
    if (cc === "AM") return "AMD";
  }

  if (USD_MERCHANT.test(merchant)) return "USD";
  if (BGN_MERCHANT.test(merchant)) return "BGN";
  if (EUR_MERCHANT.test(merchant)) return "EUR";
  if (/[A-Za-z]{3,}/.test(merchant) && !hasHebrew(merchant)) return "USD";

  return "ILS";
}

export function isPendingCharge(chargeRaw: number | null | undefined, notes: string | null): boolean {
  if (notes?.includes("בקליטה")) return true;
  if (chargeRaw == null) return true;
  return chargeRaw <= 0;
}

export function resolveChargeIls(
  amount: number,
  chargeRaw: number | null | undefined,
  merchant: string,
  notes: string | null,
  txDate: string,
  explicitCurrency?: string | null,
): { chargeAmount: number; originalCurrency: string | null; estimated: boolean } {
  const charge = chargeRaw == null ? null : Number(chargeRaw);

  // Bank ILS charge — column 3 always wins.
  if (charge != null && charge > 0) {
    const currency = detectCurrency(merchant, amount, charge, explicitCurrency);
    if (currency === "ILS" || Math.abs(amount - charge) < 0.02) {
      return {
        chargeAmount: roundMoney(charge),
        originalCurrency: Math.abs(amount - charge) < 0.02 ? "ILS" : currency,
        estimated: false,
      };
    }
    return { chargeAmount: roundMoney(charge), originalCurrency: currency, estimated: false };
  }

  if (amount <= 0) return { chargeAmount: 0, originalCurrency: null, estimated: false };

  const pending = isPendingCharge(chargeRaw, notes);
  const currency = detectCurrency(merchant, amount, charge, explicitCurrency);
  if (currency === "ILS") {
    return { chargeAmount: roundMoney(amount), originalCurrency: "ILS", estimated: pending };
  }

  const rate = getRateToIls(currency, txDate);
  return {
    chargeAmount: roundMoney(amount * rate),
    originalCurrency: currency,
    estimated: true,
  };
}

export function normalizeForeignCharges(transactions: Transaction[]): {
  transactions: Transaction[];
  changed: boolean;
} {
  let changed = false;
  const result = transactions.map((tx) => {
    const resolved = resolveChargeIls(tx.amount, tx.charge_amount, tx.merchant_he, tx.notes, tx.date);
    const sameCharge = resolved.chargeAmount === tx.charge_amount;
    const sameCurrency = (tx.original_currency ?? null) === resolved.originalCurrency;
    const sameEstimated = !!tx.charge_estimated === resolved.estimated;
    if (sameCharge && sameCurrency && sameEstimated) return tx;

    changed = true;
    return {
      ...tx,
      charge_amount: resolved.chargeAmount,
      original_currency: resolved.originalCurrency ?? undefined,
      charge_estimated: resolved.estimated,
    };
  });
  return { transactions: result, changed };
}
