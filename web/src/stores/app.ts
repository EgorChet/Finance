import { defineStore } from "pinia";
import { ref } from "vue";

const EXPERT_MODE_KEY = "finance_expert_mode";

export const useAppStore = defineStore("app", () => {
  const lightMode = ref(false);
  const expertMode = ref(localStorage.getItem(EXPERT_MODE_KEY) === "true");
  const selectedMonth = ref<string | null>(null);
  const selectedCategory = ref("");

  function toggleTheme() {
    lightMode.value = !lightMode.value;
    document.documentElement.dataset.theme = lightMode.value ? "light" : "dark";
  }

  function toggleExpertMode() {
    expertMode.value = !expertMode.value;
    localStorage.setItem(EXPERT_MODE_KEY, String(expertMode.value));
  }

  function clearCategory() {
    selectedCategory.value = "";
  }

  return {
    lightMode,
    expertMode,
    selectedMonth,
    selectedCategory,
    toggleTheme,
    toggleExpertMode,
    clearCategory,
  };
});
