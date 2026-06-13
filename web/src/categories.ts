/** English spending categories used in rules, charts, and dropdowns. */
export const SPENDING_CATEGORIES = [
  "Bank fees",
  "Beauty & Personal Care",
  "BIT",
  "Clothes",
  "Coffee",
  "Eating out",
  "Education",
  "Electronics & computers",
  "Fitness",
  "Government & Institutions",
  "Groceries",
  "Health & Medical",
  "Home & Furniture",
  "Housing",
  "Hookah",
  "Kids",
  "Leisure & Entertainment",
  "Miscellaneous",
  "Mobile phone",
  "Nails",
  "Other",
  "Pets",
  "Sibus Flexi",
  "Subscriptions",
  "Tourism",
  "Transport",
  "Uncategorized",
] as const;

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

export function groupCategoriesForPie(
  categories: { category_en: string; total: number; count?: number; share_pct?: number }[],
) {
  const sorted = [...categories].sort((a, b) => b.total - a.total);
  return {
    top: sorted.slice(0, TOP_PIE_CATEGORIES),
    other: sorted.slice(TOP_PIE_CATEGORIES),
  };
}

/** Recurring bills and obligations — everything else counts as variable spending. */
export const FIXED_COST_CATEGORIES = new Set<string>([
  "Bank fees",
  "Education",
  "Government & Institutions",
  "Housing",
  "Mobile phone",
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
    hint: "Rent, utilities, phone, transport, subscriptions…",
  },
  variable: {
    label: "Everyday spending",
    hint: "Groceries, restaurants, coffee, shopping…",
  },
};

export function costTypeForCategory(category: string): CostType {
  return FIXED_COST_CATEGORIES.has(category) ? "fixed" : "variable";
}

export function categoriesForCostType(
  byCategory: { category_en: string; total: number }[],
  type: CostType,
): { category_en: string; total: number }[] {
  return byCategory
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
  for (const row of byCategory) {
    if (costTypeForCategory(row.category_en) === "fixed") fixed += row.total;
    else variable += row.total;
  }
  return { fixed, variable };
}
