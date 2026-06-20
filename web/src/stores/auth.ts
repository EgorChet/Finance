import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { authStatus, fetchAuthMe, login as apiLogin } from "../api/client";
import type { HouseholdUserId } from "../types";
import {
  ALL_FEATURES,
  DEFAULT_HOUSEHOLD_USERS,
  DEFAULT_USER_LABELS,
  DEMO_USER_LABELS,
  directoryFromUsers,
  userIdFromToken,
  userLabel as labelForUser,
  type UserFeatures,
} from "../utils/users";

const TOKEN_KEY = "finance_auth_token";

export const useAuthStore = defineStore("auth", () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
  const isDemo = ref(!token.value);
  const demoAsOf = ref<string | null>(null);
  const authRequired = ref(false);
  const loading = ref(false);
  const error = ref("");
  const userId = ref<HouseholdUserId | null>(token.value ? userIdFromToken(token.value) : null);
  const userDirectory = ref<Record<HouseholdUserId, string>>({ ...DEFAULT_USER_LABELS });
  const householdUsers = ref(DEFAULT_HOUSEHOLD_USERS);
  const userLabel = ref(userId.value ? labelForUser(userId.value, userDirectory.value) : "");
  const features = ref<UserFeatures>({ ...ALL_FEATURES });

  const isAuthenticated = computed(() => Boolean(token.value) && !isDemo.value);

  function syncUsers(users: { id: HouseholdUserId; label: string }[]) {
    if (!users.length) return;
    householdUsers.value = users;
    userDirectory.value = directoryFromUsers(users);
    if (userId.value) {
      userLabel.value = labelForUser(userId.value, userDirectory.value);
    }
  }

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
      userLabel.value = labelForUser("egor", userDirectory.value);
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
    userLabel.value = next.label ?? labelForUser(resolvedUser, userDirectory.value);
    features.value = next.features ?? { ...ALL_FEATURES };
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
      if (me.users?.length) syncUsers(me.users);
      else {
        userDirectory.value = {
          ...userDirectory.value,
          [me.user]: me.label,
        };
      }
    } catch {
      const fromToken = userIdFromToken(token.value);
      if (fromToken) {
        userId.value = fromToken;
        userLabel.value = labelForUser(fromToken, userDirectory.value);
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
        label: res.label,
        features: res.features,
      });
      if (res.users?.length) syncUsers(res.users);
      else {
        userDirectory.value = {
          ...userDirectory.value,
          [res.user]: res.label,
        };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/unknown name/i.test(msg)) {
        error.value = "Unknown name";
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
    userDirectory.value = { ...DEMO_USER_LABELS };
    userLabel.value = labelForUser("egor", userDirectory.value);
  }

  function logout() {
    applySession({ demo: true });
    demoAsOf.value = null;
  }

  function can(_feature: keyof UserFeatures): boolean {
    return true;
  }

  function labelFor(id: HouseholdUserId | null | undefined): string {
    return labelForUser(id, userDirectory.value);
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
    userDirectory,
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
