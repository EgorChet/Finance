<template>
  <section id="splits" class="manual-section excluded-section">
    <header class="manual-section-header">
      <div>
        <h3 class="manual-section-title">Split charges</h3>
        <p class="manual-section-lead">
          Charges you paid for others — only your share counts toward totals.
        </p>
      </div>
    </header>

    <AppLoader
      v-if="loading"
      compact
      title="Loading splits"
      subtitle="Fetching reimbursed charges"
    />
    <template v-else>
      <p v-if="error" class="recurring-form-error">{{ error }}</p>
      <p v-else-if="!entries.length" class="manual-empty">
        No split charges yet. Use <strong>Split</strong> on Overview transactions.
      </p>
      <div v-else class="excluded-list">
        <article v-for="row in entries" :key="row.key" class="excluded-card">
          <div class="excluded-card-head">
            <span class="excluded-card-amount">
              {{ row.effective_amount != null ? formatIls(row.effective_amount) : "—" }}
            </span>
            <span class="excluded-card-date">{{ row.date ? formatTransactionDate(row.date) : "—" }}</span>
          </div>
          <p class="excluded-card-merchant">{{ merchantLabel(row) }}</p>
          <p v-if="merchantSubtitle(row)" class="excluded-card-merchant-sub">{{ merchantSubtitle(row) }}</p>
          <div class="excluded-card-footer">
            <p class="excluded-card-note">
              <span v-if="row.amount != null && row.reimbursement">
                {{ formatIls(row.amount) }} − {{ formatIls(row.reimbursement) }} back
              </span>
              <span v-if="row.note"> · {{ row.note }}</span>
            </p>
            <button
              type="button"
              class="btn excluded-card-restore"
              :disabled="auth.isDemo || removingKey === row.key"
              @click="remove(row)"
            >
              {{ removingKey === row.key ? "Removing…" : "Remove split" }}
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
import { removeAdjustment } from "@/shared/api/client";
import AppLoader from "@/shared/components/AppLoader.vue";
import { useAuthStore } from "@/shared/stores/auth";
import { useAdjustmentsDataStore } from "@/shared/stores/viewData";
import { invalidateSpendingDataCaches } from "@/shared/stores/invalidateCaches";
import type { AdjustmentItem } from "@/shared/types";
import { formatIls, formatTransactionDate } from "@/shared/utils/format";

const auth = useAuthStore();
const adjustmentsData = useAdjustmentsDataStore();
const loading = ref(true);
const error = ref("");
const status = ref("");
const entries = ref<AdjustmentItem[]>([]);
const removingKey = ref<string | null>(null);

function merchantLabel(row: AdjustmentItem): string {
  return row.merchant_en?.trim() || row.merchant_he?.trim() || row.key;
}

function merchantSubtitle(row: AdjustmentItem): string | null {
  const en = row.merchant_en?.trim();
  const he = row.merchant_he?.trim();
  if (!en || !he || en === he) return null;
  return he;
}

async function load(options: { background?: boolean; force?: boolean } = {}) {
  const demo = auth.isDemo;
  const token = auth.token || undefined;
  const cached = !options.force && !options.background && adjustmentsData.peek(demo, token);

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
    entries.value = await adjustmentsData.load(demo, token, options);
  } catch (e) {
    if (!options.background) {
      error.value = String(e);
      entries.value = [];
    }
  } finally {
    if (!options.background) loading.value = false;
  }
}

async function remove(row: AdjustmentItem) {
  if (auth.isDemo) return;
  removingKey.value = row.key;
  status.value = "";
  try {
    await removeAdjustment(row.key, auth.token || undefined);
    entries.value = entries.value.filter((e) => e.key !== row.key);
    adjustmentsData.invalidate();
    invalidateSpendingDataCaches();
    status.value = "Split removed — totals will update on Overview.";
  } catch (e) {
    status.value = String(e);
  } finally {
    removingKey.value = null;
  }
}

onMounted(load);
</script>
