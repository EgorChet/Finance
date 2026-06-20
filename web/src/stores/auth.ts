import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { authStatus, fetchAuthMe, login as apiLogin } from "../api/client";
import type { HouseholdUserId } from "../types";
import type { UserFeatures } from "../utils/users";
import { USER_PROFILES, userIdFromToken } from "../utils/users";

const TOKEN_KEY = "finance_auth_token";

const DEFAULT_FEATURES: UserFeatures = {
  portfolio: true,
  spending: true,
  calendar: true,
  upload: true,
  recurring: true,
};

function featuresFor(userId: HouseholdUserId | null): UserFeatures {
  if (!userId) return DEFAULT_FEATURES;
  return USER_PROFILES[userId]?.features ?? DEFAULT_FEATURES;
}

export const useAuthStore = defineStore("auth", () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
  const isDemo = ref(!token.value);
  const demoAsOf = ref<string | null>(null);
  const authRequired = ref(false);
  const loading = ref(false);
  const error = ref("");
  const userId = ref<HouseholdUserId | null>(token.value ? userIdFromToken(token.value) : null);
  const userLabel = ref(userId.value ? USER_PROFILES[userId.value].label : "");
  const features = ref<UserFeatures>(featuresFor(userId.value));

  const isAuthenticated = computed(() => Boolean(token.value) && !isDemo.value);

  function applySession(next: {
    token?: string | null;
    user?: HouseholdUserId;
    label?: string;
    features?: UserFeatures;
    demo?: boolean;
  }) {
    if (next.demo) {
      token.value = null;
      isDemo.value = true;
      userId.value = "egor";
      userLabel.value = USER_PROFILES.egor.label;
      features.value = DEFAULT_FEATURES;
      localStorage.removeItem(TOKEN_KEY);
      return;
    }
    if (next.token) {
      token.value = next.token;
      localStorage.setItem(TOKEN_KEY, next.token);
    }
    isDemo.value = false;
    demoAsOf.value = null;
    const resolvedUser = next.user ?? userIdFromToken(next.token ?? null) ?? "egor";
    userId.value = resolvedUser;
    userLabel.value = next.label ?? USER_PROFILES[resolvedUser].label;
    features.value = next.features ?? featuresFor(resolvedUser);
  }

  async function checkStatus() {
    const status = await authStatus();
    authRequired.value = status.auth_required;
    if (!status.auth_required) {
      isDemo.value = false;
    }
  }

  async function refreshMe() {
    if (!token.value || isDemo.value) return;
    try {
      const me = await fetchAuthMe(token.value);
      userId.value = me.user;
      userLabel.value = me.label;
      features.value = me.features;
    } catch {
      const fromToken = userIdFromToken(token.value);
      if (fromToken) {
        userId.value = fromToken;
        userLabel.value = USER_PROFILES[fromToken].label;
        features.value = featuresFor(fromToken);
      }
    }
  }

  async function login(password: string, user: HouseholdUserId = "egor") {
    loading.value = true;
    error.value = "";
    try {
      const res = await apiLogin(password, user);
      applySession({
        token: res.token,
        user: res.user,
        label: res.label,
        features: res.features,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/fetch|network|failed|load/i.test(msg)) {
        error.value = "Could not reach the server — check your connection and try again.";
      } else {
        error.value = "Wrong password";
      }
      throw e;
    } finally {
      loading.value = false;
    }
  }

  function enterDemo() {
    applySession({ demo: true });
    demoAsOf.value = null;
  }

  function logout() {
    applySession({ demo: true });
    demoAsOf.value = null;
  }

  function can(feature: keyof UserFeatures): boolean {
    if (isDemo.value) return true;
    return features.value[feature] !== false;
  }

  return {
    token,
    isDemo,
    demoAsOf,
    authRequired,
    loading,
    error,
    userId,
    userLabel,
    features,
    isAuthenticated,
    checkStatus,
    refreshMe,
    login,
    enterDemo,
    logout,
    can,
  };
});
