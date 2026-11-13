<template>
  <!-- One way to choose a category everywhere: suggestions, search, then the full list. -->
  <div class="cp">
    <div v-if="shownSuggestions.length && !query" class="cp-suggest">
      <p class="cp-label">{{ t("Suggested") }}</p>
      <div class="cp-chips">
        <button
          v-for="c in shownSuggestions"
          :key="c"
          type="button"
          class="cp-chip"
          :class="{ 'cp-chip--on': modelValue === c }"
          @click="pick(c)"
        >
          <CategoryIcon :category="c" size="sm" />
          <span>{{ catName(c) }}</span>
        </button>
      </div>
    </div>

    <label class="cp-search">
      <span class="cp-search-icon" aria-hidden="true">⌕</span>
      <input
        v-model="query"
        type="search"
        :placeholder="t('Search categories')"
        autocomplete="off"
        enterkeyhint="search"
        :aria-label="t('Search categories')"
      />
    </label>

    <div class="cp-list" role="listbox" :aria-label="t('Category')">
      <button
        v-if="emptyLabel && !query"
        type="button"
        role="option"
        class="cp-row"
        :class="{ 'cp-row--on': !modelValue }"
        :aria-selected="!modelValue"
        @click="pick('')"
      >
        <span class="cp-any" aria-hidden="true">✱</span>
        <span class="cp-name">{{ t(emptyLabel) }}</span>
        <span v-if="!modelValue" class="cp-check" aria-hidden="true">✓</span>
      </button>
      <template v-for="group in groups" :key="group.title">
        <p v-if="!query" class="cp-label">{{ t(group.title) }}</p>
        <button
          v-for="c in group.items"
          :key="c"
          type="button"
          role="option"
          class="cp-row"
          :class="{ 'cp-row--on': modelValue === c }"
          :aria-selected="modelValue === c"
          @click="pick(c)"
        >
          <CategoryIcon :category="c" size="sm" />
          <span class="cp-name">{{ catName(c) }}</span>
          <span v-if="modelValue === c" class="cp-check" aria-hidden="true">✓</span>
        </button>
      </template>
      <p v-if="query && !groups.length" class="cp-empty">{{ t("No category matches.") }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import CategoryIcon from "@/shared/components/CategoryIcon.vue";
import { catName, t } from "@/shared/i18n";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    options: readonly string[];
    /** Shown first as one-tap chips (e.g. what BIT transfers usually are). */
    suggestions?: readonly string[];
    /** Adds a first row that clears the value ("Any category"). */
    emptyLabel?: string;
  }>(),
  { suggestions: () => [], emptyLabel: "" },
);

const emit = defineEmits<{ "update:modelValue": [string]; pick: [string] }>();
const query = ref("");

const GROUPS: { title: string; items: string[] }[] = [
  {
    title: "Everyday",
    items: [
      "Groceries", "Eating out", "Coffee", "Transport", "Clothes", "Leisure & Entertainment",
      "Health & Medical", "Beauty & Personal Care", "Nails", "Kids", "Pets", "Tourism", "Hookah", "BIT",
    ],
  },
  {
    title: "Home & bills",
    items: [
      "Housing", "Home & Living", "Home & Furniture", "Electronics & computers", "Subscriptions",
      "Mobile phone", "Fitness", "Education",
    ],
  },
  { title: "Other", items: ["Bank fees", "Government & Institutions", "Miscellaneous", "Other", "Uncategorized"] },
];

const shownSuggestions = computed(() => props.suggestions.filter((c) => props.options.includes(c)).slice(0, 4));

function matches(c: string, q: string): boolean {
  return catName(c).toLowerCase().includes(q) || c.toLowerCase().includes(q);
}

const groups = computed(() => {
  const q = query.value.trim().toLowerCase();
  const known = new Set(GROUPS.flatMap((g) => g.items));
  const extra = props.options.filter((c) => !known.has(c));
  const list = GROUPS.map((g, i) => ({
    title: g.title,
    items: [...g.items, ...(i === GROUPS.length - 1 ? extra : [])].filter((c) => props.options.includes(c)),
  }));
  if (!q) return list.filter((g) => g.items.length);
  const found = list.flatMap((g) => g.items).filter((c) => matches(c, q));
  return found.length ? [{ title: "", items: found }] : [];
});

function pick(c: string) {
  query.value = "";
  emit("update:modelValue", c);
  emit("pick", c);
}
</script>
