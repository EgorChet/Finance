import { defineStore } from "pinia";
import { ref } from "vue";

export const useAppStore = defineStore("app", () => {
  const lightMode = ref(false);
  const selectedMonth = ref<string | null>(null);
  const selectedCategory = ref("");

  function toggleTheme() {
    lightMode.value = !lightMode.value;
    document.documentElement.dataset.theme = lightMode.value ? "light" : "dark";
  }

  function clearCategory() {
    selectedCategory.value = "";
  }

  return { lightMode, selectedMonth, selectedCategory, toggleTheme, clearCategory };
});
