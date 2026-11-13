/**
 * Display language for labels core builds (month names, dates). The web app sets it once at
 * start-up from the user's choice; the API never does, so it keeps English.
 */
export type DisplayLocale = "en" | "ru";

let current: DisplayLocale = "en";

export function setDisplayLocale(locale: DisplayLocale): void {
  current = locale;
}

export function displayLocale(): DisplayLocale {
  return current;
}

/** BCP-47 tag for toLocaleDateString. */
export function dateLocaleTag(): string {
  return current === "ru" ? "ru-RU" : "en-GB";
}

const SHORT: Record<DisplayLocale, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  ru: ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
};

/** Short month name (0 = January). */
export function monthShort(index: number): string {
  return SHORT[current][index] ?? "";
}

/** "Nov 2026" / "ноя 2026". */
export function monthYearLabel(index: number, year: number | string): string {
  return `${monthShort(index)} ${year}`;
}
