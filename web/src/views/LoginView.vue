<template>
  <div class="login-page">
    <div class="login-card">
      <h1>Finance</h1>
      <p class="login-lead">
        Track Leumi Visa spending in English — categories, cycle pace, merchant rules, and monthly trends.
      </p>

      <template v-if="auth.authRequired">
        <label>Password</label>
        <input
          v-model="password"
          class="input"
          type="password"
          placeholder="Enter password"
          @keyup.enter="doLogin"
        />
        <p v-if="auth.error" style="color: var(--danger); margin-top: 0.5rem">{{ auth.error }}</p>
        <div class="login-actions">
          <button class="btn btn-primary" :disabled="auth.loading" @click="doLogin">
            {{ auth.loading ? "Signing in…" : "Sign in — my spending" }}
          </button>
          <button class="btn btn-ghost" @click="tryDemo">Try demo first</button>
        </div>
      </template>

      <template v-else>
        <div class="login-actions">
          <button class="btn btn-primary" @click="tryDemo">Explore demo</button>
          <button class="btn btn-ghost" @click="goApp">Open app</button>
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
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
const router = useRouter();
const password = ref("");

async function doLogin() {
  try {
    await auth.login(password.value);
    router.push("/app/home");
  } catch {
    /* error shown */
  }
}

function tryDemo() {
  auth.enterDemo();
  router.push("/app/home");
}

function goApp() {
  auth.isDemo = false;
  router.push("/app/home");
}
</script>
