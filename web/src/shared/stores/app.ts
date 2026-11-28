import { defineStore } from "pinia";
import { ref } from "vue";

export const PALETTES = ["gold", "emerald", "cobalt", "carmine", "tiffany", "powder", "peach"] as const;
export type Palette = (typeof PALETTES)[number];

const THEME_KEY = "finance_theme";
const PALETTE_KEY = "finance_palette";

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: the choice just lasts until the page closes */
  }
}

/** True when the user (or an earlier visit) already chose a palette on this device. */
export function hasSavedPalette(): boolean {
  try {
    return localStorage.getItem(PALETTE_KEY) !== null;
  } catch {
    return false;
  }
}

export const useAppStore = defineStore("app", () => {
  // index.html has already put the saved theme and palette on <html>, before the first paint.
  const root = document.documentElement;
  const lightMode = ref(root.dataset.theme === "light");
  const palette = ref<Palette>((PALETTES as readonly string[]).includes(root.dataset.palette ?? "") ? (root.dataset.palette as Palette) : "gold");
  const selectedMonth = ref<string | null>(null);
  const selectedCategory = ref("");

  function toggleTheme() {
    lightMode.value = !lightMode.value;
    const theme = lightMode.value ? "light" : "dark";
    root.dataset.theme = theme;
    remember(THEME_KEY, theme);
  }

  function setPalette(next: Palette) {
    palette.value = next;
    root.dataset.palette = next;
    remember(PALETTE_KEY, next);
  }

  function clearCategory() {
    selectedCategory.value = "";
  }

  return {
    lightMode,
    palette,
    selectedMonth,
    selectedCategory,
    toggleTheme,
    setPalette,
    clearCategory,
  };
});
