<template>
  <div class="login-page">
    <div class="login-glow" aria-hidden="true" />
    <div class="login-shell">
      <header class="login-brand">
        <div class="login-logo" aria-hidden="true">
          <svg viewBox="0 0 32 32">
            <path
              d="M9 24V9.5a1.5 1.5 0 0 1 1.5-1.5H15a5 5 0 0 1 5 5v5M23 8v14.5a1.5 1.5 0 0 1-1.5 1.5H17a5 5 0 0 1-5-5v-5"
              fill="none"
              stroke="currentColor"
              stroke-width="2.4"
              stroke-linecap="round"
            />
          </svg>
        </div>
        <div class="lang-switch login-lang" role="radiogroup" :aria-label="t('Language')">
          <button
            v-for="opt in LANGS"
            :key="opt"
            type="button"
            role="radio"
            class="lang-switch-btn"
            :class="{ 'lang-switch-btn--on': locale === opt }"
            :aria-checked="locale === opt"
            @click="setLocale(opt)"
          >
            {{ opt.toUpperCase() }}
          </button>
        </div>
        <h1 class="login-title">{{ t("Your money,") }}<br />{{ t("at a glance") }}</h1>
        <p class="login-lead">{{ t("Leumi Visa spending in plain English: budget, pace and categories.") }}</p>
      </header>

      <div class="login-card">
        <template v-if="showPasswordForm">
          <div class="login-field">
            <label for="login-username">{{ t("Name") }}</label>
            <input
              id="login-username"
              ref="usernameInput"
              v-model="username"
              class="input"
              type="text"
              :placeholder="t('Your name')"
              autocomplete="username"
              autocapitalize="none"
              spellcheck="false"
              @keyup.enter="focusPassword"
            />
          </div>
          <div class="login-field">
            <label for="login-password">{{ t("Password") }}</label>
            <input
              id="login-password"
              ref="passwordInput"
              v-model="password"
              class="input"
              type="password"
              placeholder="••••••••"
              autocomplete="current-password"
              @keyup.enter="doLogin"
            />
          </div>
          <p v-if="auth.error" class="login-error" role="alert">{{ t(auth.error) }}</p>
          <div class="login-actions">
            <button class="btn btn-primary login-submit" :disabled="auth.loading" @click="doLogin">
              {{ auth.loading ? t("Signing in…") : t("Sign in") }}
            </button>
            <button class="btn btn-ghost" type="button" @click="tryDemo">{{ t("Look around with demo data") }}</button>
          </div>
        </template>

        <template v-else>
          <div class="login-actions">
            <button class="btn btn-primary login-submit" type="button" @click="goApp">{{ t("Open app") }}</button>
            <button class="btn btn-ghost" type="button" @click="tryDemo">{{ t("Explore demo") }}</button>
          </div>
        </template>
      </div>

      <ul class="login-features">
        <li>
          <span class="login-feature-icon" aria-hidden="true">₪</span>
          <span>{{ t("Hebrew statements, English categories") }}</span>
        </li>
        <li>
          <span class="login-feature-icon" aria-hidden="true">↗</span>
          <span>{{ t("Pace vs your usual month") }}</span>
        </li>
        <li>
          <span class="login-feature-icon" aria-hidden="true">◔</span>
          <span>{{ t("Mid-cycle snapshots") }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { locale, setLocale, t } from "@/shared/i18n";

const LANGS = ["en", "ru"] as const;
import { computed, nextTick, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/shared/stores/auth";
import { shouldShowSignInForm, wantsSignIn } from "@/features/auth/utils/signIn";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const username = ref("");
const password = ref("");
const usernameInput = ref<HTMLInputElement | null>(null);
const passwordInput = ref<HTMLInputElement | null>(null);

const showPasswordForm = computed(() => shouldShowSignInForm(auth.authRequired, route.query));

async function ensureAuthStatus() {
  try {
    await auth.checkStatus();
  } catch {
    if (wantsSignIn(route.query)) {
      auth.error = "Could not reach the server — check your connection and try again.";
    }
  }
}

onMounted(async () => {
  await ensureAuthStatus();
  if (showPasswordForm.value) {
    await nextTick();
    usernameInput.value?.focus();
  }
});

function focusPassword() {
  passwordInput.value?.focus();
}

async function doLogin() {
  if (!username.value.trim()) {
    auth.error = "Enter your name";
    usernameInput.value?.focus();
    return;
  }
  if (!password.value.trim()) {
    auth.error = "Enter your password";
    passwordInput.value?.focus();
    return;
  }
  try {
    await auth.login(password.value, username.value);
    await router.push({ name: "home" });
  } catch {
    /* error shown */
  }
}

function tryDemo() {
  auth.enterDemo();
  router.push({ name: "home" });
}

function goApp() {
  auth.isDemo = false;
  router.push({ name: "home" });
}
</script>
