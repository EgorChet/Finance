<template>
  <div class="login-page">
    <div class="login-card">
      <h1>Finance</h1>
      <p class="login-lead">
        Track Leumi Visa spending in English — categories, cycle pace, merchant rules, and monthly trends.
      </p>

      <template v-if="showPasswordForm">
        <fieldset class="login-user-picker">
          <legend class="field-label">You are</legend>
          <div class="login-user-options">
            <label
              v-for="person in loginUsers"
              :key="person.id"
              class="login-user-option"
              :class="{ 'login-user-option--active': selectedUser === person.id }"
            >
              <input v-model="selectedUser" type="radio" name="login-user" :value="person.id" />
              <span>{{ person.label }}</span>
            </label>
          </div>
        </fieldset>

        <label>Password</label>
        <input
          ref="passwordInput"
          v-model="password"
          class="input"
          type="password"
          placeholder="Enter password"
          autocomplete="current-password"
          @keyup.enter="doLogin"
        />
        <p v-if="auth.error" class="login-error">{{ auth.error }}</p>
        <div class="login-actions">
          <button class="btn btn-primary" :disabled="auth.loading" @click="doLogin">
            {{ auth.loading ? "Signing in…" : "Sign in — my spending" }}
          </button>
          <button class="btn btn-ghost" type="button" @click="tryDemo">Try demo first</button>
        </div>
      </template>

      <template v-else>
        <div class="login-actions">
          <button class="btn btn-primary" type="button" @click="tryDemo">Explore demo</button>
          <button class="btn btn-ghost" type="button" @click="goApp">Open app</button>
        </div>
      </template>

      <ul class="login-features">
        <li>Hebrew statements → English categories</li>
        <li>Cycle pace vs your usual spending</li>
        <li>Partial mid-month snapshots</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import type { HouseholdUserId } from "../types";
import { DEFAULT_HOUSEHOLD_USERS } from "../utils/users";
import { shouldShowSignInForm, wantsSignIn } from "../utils/signIn";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const password = ref("");
const passwordInput = ref<HTMLInputElement | null>(null);
const selectedUser = ref<HouseholdUserId>("egor");
const loginUsers = computed(() => auth.householdUsers);

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
    passwordInput.value?.focus();
  }
});

async function doLogin() {
  if (!password.value.trim()) {
    auth.error = "Enter your password";
    return;
  }
  try {
    await auth.login(password.value, selectedUser.value);
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
