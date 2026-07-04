import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { authStatus, fetchAuthMe, login as apiLogin } from "@/shared/api/client";
import type { HouseholdUserId } from "@/shared/types";
import {
  ALL_FEATURES,
  DEFAULT_HOUSEHOLD_USERS,
  DEMO_USER_LABELS,
  UI_USER_LABELS,
  householdUsersForUi,
  userIdFromToken,
  userLabel as labelForUser,
  type UserFeatures,
} from "@/shared/utils/users";

const TOKEN_KEY = "finance_auth_token";

export const useAuthStore = defineStore("auth", () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
  const isDemo = ref(!token.value);
  const demoAsOf = ref<string | null>(null);
  const authRequired = ref(false);
  const loading = ref(false);
  const error = ref("");
  const userId = ref<HouseholdUserId | null>(token.value ? userIdFromToken(token.value) : null);
  const householdUsers = ref(DEFAULT_HOUSEHOLD_USERS);
  const userLabel = ref(userId.value ? labelForUser(userId.value) : "");
  const features = ref<UserFeatures>({ ...ALL_FEATURES });

  const isAuthenticated = computed(() => Boolean(token.value) && !isDemo.value);

  function syncUiUsers() {
    householdUsers.value = householdUsersForUi();
    if (userId.value) {
      userLabel.value = labelForUser(userId.value);
    }
  }

  function applySession(next: {
    token?: string | null;
    user?: HouseholdUserId;
    features?: UserFeatures;
    demo?: boolean;
  }) {
    if (next.demo) {
      token.value = null;
      isDemo.value = true;
      userId.value = "egor";
      userLabel.value = labelForUser("egor", DEMO_USER_LABELS);
      features.value = { ...ALL_FEATURES };
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
    userLabel.value = labelForUser(resolvedUser);
    features.value = next.features ?? { ...ALL_FEATURES };
    syncUiUsers();
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
      userLabel.value = labelForUser(me.user);
      features.value = me.features;
      syncUiUsers();
    } catch {
      const fromToken = userIdFromToken(token.value);
      if (fromToken) {
        userId.value = fromToken;
        userLabel.value = labelForUser(fromToken);
      }
    }
  }

  async function login(password: string, username: string) {
    loading.value = true;
    error.value = "";
    try {
      const res = await apiLogin(password, username.trim());
      applySession({
        token: res.token,
        user: res.user,
        features: res.features,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/unknown name/i.test(msg)) {
        error.value = "Unknown name";
      } else if (/sign-in unavailable/i.test(msg)) {
        error.value = "Sign-in is not configured on the server yet.";
      } else if (/fetch|network|failed|load/i.test(msg)) {
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
    householdUsers.value = (
      Object.entries(DEMO_USER_LABELS) as [HouseholdUserId, string][]
    ).map(([id, label]) => ({ id, label }));
    userLabel.value = labelForUser("egor", DEMO_USER_LABELS);
  }

  function logout() {
    applySession({ demo: true });
    demoAsOf.value = null;
    householdUsers.value = (
      Object.entries(DEMO_USER_LABELS) as [HouseholdUserId, string][]
    ).map(([id, label]) => ({ id, label }));
  }

  function can(_feature: keyof UserFeatures): boolean {
    return true;
  }

  function labelFor(id: HouseholdUserId | null | undefined): string {
    return labelForUser(id, isDemo.value ? DEMO_USER_LABELS : UI_USER_LABELS);
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
    householdUsers,
    features,
    isAuthenticated,
    checkStatus,
    refreshMe,
    login,
    enterDemo,
    logout,
    can,
    labelFor,
  };
});
