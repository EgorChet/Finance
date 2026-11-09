/** One glyph per category for the round icon on category rows. */
const ICONS: Record<string, string> = {
  "Bank fees": "🏦",
  BIT: "💸",
  Clothes: "👕",
  Coffee: "☕",
  "Eating out": "🍽️",
  Education: "🎓",
  "Government & Institutions": "🏛️",
  Groceries: "🛒",
  "Health & Medical": "💊",
  "Home & Living": "🏠",
  Housing: "🔑",
  Kids: "🧸",
  "Leisure & Entertainment": "🎟️",
  Miscellaneous: "📦",
  Nails: "💅",
  Other: "🗂️",
  Subscriptions: "🔁",
  Tourism: "✈️",
  Transport: "🚗",
  Uncategorized: "❔",
  // Home & Living subsections
  "Home & Furniture": "🛋️",
  "Electronics & computers": "💻",
  "Beauty & Personal Care": "🧴",
  Pets: "🐾",
  Hookah: "💨",
  "Home & Electronics": "🏠",
  // Subscription subsections
  "Mobile phone": "📱",
  Fitness: "🏋️",
};

export function categoryIcon(name: string): string {
  return ICONS[name] ?? "•";
}
