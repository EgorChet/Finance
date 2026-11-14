<template>
  <div class="merchants-page">
    <div class="merchants-tabs" role="tablist" :aria-label="t('Merchants')">
      <button
        type="button"
        role="tab"
        class="merchants-tab"
        :class="{ 'merchants-tab--active': tab === 'label' }"
        :aria-selected="tab === 'label'"
        @click="setTab('label')"
      >
        {{ t("To label") }}
      </button>
      <button
        type="button"
        role="tab"
        class="merchants-tab"
        :class="{ 'merchants-tab--active': tab === 'mappings' }"
        :aria-selected="tab === 'mappings'"
        @click="setTab('mappings')"
      >
        {{ t("All merchants") }}
      </button>
    </div>
    <ReviewView v-if="tab === 'label'" embedded />
    <MappingsView v-else embedded />
  </div>
</template>

<script setup lang="ts">
import { t } from "@/shared/i18n";
import { computed, onMounted } from "vue";
import { useAuthStore } from "@/shared/stores/auth";
import { useReviewDataStore } from "@/features/merchants/stores/reviewData";
import { useRoute, useRouter } from "vue-router";
import MappingsView from "@/features/merchants/MappingsView.vue";
import ReviewView from "@/features/merchants/ReviewView.vue";

type MerchantsTab = "label" | "mappings";

const route = useRoute();
const router = useRouter();

const auth = useAuthStore();
const reviewData = useReviewDataStore();

/** Opens on "To label" only when something is waiting for a name; otherwise on the full list. */
const tab = computed<MerchantsTab>(() => {
  if (route.query.tab === "mappings" || route.query.tab === "label") return route.query.tab;
  return (reviewData.data?.queue.length ?? 0) > 0 ? "label" : "mappings";
});

onMounted(() => {
  if (reviewData.data) return;
  void reviewData
    .load(auth.isDemo, auth.token || undefined, { includeReviewed: false, includeLabeled: false, onePerMerchant: true })
    .catch(() => undefined);
});

function setTab(next: MerchantsTab) {
  if (next === tab.value) return;
  router.replace({
    name: "browse",
    query: { view: "merchants", tab: next },
  });
}
</script>
