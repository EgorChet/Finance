<template>
  <div class="merchants-page">
    <div class="merchants-tabs" role="tablist" aria-label="Merchants">
      <button
        type="button"
        role="tab"
        class="merchants-tab"
        :class="{ 'merchants-tab--active': tab === 'label' }"
        :aria-selected="tab === 'label'"
        @click="setTab('label')"
      >
        To label
      </button>
      <button
        type="button"
        role="tab"
        class="merchants-tab"
        :class="{ 'merchants-tab--active': tab === 'mappings' }"
        :aria-selected="tab === 'mappings'"
        @click="setTab('mappings')"
      >
        All merchants
      </button>
    </div>
    <ReviewView v-if="tab === 'label'" embedded />
    <MappingsView v-else embedded />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import MappingsView from "@/features/merchants/MappingsView.vue";
import ReviewView from "@/features/merchants/ReviewView.vue";

type MerchantsTab = "label" | "mappings";

const route = useRoute();
const router = useRouter();

const tab = computed<MerchantsTab>(() => (route.query.tab === "mappings" ? "mappings" : "label"));

function setTab(next: MerchantsTab) {
  if (next === tab.value) return;
  router.replace({
    name: "browse",
    query: next === "mappings" ? { view: "merchants", tab: "mappings" } : { view: "merchants" },
  });
}
</script>
