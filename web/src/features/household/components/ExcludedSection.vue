<template>
  <section id="excluded" class="manual-section excluded-section minor-section">
    <button
      type="button"
      class="minor-section__toggle"
      :aria-expanded="open"
      aria-controls="excluded-body"
      @click="open = !open"
    >
      <span class="minor-section__title">{{ t("Excluded charges") }}</span>
      <span class="minor-section__count">{{ loading ? "…" : entries.length }}</span>
      <span class="minor-section__chevron" :class="{ 'is-open': open }" aria-hidden="true" />
    </button>

    <div v-show="open" id="excluded-body" class="minor-section__body">
    <p class="manual-section-lead">{{ t("Hidden from totals, charts, and pace. Restore a charge to count it in your spending again.") }}</p>

    <AppLoader
      v-if="loading"
      compact
      :title="t('Loading exclusions')"
      :subtitle="t('Fetching charges marked as not your spend')"
    />
    <template v-else>
      <p v-if="error" class="recurring-form-error">{{ error }}</p>
      <p v-else-if="!entries.length" class="manual-empty">
        {{ t("No excluded charges yet. Tap any charge in Spending and choose Exclude.") }}
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
              <span v-else>{{ t("Not my spend") }}</span>
              <span v-if="row.source === 'builtin'" class="excluded-source-pill">{{ t("Default") }}</span>
            </p>
            <button
              type="button"
              class="btn excluded-card-restore"
              :disabled="auth.readOnly || restoringKey === row.key"
              @click="restore(row)"
            >
              {{ restoringKey === row.key ? t("Restoring…") : t("Restore") }}
            </button>
          </div>
        </article>
      </div>
      <p v-if="status" class="excluded-section-status">{{ status }}</p>
    </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { t } from "@/shared/i18n";
import { merchantDisplayName } from "@/shared/utils/merchantNames";
import { friendlyError } from "@/shared/utils/friendlyError";
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { removeExclusion } from "@/shared/api/client";
import AppLoader from "@/shared/components/AppLoader.vue";
import { useAuthStore } from "@/shared/stores/auth";
import { useExclusionsDataStore } from "@/shared/stores/viewData";
import { invalidateSpendingDataCaches } from "@/shared/stores/invalidateCaches";
import type { ExcludedItem } from "@/shared/types";
import { formatIls, formatTransactionDate } from "@/shared/utils/format";

const auth = useAuthStore();
// Rarely used: collapsed by default, opened when linked to directly (#excluded).
const open = ref(useRoute().hash === "#excluded");
const exclusionsData = useExclusionsDataStore();
const loading = ref(true);
const error = ref("");
const status = ref("");
const entries = ref<ExcludedItem[]>([]);
const restoringKey = ref<string | null>(null);

function excludedMerchantLabel(row: ExcludedItem): string {
  if (!row.merchant_en?.trim() && !row.merchant_he?.trim()) return row.key;
  return merchantDisplayName({ merchant_he: row.merchant_he ?? "", merchant_en: row.merchant_en });
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
      error.value = friendlyError(e);
      entries.value = [];
    }
  } finally {
    if (!options.background) loading.value = false;
  }
}

async function restore(row: ExcludedItem) {
  if (auth.readOnly) return;
  restoringKey.value = row.key;
  status.value = "";
  try {
    await removeExclusion(row.key, auth.token || undefined);
    entries.value = entries.value.filter((e) => e.key !== row.key);
    exclusionsData.invalidate();
    invalidateSpendingDataCaches();
    status.value = t("Charge restored — totals will update on Overview.");
  } catch (e) {
    status.value = friendlyError(e);
  } finally {
    restoringKey.value = null;
  }
}

onMounted(load);
</script>
