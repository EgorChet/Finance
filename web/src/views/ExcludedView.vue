<template>
  <div>
    <div v-if="auth.isDemo" class="demo-banner">
      Demo mode — exclusions are read-only. Sign in to exclude charges from your totals.
    </div>
    <h2 class="page-title">Excluded charges</h2>
    <p class="page-lead">
      These transactions are hidden from totals, charts, and pace. Restoring a charge puts it back in your spending.
    </p>

    <AppLoader
      v-if="loading"
      title="Loading exclusions"
      subtitle="Fetching charges you've marked as not your spend"
    />
    <template v-else>
      <p v-if="error" style="color: var(--danger)">{{ error }}</p>
      <p v-else-if="!entries.length" style="color: var(--text-muted)">
        No excluded charges yet. Use <strong>Exclude</strong> on Overview transactions.
      </p>
      <div v-else class="excluded-list">
        <article v-for="row in entries" :key="row.key" class="excluded-card">
          <div class="excluded-card-head">
            <span class="excluded-card-amount">{{ row.amount != null ? formatIls(row.amount) : "—" }}</span>
            <span class="excluded-card-date">{{ row.date ? formatTransactionDate(row.date) : "—" }}</span>
          </div>
          <p class="excluded-card-merchant">{{ row.merchant_he || row.key }}</p>
          <p class="excluded-card-note">
            <span v-if="row.note">{{ row.note }}</span>
            <span v-else>Not my spend</span>
            <span v-if="row.source === 'builtin'" class="excluded-source-pill">Default</span>
          </p>
          <button
            type="button"
            class="btn btn-ghost"
            :disabled="auth.isDemo || restoringKey === row.key"
            @click="restore(row)"
          >
            {{ restoringKey === row.key ? "Restoring…" : "Restore" }}
          </button>
        </article>
      </div>
      <p v-if="status" style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0.75rem">{{ status }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { fetchExclusions, removeExclusion } from "../api/client";
import AppLoader from "../components/AppLoader.vue";
import { useAuthStore } from "../stores/auth";
import type { ExcludedItem } from "../types";
import { formatIls, formatTransactionDate } from "../utils/format";

const auth = useAuthStore();
const loading = ref(true);
const error = ref("");
const status = ref("");
const entries = ref<ExcludedItem[]>([]);
const restoringKey = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = "";
  status.value = "";
  try {
    const data = await fetchExclusions(auth.isDemo, auth.token || undefined);
    entries.value = data.entries;
  } catch (e) {
    error.value = String(e);
    entries.value = [];
  } finally {
    loading.value = false;
  }
}

async function restore(row: ExcludedItem) {
  if (auth.isDemo) return;
  restoringKey.value = row.key;
  status.value = "";
  try {
    await removeExclusion(row.key, auth.token || undefined);
    entries.value = entries.value.filter((e) => e.key !== row.key);
    status.value = "Charge restored — totals will update on Overview.";
  } catch (e) {
    status.value = String(e);
  } finally {
    restoringKey.value = null;
  }
}

onMounted(load);
</script>
