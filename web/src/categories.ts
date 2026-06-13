/** English spending categories used in rules, charts, and dropdowns. */
export const SPENDING_CATEGORIES = [
  "Bank fees",
  "BIT",
  "Clothes",
  "Coffee",
  "Eating out",
  "Education",
  "Government & Institutions",
  "Groceries",
  "Health & Medical",
  "Home & Living",
  "Housing",
  "Kids",
  "Leisure & Entertainment",
  "Miscellaneous",
  "Nails",
  "Other",
  "Subscriptions",
  "Tourism",
  "Transport",
  "Uncategorized",
] as const;

/** Umbrella category for home, furniture, electronics, beauty, pets, and hookah. */
export const HOME_LIVING = "Home & Living";

/** @deprecated alias — rolled up to Home & Living */
export const HOME_ELECTRONICS = HOME_LIVING;

/** Fine-grained labels stored on transactions; rolled up to HOME_LIVING in charts. */
export const HOME_SUBSECTIONS = new Set([
  HOME_LIVING,
  "Home & Furniture",
  "Electronics & computers",
  "Beauty & Personal Care",
  "Pets",
  "Hookah",
  "Home & Electronics",
]);

export const HOME_SUBSECTION_LABELS: Record<string, string> = {
  "Home & Furniture": "Furniture & home",
  "Electronics & computers": "Electronics",
  "Beauty & Personal Care": "Beauty & personal care",
  Pets: "Pets",
  Hookah: "Hookah",
  [HOME_LIVING]: "General",
  "Home & Electronics": "General",
};

/** Fine-grained labels rolled up to Subscriptions in charts. */
export const SUBSCRIPTION_SUBSECTIONS = new Set(["Subscriptions", "Mobile phone", "Fitness"]);

/** How many categories get their own pie slice before the rest roll into "Other". */
export const TOP_PIE_CATEGORIES = 14;

/** Internal key for the "Other" bucket drill-down view. */
export const OTHER_BUCKET = "__other__";

export function otherBucketLabel(count: number): string {
  return `Other (${count} categories)`;
}

export function isOtherBucketLabel(name: string): boolean {
  return name.startsWith("Other (");
}

export function rollupCategory(category: string): string {
  const cat = category.trim() || "Uncategorized";
  if (HOME_SUBSECTIONS.has(cat)) return HOME_LIVING;
  if (SUBSCRIPTION_SUBSECTIONS.has(cat)) return "Subscriptions";
  return cat;
}

export function isHomeSubsection(category: string): boolean {
  return HOME_SUBSECTIONS.has(category);
}

export function isSubscriptionSubsection(category: string): boolean {
  return SUBSCRIPTION_SUBSECTIONS.has(category);
}

export function homeSubsectionLabel(category: string): string {
  return HOME_SUBSECTION_LABELS[category] || category;
}

/** Canonical key when grouping home subsections (merges legacy aliases). */
export function homeSubsectionKey(category: string): string {
  const cat = category.trim() || "Uncategorized";
  if (cat === "Home & Electronics") return HOME_LIVING;
  return cat;
}

export function homeSubsectionTotals(
  transactions: { category_en: string; charge_amount: number }[],
): { category_en: string; total: number }[] {
  const map = new Map<string, number>();
  for (const tx of transactions) {
    const cat = tx.category_en?.trim() || "Uncategorized";
    if (!isHomeSubsection(cat)) continue;
    const key = homeSubsectionKey(cat);
    map.set(key, (map.get(key) || 0) + tx.charge_amount);
  }
  return [...map.entries()]
    .map(([category_en, total]) => ({ category_en, total: Math.round(total * 100) / 100 }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
}

export function rollupCategoriesForDisplay(
  categories: { category_en: string; total: number; count?: number; share_pct?: number; category_he?: string | null }[],
): { category_en: string; total: number; count: number; share_pct: number; category_he: string | null }[] {
  const totals = new Map<
    string,
    { category_en: string; total: number; count: number; category_he: string | null }
  >();
  for (const row of categories) {
    const key = rollupCategory(row.category_en);
    const cur = totals.get(key) || {
      category_en: key,
      total: 0,
      count: 0,
      category_he: row.category_he ?? null,
    };
    cur.total += row.total;
    cur.count += row.count ?? 0;
    totals.set(key, cur);
  }
  const grand = [...totals.values()].reduce((s, c) => s + c.total, 0);
  return [...totals.values()]
    .map((c) => ({
      ...c,
      share_pct: grand ? (c.total / grand) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

export function groupCategoriesForPie(
  categories: { category_en: string; total: number; count?: number; share_pct?: number }[],
) {
  const rolled = rollupCategoriesForDisplay(categories);
  const sorted = [...rolled].sort((a, b) => b.total - a.total);
  return {
    top: sorted.slice(0, TOP_PIE_CATEGORIES),
    other: sorted.slice(TOP_PIE_CATEGORIES),
  };
}

/** Category options for manual label fixes (umbrella + legacy subsections). */
export const CATEGORY_PICKLIST = [
  ...SPENDING_CATEGORIES,
  "Beauty & Personal Care",
  "Electronics & computers",
  "Fitness",
  "Home & Furniture",
  "Hookah",
  "Mobile phone",
  "Pets",
] as const;

/** Recurring bills and obligations — everything else counts as variable spending. */
export const FIXED_COST_CATEGORIES = new Set<string>([
  "Bank fees",
  "Education",
  "Government & Institutions",
  "Housing",
  "Subscriptions",
  "Transport",
]);

export type CostType = "fixed" | "variable";

export const COST_BUCKETS: Record<
  CostType,
  { label: string; hint: string }
> = {
  fixed: {
    label: "Monthly bills",
    hint: "Rent, utilities, subscriptions, transport…",
  },
  variable: {
    label: "Everyday spending",
    hint: "Groceries, restaurants, coffee, shopping…",
  },
};

export function costTypeForCategory(category: string): CostType {
  return FIXED_COST_CATEGORIES.has(rollupCategory(category)) ? "fixed" : "variable";
}

export function categoriesForCostType(
  byCategory: { category_en: string; total: number }[],
  type: CostType,
): { category_en: string; total: number }[] {
  return rollupCategoriesForDisplay(byCategory)
    .filter((row) => costTypeForCategory(row.category_en) === type)
    .map((row) => ({ category_en: row.category_en, total: row.total }))
    .sort((a, b) => b.total - a.total);
}

export function splitFixedVariable(byCategory: { category_en: string; total: number }[]): {
  fixed: number;
  variable: number;
} {
  let fixed = 0;
  let variable = 0;
  for (const row of rollupCategoriesForDisplay(byCategory)) {
    if (costTypeForCategory(row.category_en) === "fixed") fixed += row.total;
    else variable += row.total;
  }
  return { fixed, variable };
}
