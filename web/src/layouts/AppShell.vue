<template>
  <div class="layout">
    <aside class="sidebar">
      <h1>Finance</h1>
      <RouterLink class="nav-link" to="/app/overview">Overview</RouterLink>
      <RouterLink class="nav-link" to="/app/mappings">Mappings</RouterLink>
      <RouterLink class="nav-link" to="/app/review">Review</RouterLink>
      <hr style="border-color: var(--border); margin: 1rem 0" />
      <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; color: var(--text-muted)">
        <input type="checkbox" :checked="app.lightMode" @change="app.toggleTheme()" />
        Light mode
      </label>
      <template v-if="!auth.isDemo">
        <button
          v-if="showLocalSync"
          class="btn"
          style="width: 100%; margin-top: 1rem"
          :disabled="syncing"
          @click="sync"
        >
          {{ syncing ? "Syncing…" : "Sync .xlsx files" }}
        </button>
        <input ref="uploadInput" type="file" accept=".xlsx" hidden @change="onUpload" />
        <button
          class="btn"
          style="width: 100%; margin-top: 0.5rem"
          :disabled="uploading"
          @click="uploadInput?.click()"
        >
          {{ uploading ? "Uploading…" : "Upload statement" }}
        </button>
        <p v-if="uploadName" class="sidebar-note">{{ uploadName }}</p>
      </template>
      <button v-if="auth.authRequired && auth.isAuthenticated" class="btn" style="width: 100%; margin-top: 1rem" @click="logout">
        Sign out
      </button>
      <button v-if="auth.isDemo" class="btn" style="width: 100%; margin-top: 1rem" @click="goLogin">
        Sign in for real data
      </button>
    </aside>
    <main class="main">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { syncStatements, uploadStatement } from "../api/client";
import { useAppStore } from "../stores/app";
import { useAuthStore } from "../stores/auth";

const app = useAppStore();
const auth = useAuthStore();
const router = useRouter();
const syncing = ref(false);
const uploading = ref(false);
const uploadName = ref("");
const uploadInput = ref<HTMLInputElement | null>(null);

/** Sync reads local `statements/` folder — only available when the UI talks to localhost. */
const showLocalSync = computed(() => !import.meta.env.VITE_API_URL);

async function sync() {
  syncing.value = true;
  try {
    await syncStatements(auth.token || undefined);
    window.location.reload();
  } finally {
    syncing.value = false;
  }
}

async function onUpload(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploading.value = true;
  uploadName.value = file.name;
  try {
    await uploadStatement(file, auth.token || undefined);
    window.location.reload();
  } catch {
    uploading.value = false;
    uploadName.value = "";
    input.value = "";
  }
}

function logout() {
  auth.logout();
  router.push("/");
}

function goLogin() {
  router.push("/");
}
</script>
