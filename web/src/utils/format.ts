/** Round to agorot (2 dp) — avoids float noise like 2392.2343465673. */
export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function formatIls(amount: number): string {
  return `₪${roundMoney(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Parse YYYY-MM-DD as a local calendar date (avoids UTC off-by-one). */
function parseIsoDate(dateStr: string): Date {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format YYYY-MM-DD as "Mon YYYY" without timezone drift. */
export function monthLabelFromIso(dateStr: string): string {
  const [y, m] = dateStr.slice(0, 10).split("-");
  const monthIndex = parseInt(m, 10) - 1;
  if (monthIndex < 0 || monthIndex > 11 || !y) return dateStr;
  return `${MONTHS[monthIndex]} ${y}`;
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
  const combined = metadata.combined_billing_dates as string[] | undefined;
  if (combined?.length) {
    const sorted = [...combined].sort();
    if (sorted.length === 1) return monthLabelFromIso(sorted[0]);
    return `${monthLabelFromIso(sorted[0])} – ${monthLabelFromIso(sorted[sorted.length - 1]!)}`;
  }
  const billing = metadata.billing_date as string | undefined;
  if (billing) return monthLabelFromIso(billing);
  return "";
}

export const CHART_COLORS = [
  "#38bdf8", "#34d399", "#fbbf24", "#f472b6", "#a78bfa",
  "#fb7185", "#2dd4bf", "#f97316", "#60a5fa", "#c084fc",
];
