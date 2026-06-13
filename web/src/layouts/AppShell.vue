<template>
  <div class="app-layout">
    <header class="app-header">
      <h1 class="app-title">Finance</h1>
      <nav class="app-nav">
        <RouterLink class="nav-tab" to="/app/overview">Overview</RouterLink>
        <RouterLink class="nav-tab" to="/app/mappings">Mappings</RouterLink>
        <RouterLink class="nav-tab" to="/app/review">Review</RouterLink>
      </nav>
      <div class="app-header-actions">
        <button type="button" class="btn btn-icon" aria-label="Menu" @click="menuOpen = !menuOpen">⋯</button>
        <div v-if="menuOpen" class="app-menu-backdrop" @click="menuOpen = false" />
        <div v-if="menuOpen" class="app-menu">
          <label class="app-menu-item">
            <input type="checkbox" :checked="app.lightMode" @change="app.toggleTheme()" />
            Light mode
          </label>
          <template v-if="!auth.isDemo">
            <button
              v-if="showLocalSync"
              type="button"
              class="app-menu-item btn"
              :disabled="syncing"
              @click="sync"
            >
              {{ syncing ? "Syncing…" : "Sync .xlsx files" }}
            </button>
            <input ref="uploadInput" type="file" accept=".xlsx" hidden @change="onUpload" />
            <button
              type="button"
              class="app-menu-item btn"
              :disabled="uploading"
              @click="uploadInput?.click()"
            >
              {{ uploading ? "Uploading…" : "Upload statement" }}
            </button>
            <p v-if="uploadName" class="app-menu-note">{{ uploadName }}</p>
            <p v-if="uploadError" class="app-menu-note app-menu-error">{{ uploadError }}</p>
          </template>
          <button
            v-if="auth.authRequired && auth.isAuthenticated"
            type="button"
            class="app-menu-item btn"
            @click="logout"
          >
            Sign out
          </button>
          <button v-if="auth.isDemo" type="button" class="app-menu-item btn" @click="goLogin">
            Sign in for real data
          </button>
        </div>
      </div>
    </header>
    <main class="main">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { syncStatements, uploadStatement, warmApi } from "../api/client";
import { useAppStore } from "../stores/app";
import { useAuthStore } from "../stores/auth";

const app = useAppStore();
const auth = useAuthStore();
const router = useRouter();
const syncing = ref(false);
const uploading = ref(false);
const uploadName = ref("");
const uploadError = ref("");
const uploadInput = ref<HTMLInputElement | null>(null);
const menuOpen = ref(false);

const showLocalSync = computed(() => !import.meta.env.VITE_API_URL);

async function sync() {
  menuOpen.value = false;
  syncing.value = true;
  try {
    await syncStatements(auth.token || undefined);
    window.location.reload();
  } finally {
    syncing.value = false;
  }
}

async function onUpload(e: Event) {
  menuOpen.value = false;
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploading.value = true;
  uploadName.value = file.name;
  uploadError.value = "";
  try {
    uploadName.value = "Waking server…";
    await warmApi(auth.token || undefined);
    uploadName.value = file.name;
    await uploadStatement(file, auth.token || undefined);
    window.location.reload();
  } catch (err) {
    uploading.value = false;
    uploadName.value = file.name;
    uploadError.value = err instanceof Error ? err.message : String(err);
    input.value = "";
  }
}

function logout() {
  menuOpen.value = false;
  auth.logout();
  router.push("/");
}

function goLogin() {
  menuOpen.value = false;
  router.push("/");
}
</script>
