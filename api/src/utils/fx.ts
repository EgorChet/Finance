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

  if (USD_MERCHANT.test(merchant)) return "USD";

  const suffix = COUNTRY_SUFFIX.exec(merchant.trim());
  if (suffix) {
    const cc = suffix[1]!;
    if (cc === "US") return "USD";
    if (cc === "PL") return "PLN";
    if (["DE", "FR", "IT", "ES", "NL", "AT", "BE", "PT", "GR"].includes(cc)) return "EUR";
    if (cc === "GB") return "GBP";
    if (cc === "BG") return "BGN";
    if (cc === "AM") return "AMD";
  }

  if (BGN_MERCHANT.test(merchant)) return "BGN";
  if (EUR_MERCHANT.test(merchant)) return "EUR";
  if (/[A-Za-z]{3,}/.test(merchant) && !hasHebrew(merchant)) return "USD";

  return "ILS";
}

export function pendingCurrencyForAmount(
  amount: number,
  pendingCurrencies?: Record<string, string> | null,
): string | undefined {
  if (!pendingCurrencies) return undefined;
  const key = roundMoney(amount);
  const keys = [String(key), key.toFixed(2), key.toFixed(1)];
  for (const k of keys) {
    const hit = pendingCurrencies[k];
    if (hit) return hit;
  }
  return undefined;
}

function explicitCurrencyForTx(
  tx: Transaction,
  pendingCurrencies?: Record<string, string> | null,
): string | null | undefined {
  if (isPendingCharge(tx.charge_amount, tx.notes, tx.transaction_type_he, tx.amount)) {
    // Header map and parser output beat merchant heuristics (OPENAI → USD).
    return (
      pendingCurrencyForAmount(tx.amount, pendingCurrencies) ??
      tx.original_currency ??
      null
    );
  }
  return tx.original_currency;
}

const REFUND_TYPE_MARKERS = ["זיכוי", "השבת מכירה"] as const;
const INSTALLMENT = /תשלום\s+(\d+)\s+מתוך\s+(\d+)/;
const BILLING_ADJUSTMENT = "שינוי מועד חיוב";
const CARD_FEE_TYPE = "דמי חבר";
const INTEREST_MERCHANT = "* ריבית *";

