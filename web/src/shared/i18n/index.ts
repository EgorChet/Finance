/**
 * App language (English / Russian). English text is the key: `t("Bills on your card")` returns the
 * Russian line when Russian is on, or the English as written. Parameters: `t("Saved {name}", { name })`.
 * Plurals: `{n|charge|charges}` in English, `{n|покупка|покупки|покупок}` in Russian.
 * Strings that core builds at run time go through `tr()`, which also knows a few patterns.
 */
import { ref } from "vue";
import { setDisplayLocale, type DisplayLocale } from "@core/utils/displayLocale";
import { RU, RU_PATTERNS } from "./ru";
import { RU_CATEGORIES } from "./categoriesRu";

export type Locale = DisplayLocale;
const STORAGE_KEY = "finance_locale";

function readSaved(): Locale {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "ru" || v === "en") return v;
  } catch {
    /* private mode */
  }
  return "en";
}

export const locale = ref<Locale>(readSaved());
setDisplayLocale(locale.value);
document.documentElement.lang = locale.value;

/** Switch language. Reloads, so labels cached in stores are rebuilt in the new language. */
export function setLocale(next: Locale): void {
  if (next === locale.value) return;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* private mode */
  }
  locale.value = next;
  setDisplayLocale(next);
  window.location.reload();
}

export function isRu(): boolean {
  return locale.value === "ru";
}

type Params = Record<string, string | number | null | undefined>;

function pluralIndex(n: number, forms: number): number {
  if (forms === 2) return Math.abs(n) === 1 ? 0 : 1;
  const a = Math.abs(Math.trunc(n));
  const m10 = a % 10;
  const m100 = a % 100;
  if (!Number.isInteger(n)) return 1;
  if (m10 === 1 && m100 !== 11) return 0;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 1;
  return 2;
}

function fill(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)(\|[^}]*)?\}/g, (whole, name: string, forms?: string) => {
    if (!(name in params)) return whole;
    const v = params[name];
    if (forms) {
      const list = forms.slice(1).split("|");
      const n = typeof v === "number" ? v : Number(v);
      return list[Math.min(pluralIndex(n, list.length), list.length - 1)] ?? "";
    }
    return v == null ? "" : String(v);
  });
}

/** Translate a fixed UI line (English as written is the key). */
export function t(key: string, params?: Params): string {
  // Touch the ref so templates and computeds re-run if the language changes.
  const ru = locale.value === "ru";
  // "Charges||count": the part after || only tells the two meanings apart for translation.
  const plain = key.includes("||") ? key.slice(0, key.indexOf("||")) : key;
  return fill(ru ? (RU[key] ?? RU[plain] ?? plain) : plain, params);
}

/** Translate a line built elsewhere (core labels, statuses): exact match, then known patterns. */
export function tr(text: string | null | undefined): string {
  if (!text) return text ?? "";
  if (locale.value !== "ru") return text;
  const exact = RU[text] ?? RU_CATEGORIES[text];
  if (exact) return exact;
  for (const [re, out] of RU_PATTERNS) {
    const m = text.match(re);
    if (m) return typeof out === "string" ? out.replace(/\$(\d)/g, (_, i) => tr(m[Number(i)])) : out(m);
  }
  return text;
}

/** Category name in the chosen language (categories are stored in English). */
export function catName(category: string | null | undefined): string {
  if (!category) return "";
  if (locale.value !== "ru") return category;
  if (RU_CATEGORIES[category]) return RU_CATEGORIES[category];
  const other = category.match(/^Other \((\d+) categories\)$/);
  if (other) return t("Other ({n} {n|category|categories})", { n: Number(other[1]) });
  return category;
}

/** BCP-47 tag for dates and the like. */
export function dateTag(): string {
  return locale.value === "ru" ? "ru-RU" : "en-GB";
}
