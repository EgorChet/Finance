import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { authStatus, login as apiLogin } from "../api/client";

const TOKEN_KEY = "finance_auth_token";

export const useAuthStore = defineStore("auth", () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
  const isDemo = ref(!token.value);
  const authRequired = ref(false);
  const loading = ref(false);
  const error = ref("");

  const isAuthenticated = computed(() => Boolean(token.value) && !isDemo.value);

  async function checkStatus() {
    const status = await authStatus();
    authRequired.value = status.auth_required;
    if (!status.auth_required) {
      isDemo.value = false;
    }
  }

  async function login(password: string) {
    loading.value = true;
    error.value = "";
    try {
      const res = await apiLogin(password);
      token.value = res.token;
      isDemo.value = false;
      localStorage.setItem(TOKEN_KEY, res.token);
    } catch {
      error.value = "Wrong password";
      throw new Error("login failed");
    } finally {
      loading.value = false;
    }
  }

  function enterDemo() {
    token.value = null;
    isDemo.value = true;
    localStorage.removeItem(TOKEN_KEY);
  }

  function logout() {
    token.value = null;
    isDemo.value = true;
    localStorage.removeItem(TOKEN_KEY);
  }

  return {
    token,
    isDemo,
    authRequired,
    loading,
    error,
    isAuthenticated,
    checkStatus,
    login,
    enterDemo,
    logout,
  };
});
