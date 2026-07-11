/** Round to agorot (2 dp) — avoids float noise like 2392.2343465673. */
import { isRefundTransaction } from "@/shared/utils/transaction";

export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function formatIls(amount: number, decimals = 2): string {
  return `₪${roundMoney(amount).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/** Whole shekels — rounded to nearest ₪1, no agorot. */
export function formatIlsWhole(amount: number): string {
  return `₪${Math.round(amount).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function formatRub(amount: number, decimals = 0): string {
  return `${roundMoney(amount).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} ₽`;
}

/** S&P 500 index level — whole points. */
export function formatSp500(level: number): string {
  return level.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function formatUsdt(amount: number, decimals = 2): string {
  return `${roundMoney(amount).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} USDT`;
}

/** Spot KAS price — 6 decimal places to match MEXC ticker precision. */
export function formatKasUsdtPrice(price: number): string {
  const decimals = price < 1 ? 6 : 2;
  return `${price.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} USDT`;
}

export function formatUsd(amount: number, decimals = 2): string {
  return `${amount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} USD`;
}

/** FinEx NAV per share. */
export function formatFxcnNavPrice(nav: number): string {
  return formatUsd(nav, 4);
}

const CURRENCY_PREFIX: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
};

function formatForeignAmount(amount: number, currency: string): string {
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const prefix = CURRENCY_PREFIX[currency];
  if (prefix) return `${prefix}${formatted}`;
  return `${formatted} ${currency}`;
}

/** ILS charge with optional original foreign amount. */
export function formatChargeAmount(tx: {
  amount: number;
  charge_amount: number;
  original_currency?: string | null;
  charge_estimated?: boolean;
  transaction_type_he?: string;
  reimbursement?: number;
  effective_amount?: number;
}): string {
  const refund = isRefundTransaction(tx);
  const hasReimbursement = !refund && tx.reimbursement != null && tx.reimbursement > 0;
  const displayAmount = refund
    ? Math.abs(tx.charge_amount)
    : hasReimbursement
      ? (tx.effective_amount ?? tx.charge_amount - tx.reimbursement!)
      : tx.charge_amount;
  const ils = formatIls(displayAmount);
  const signedIls = refund ? `−${ils}` : ils;
  const currency = tx.original_currency;
  if (!currency || currency === "ILS" || Math.abs(tx.amount - tx.charge_amount) < 0.02) {
    return tx.charge_estimated && !refund ? `~${signedIls}` : signedIls;
  }
  const original = formatForeignAmount(Math.abs(tx.amount), currency);
  const prefix = tx.charge_estimated && !refund ? "~" : "";
  return `${prefix}${signedIls} (${original})`;
}

/** Softer amounts for sentences — ~₪1,700 not ₪1,720.62. */
export function formatAboutIls(amount: number): string {
  const sign = amount < 0 ? -1 : 1;
  const abs = Math.abs(amount);
  let rounded = abs;
  if (abs >= 2000) rounded = Math.round(abs / 100) * 100;
  else if (abs >= 200) rounded = Math.round(abs / 50) * 50;
  else if (abs >= 20) rounded = Math.round(abs / 10) * 10;
  else rounded = Math.round(abs);
  const n = sign * rounded;
  const body = Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n < 0 ? `-₪${body}` : `₪${body}`;
}

/** Parse YYYY-MM-DD as a local calendar date (avoids UTC off-by-one). */
function parseIsoDate(dateStr: string): Date {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format YYYY-MM-DD as "Mon YYYY" without timezone drift. */
export function monthLabelFromIso(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return "Unknown cycle";
  const [y, m] = dateStr.slice(0, 10).split("-");
  const monthIndex = parseInt(m, 10) - 1;
  if (monthIndex < 0 || monthIndex > 11 || !y) return "Unknown cycle";
  return `${MONTHS[monthIndex]} ${y}`;
}

/**
 * Tab label for a live or pending open cycle (no statement yet).
 * Uses the calendar month the cycle starts in (e.g. 10 Jun → "Jun 2026").
 */
export function openCycleTabLabel(cycleStartIso: string): string {
  return monthLabelFromIso(cycleStartIso);
}

/**
 * User-facing billing cycle name for uploaded statements (10th–10th).
 * Statement billing date is labeled as the previous month
 * (e.g. 10 Apr–9 May → "Apr 2026", statement dated 10 May → "Apr 2026").
 */
export function billingCycleLabel(isoDateStr: string): string {
  if (!isoDateStr || !/^\d{4}-\d{2}-\d{2}/.test(isoDateStr)) {
    return "Unknown cycle";
  }
  const d = parseIsoDate(isoDateStr);
  d.setMonth(d.getMonth() - 1);
  const month = d.getMonth();
  if (month < 0 || month > 11) return "Unknown cycle";
  return `${MONTHS[month]} ${d.getFullYear()}`;
}

export function formatDate(dateStr: string): string {
  return parseIsoDate(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function formatTransactionDate(dateStr: string): string {
  return parseIsoDate(dateStr).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Billing month(s) for the selected view — not purchase-date span from split payments. */
export function formatBillingPeriod(metadata: Record<string, unknown>): string {
  if (metadata.pending_statement) {
    const billing = metadata.billing_date as string | undefined;
    if (billing) return `${openCycleTabLabel(billing)} · awaiting statement`;
  }
  if (metadata.in_progress) {
    const label = metadata.month_label as string | undefined;
    const billing = metadata.billing_date as string | undefined;
    if (label && billing) return `${label} · in progress`;
    if (billing) return `${openCycleTabLabel(billing)} · in progress`;
  }
  if (metadata.provisional) {
    const billing = metadata.billing_date as string | undefined;
    if (billing) return `${billingCycleLabel(billing)} · partial snapshot`;
  }
  const combined = metadata.combined_billing_dates as string[] | undefined;
  if (combined?.length) {
    const sorted = [...combined].sort();
    if (sorted.length === 1) return billingCycleLabel(sorted[0]);
    return `${billingCycleLabel(sorted[0])} – ${billingCycleLabel(sorted[sorted.length - 1]!)}`;
  }
  const billing = metadata.billing_date as string | undefined;
  if (billing) return billingCycleLabel(billing);
  return "";
}

export const CHART_COLORS = [
  "#38bdf8", "#34d399", "#fbbf24", "#f472b6", "#a78bfa",
  "#fb7185", "#2dd4bf", "#f97316", "#60a5fa", "#c084fc",
];