export function parseInstallment(notes: string | null | undefined): [number, number] | null {
  if (!notes) return null;
  const match = INSTALLMENT.exec(notes);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

export function shouldSkipInstallmentRow(
  chargeRaw: number | null | undefined,
  notes: string | null,
  transactionTypeHe?: string | null,
): boolean {
  const installment = parseInstallment(notes);
  if (!installment) return false;
  if (installment[0] === 0) return true;
  return isPendingCharge(chargeRaw, notes, transactionTypeHe);
}

export function isBillingCycleAdjustment(merchant: string): boolean {
  return merchant.includes(BILLING_ADJUSTMENT);
}

export function isCardMembershipFee(merchant: string, transactionTypeHe?: string | null): boolean {
  if (transactionTypeHe === CARD_FEE_TYPE) return true;
  return merchant.includes("דמי כרטיס");
}

export function isInterestRow(merchant: string): boolean {
  return merchant.includes(INTEREST_MERCHANT);
}

export function shouldSkipNonSpendRow(
  chargeRaw: number | null | undefined,
  merchant: string,
  notes: string | null,
  transactionTypeHe?: string | null,
): boolean {
  if (shouldSkipInstallmentRow(chargeRaw, notes, transactionTypeHe)) return true;
  if (isBillingCycleAdjustment(merchant)) return true;
  if (isCardMembershipFee(merchant, transactionTypeHe) && isPendingCharge(chargeRaw, notes, transactionTypeHe)) {
    return true;
  }
  return false;
}

export function transactionSnapshotKey(tx: Transaction): string {
  const txDate = tx.date.slice(0, 10);
  const installment = parseInstallment(tx.notes);
  if (installment) {
    return `${txDate}|${tx.merchant_he}|inst|${installment[0]}|${installment[1]}`;
  }
  const charge = roundMoney(tx.charge_amount);
  return `${txDate}|${tx.merchant_he}|tx|${charge}|${tx.notes ?? ""}`;
}

export function pickBetterTransaction(a: Transaction, b: Transaction): Transaction {
  const aEst = !!a.charge_estimated;
  const bEst = !!b.charge_estimated;
  if (aEst !== bEst) return aEst ? b : a;

  const aInst = parseInstallment(a.notes);
  const bInst = parseInstallment(b.notes);
  if (aInst && bInst && aInst[0] !== bInst[0]) {
    return aInst[0] > bInst[0] ? a : b;
  }

  if (a.charge_amount !== b.charge_amount) {
    return a.charge_amount < b.charge_amount ? a : b;
  }

  return b;
}

export function dedupeTransactionSnapshots(transactions: Transaction[]): Transaction[] {
  const best = new Map<string, Transaction>();
  const order: string[] = [];
  for (const tx of transactions) {
    const key = transactionSnapshotKey(tx);
    if (!best.has(key)) {
      order.push(key);
      best.set(key, tx);
    } else {
      best.set(key, pickBetterTransaction(best.get(key)!, tx));
    }
  }
  return order.map((key) => best.get(key)!);
}

export function isRefundTypeHe(transactionTypeHe: string | null | undefined): boolean {
  if (!transactionTypeHe) return false;
  return REFUND_TYPE_MARKERS.some((m) => transactionTypeHe.includes(m));
}

export function isRefundTransaction(
  transactionTypeHe: string | null | undefined,
  amount: number,
  chargeRaw: number | null | undefined,
): boolean {
  if (isRefundTypeHe(transactionTypeHe)) return true;
  if (amount < 0) return true;
  if (chargeRaw != null && chargeRaw < 0) return true;
  return false;
}

export function isPendingCharge(
  chargeRaw: number | null | undefined,
  notes: string | null,
  transactionTypeHe?: string | null,
  amount?: number,
): boolean {
  if (amount != null && transactionTypeHe != null) {
    if (isRefundTransaction(transactionTypeHe, amount, chargeRaw)) return false;
  }
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
  transactionTypeHe?: string | null,
): { chargeAmount: number; originalCurrency: string | null; estimated: boolean } {
  const charge = chargeRaw == null ? null : Number(chargeRaw);

  if (isRefundTransaction(transactionTypeHe, amount, chargeRaw)) {
    const base = charge != null && charge !== 0 ? charge : amount;
    return { chargeAmount: roundMoney(-Math.abs(base)), originalCurrency: "ILS", estimated: false };
  }

  if (amount <= 0) return { chargeAmount: 0, originalCurrency: null, estimated: false };

  if (isInterestRow(merchant) && charge != null && charge > 0) {
    return { chargeAmount: roundMoney(charge), originalCurrency: "ILS", estimated: false };
  }

  const pending = isPendingCharge(chargeRaw, notes, transactionTypeHe, amount);

  // Pending — column 3 not final; use FX even if charge_amount was already estimated.
  if (pending) {
    const currency =
      explicitCurrency && explicitCurrency !== "ILS"
        ? explicitCurrency
        : detectCurrency(merchant, amount, null, null);
    if (currency === "ILS") {
      return { chargeAmount: roundMoney(amount), originalCurrency: "ILS", estimated: true };
    }
    const rate = getRateToIls(currency, txDate);
    return {
      chargeAmount: roundMoney(amount * rate),
      originalCurrency: currency,
      estimated: true,
    };
  }

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

  const currency = detectCurrency(merchant, amount, charge, explicitCurrency);
  if (currency === "ILS") {
    return { chargeAmount: roundMoney(amount), originalCurrency: "ILS", estimated: false };
  }

  const rate = getRateToIls(currency, txDate);
  return {
    chargeAmount: roundMoney(amount * rate),
    originalCurrency: currency,
    estimated: true,
  };
}

export function normalizeForeignCharges(
  transactions: Transaction[],
  pendingCurrencies?: Record<string, string> | null,
): {
  transactions: Transaction[];
  changed: boolean;
} {
  let changed = false;
  const result = transactions.map((tx) => {
    const resolved = resolveChargeIls(
      tx.amount,
      tx.charge_amount,
      tx.merchant_he,
      tx.notes,
      tx.date,
      explicitCurrencyForTx(tx, pendingCurrencies),
      tx.transaction_type_he,
    );
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
