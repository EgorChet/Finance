<template>
  <section id="excluded" class="manual-section excluded-section">
    <header class="manual-section-header">
      <div>
        <h3 class="manual-section-title">Excluded charges</h3>
        <p class="manual-section-lead">
          Hidden from totals, charts, and pace. Restore a charge to count it in your spending again.
        </p>
      </div>
    </header>

    <AppLoader
      v-if="loading"
      compact
      title="Loading exclusions"
      subtitle="Fetching charges marked as not your spend"
    />
    <template v-else>
      <p v-if="error" class="recurring-form-error">{{ error }}</p>
      <p v-else-if="!entries.length" class="manual-empty">
        No excluded charges yet. Use <strong>Exclude</strong> on Overview transactions.
      </p>
      <div v-else class="excluded-list">
        <article v-for="row in entries" :key="row.key" class="excluded-card">
          <div class="excluded-card-head">
            <span class="excluded-card-amount">{{ row.amount != null ? formatIls(row.amount) : "—" }}</span>
            <span class="excluded-card-date">{{ row.date ? formatTransactionDate(row.date) : "—" }}</span>
          </div>
          <p class="excluded-card-merchant">{{ excludedMerchantLabel(row) }}</p>
          <p v-if="excludedMerchantSubtitle(row)" class="excluded-card-merchant-sub">{{ excludedMerchantSubtitle(row) }}</p>
          <div class="excluded-card-footer">
            <p class="excluded-card-note">
              <span v-if="row.note">{{ row.note }}</span>
              <span v-else>Not my spend</span>
              <span v-if="row.source === 'builtin'" class="excluded-source-pill">Default</span>
            </p>
            <button
              type="button"
              class="btn excluded-card-restore"
              :disabled="auth.isDemo || restoringKey === row.key"
              @click="restore(row)"
            >
              {{ restoringKey === row.key ? "Restoring…" : "Restore" }}
            </button>
          </div>
        </article>
      </div>
      <p v-if="status" class="excluded-section-status">{{ status }}</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { removeExclusion } from "@/shared/api/client";
import AppLoader from "@/shared/components/AppLoader.vue";
import { useAuthStore } from "@/shared/stores/auth";
import { useExclusionsDataStore } from "@/shared/stores/viewData";
import { invalidateSpendingDataCaches } from "@/shared/stores/invalidateCaches";
import type { ExcludedItem } from "@/shared/types";
import { formatIls, formatTransactionDate } from "@/shared/utils/format";

const auth = useAuthStore();
const exclusionsData = useExclusionsDataStore();
const loading = ref(true);
const error = ref("");
const status = ref("");
const entries = ref<ExcludedItem[]>([]);
const restoringKey = ref<string | null>(null);

function excludedMerchantLabel(row: ExcludedItem): string {
  return row.merchant_en?.trim() || row.merchant_he?.trim() || row.key;
}

function excludedMerchantSubtitle(row: ExcludedItem): string | null {
  const en = row.merchant_en?.trim();
  const he = row.merchant_he?.trim();
  if (!en || !he || en === he) return null;
  return he;
}

async function load(options: { background?: boolean; force?: boolean } = {}) {
  const demo = auth.isDemo;
  const token = auth.token || undefined;
  const cached = !options.force && !options.background && exclusionsData.peek(demo, token);

  if (cached) {
    entries.value = cached;
    loading.value = false;
    void load({ background: true });
    return;
  }

  if (!options.background) {
    loading.value = true;
    error.value = "";
    status.value = "";
  }
  try {
    entries.value = await exclusionsData.load(demo, token, options);
  } catch (e) {
    if (!options.background) {
      error.value = String(e);
      entries.value = [];
    }
  } finally {
    if (!options.background) loading.value = false;
  }
}

async function restore(row: ExcludedItem) {
  if (auth.isDemo) return;
  restoringKey.value = row.key;
  status.value = "";
  try {
    await removeExclusion(row.key, auth.token || undefined);
    entries.value = entries.value.filter((e) => e.key !== row.key);
    exclusionsData.invalidate();
    invalidateSpendingDataCaches();
    status.value = "Charge restored — totals will update on Overview.";
  } catch (e) {
    status.value = String(e);
  } finally {
    restoringKey.value = null;
  }
}

onMounted(load);
</script>
