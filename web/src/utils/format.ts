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

export const CHART_COLORS = [
  "#38bdf8", "#34d399", "#fbbf24", "#f472b6", "#a78bfa",
  "#fb7185", "#2dd4bf", "#f97316", "#60a5fa", "#c084fc",
];
