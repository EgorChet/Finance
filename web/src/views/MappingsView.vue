<template>
  <div>
    <div v-if="auth.isDemo" class="demo-banner">Demo mode — rules are read-only.</div>
    <h2 class="page-title">Merchant mappings</h2>
    <AppLoader
      v-if="loading"
      title="Loading merchant mappings"
      subtitle="Fetching your saved labels and categories"
    />
    <template v-else>
    <div v-if="statusMessage" class="demo-banner" :class="{ 'import-error': statusIsError }">
      {{ statusMessage }}
    </div>
    <div class="mappings-toolbar">
      <input
        v-model="searchQuery"
        class="input mappings-search"
        type="search"
        placeholder="Search Hebrew, English, or category"
        autocomplete="off"
      />
      <p class="mappings-search-meta">
        <template v-if="searchQuery.trim()">
          {{ filteredRows.length }} of {{ rows.length }} mappings
        </template>
        <template v-else>{{ rows.length }} mappings</template>
      </p>
    </div>
    <div v-if="!auth.isDemo" class="mappings-actions">
      <button class="btn btn-primary" :disabled="saving || !hasUnsavedChanges" @click="save">
        {{ saveButtonLabel }}
      </button>
      <button class="btn" @click="exportJson">Export</button>
      <button class="btn" type="button" :disabled="importing" @click="importInput?.click()">
        {{ importing ? "Importing…" : "Import" }}
      </button>
      <button class="btn" type="button" @click="showAddForm = !showAddForm">
        {{ showAddForm ? "Cancel" : "Add mapping" }}
      </button>
      <input ref="importInput" type="file" accept=".json,application/json" hidden @change="importJson" />
    </div>
    <div v-if="showAddForm && !auth.isDemo" class="mappings-add-form">
      <input v-model="newHebrew" class="input" placeholder="Hebrew name" />
      <input v-model="newEnglish" class="input" placeholder="English name" />
      <CategorySelect v-model="newCategory" :options="categories" allow-empty empty-label="Category" />
      <button class="btn btn-primary mappings-add-submit" @click="addRule">Add</button>
    </div>
    <div v-if="filteredRows.length" class="mappings-list">
      <article v-for="row in filteredRows" :key="row.Hebrew" class="mappings-card">
        <p class="mappings-card-hebrew" dir="rtl">{{ row.Hebrew }}</p>
        <div class="field-group">
          <label class="field-label">English</label>
          <input v-model="row.English" class="input" :readonly="auth.isDemo" />
        </div>
        <div class="field-group">
          <label class="field-label">Category</label>
          <CategorySelect
            v-model="row.Category"
            :options="categories"
            :disabled="auth.isDemo"
            allow-empty
            empty-label="Uncategorized"
          />
        </div>
      </article>
    </div>
    <p v-else-if="rows.length" class="mappings-empty">No mappings match your search.</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { fetchRules, saveRuleEntry, saveRules } from "../api/client";
import AppLoader from "../components/AppLoader.vue";
import CategorySelect from "../components/CategorySelect.vue";
import { useAuthStore } from "../stores/auth";
import { CATEGORY_PICKLIST } from "../categories";
import type { MerchantRow } from "../types";

const categories = CATEGORY_PICKLIST;

const auth = useAuthStore();
const rows = ref<MerchantRow[]>([]);
const loading = ref(true);
const hydrated = ref(false);
const savedSnapshot = ref("");
const saving = ref(false);
const importing = ref(false);
const importInput = ref<HTMLInputElement | null>(null);
const statusMessage = ref("");
const statusIsError = ref(false);
const newHebrew = ref("");
const newEnglish = ref("");
const newCategory = ref("");
const searchQuery = ref("");
const showAddForm = ref(false);
/** Hebrew keys that matched the last search — stays stable while you edit fields. */
const matchedHebrewKeys = ref<string[] | null>(null);

function rowMatchesQuery(row: MerchantRow, q: string): boolean {
  return (
    row.Hebrew.toLowerCase().includes(q) ||
    row.English.toLowerCase().includes(q) ||
    row.Category.toLowerCase().includes(q)
  );
}

function refreshSearchMatches() {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) {
    matchedHebrewKeys.value = null;
    return;
  }
  matchedHebrewKeys.value = rows.value.filter((row) => rowMatchesQuery(row, q)).map((row) => row.Hebrew);
}

watch(searchQuery, refreshSearchMatches);

const filteredRows = computed(() => {
  if (!matchedHebrewKeys.value) return rows.value;
  const keys = new Set(matchedHebrewKeys.value);
  return rows.value.filter((row) => keys.has(row.Hebrew));
});

type RuleEntry = { english: string; category?: string };

function serializeRules(rules: Record<string, RuleEntry>): string {
  return JSON.stringify(rules, Object.keys(rules).sort());
}

function syncSnapshot() {
  savedSnapshot.value = serializeRules(rulesFromRows());
}

function getDirtyEntries(): Array<{ hebrew: string; english: string; category?: string }> {
  const current = rulesFromRows();
  const saved = JSON.parse(savedSnapshot.value || "{}") as Record<string, RuleEntry>;
  const dirty: Array<{ hebrew: string; english: string; category?: string }> = [];
  for (const [hebrew, rule] of Object.entries(current)) {
    const prev = saved[hebrew];
    const category = rule.category || undefined;
    const prevCategory = prev?.category || undefined;
    if (!prev || prev.english !== rule.english || prevCategory !== category) {
      dirty.push({ hebrew, english: rule.english, category });
    }
  }
  return dirty;
}

const dirtyCount = computed(() => (hydrated.value ? getDirtyEntries().length : 0));
const hasUnsavedChanges = computed(() => dirtyCount.value > 0);

const saveButtonLabel = computed(() => {
  if (saving.value) return "Saving…";
  if (!hasUnsavedChanges.value) return "Save changes";
  if (dirtyCount.value === 1) return "Save 1 change";
  return `Save ${dirtyCount.value} changes`;
});

function rulesFromRows() {
  const rules: Record<string, { english: string; category?: string }> = {};
  for (const row of rows.value) {
    rules[row.Hebrew] = {
      english: row.English.trim(),
      category: row.Category || undefined,
    };
  }
  return rules;
}

function rowsFromRules(rules: Record<string, { english: string; category?: string | null }>) {
  return Object.entries(rules)
    .map(([Hebrew, rule]) => ({
      Hebrew,
      English: rule.english || "",
      Category: rule.category || "",
    }))
    .sort((a, b) => a.Hebrew.localeCompare(b.Hebrew));
}

function setStatus(message: string, isError = false) {
  statusMessage.value = message;
  statusIsError.value = isError;
}

async function load() {
  loading.value = true;
  hydrated.value = false;
  setStatus("");
  try {
    const rules = await fetchRules(auth.isDemo, auth.token || undefined);
    rows.value = rowsFromRules(rules);
    syncSnapshot();
    refreshSearchMatches();
  } catch (e) {
    setStatus(e instanceof Error ? e.message : "Could not load merchant rules", true);
    syncSnapshot();
  } finally {
    hydrated.value = true;
    loading.value = false;
  }
}

function addRule() {
  if (!newHebrew.value.trim()) return;
  rows.value.push({
    Hebrew: newHebrew.value.trim(),
    English: newEnglish.value.trim(),
    Category: newCategory.value.trim(),
  });
  rows.value.sort((a, b) => a.Hebrew.localeCompare(b.Hebrew));
  showAddForm.value = false;
  refreshSearchMatches();
  newHebrew.value = "";
  newEnglish.value = "";
  newCategory.value = "";
}

async function save() {
  if (auth.isDemo) return;
  const dirty = getDirtyEntries();
  if (!dirty.length) {
    setStatus("No changes to save.");
    return;
  }

  saving.value = true;
  setStatus("");
  const token = auth.token || undefined;
  try {
    if (dirty.length === 1) {
      const result = await saveRuleEntry(dirty[0], token);
      if (!result.ok) throw new Error("Server did not confirm save.");
    } else {
      const result = await saveRules(rulesFromRows(), token);
      if (!result.saved) throw new Error("Server did not confirm save.");
    }
    const rules = await fetchRules(false, token);
    rows.value = rowsFromRules(rules);
    syncSnapshot();
    refreshSearchMatches();
    setStatus(dirty.length === 1 ? "Saved 1 mapping." : `Saved ${dirty.length} mappings.`);
  } catch (e) {
    setStatus(e instanceof Error ? e.message : "Save failed", true);
  } finally {
    saving.value = false;
  }
}

function exportJson() {
  const blob = new Blob([JSON.stringify(rulesFromRows(), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "merchant_rules.json";
  a.click();
}

async function importJson(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || auth.isDemo) return;

  importing.value = true;
  setStatus("");
  try {
    const imported = JSON.parse(await file.text()) as Record<string, { english: string; category?: string }>;
    if (!imported || typeof imported !== "object" || Array.isArray(imported)) {
      throw new Error("JSON must be an object keyed by Hebrew merchant name.");
    }

    let added = 0;
    let updated = 0;
    for (const [he, rule] of Object.entries(imported)) {
      const hebrew = he.trim();
      if (!hebrew || !rule || typeof rule !== "object") continue;
      const english = typeof rule.english === "string" ? rule.english.trim() : "";
      const category = typeof rule.category === "string" ? rule.category : "";
      const existing = rows.value.find((r) => r.Hebrew === hebrew);
      if (existing) {
        existing.English = english;
        existing.Category = category;
        updated += 1;
      } else {
        rows.value.push({ Hebrew: hebrew, English: english, Category: category });
        added += 1;
      }
    }

    rows.value.sort((a, b) => a.Hebrew.localeCompare(b.Hebrew));
    refreshSearchMatches();
    setStatus(`Imported ${Object.keys(imported).length} rules (${added} new, ${updated} updated). Saving…`);

    const result = await saveRules(rulesFromRows(), auth.token || undefined);
    if (!result.saved) throw new Error("Server did not confirm save.");
    const rules = await fetchRules(false, auth.token || undefined);
    rows.value = rowsFromRules(rules);
    syncSnapshot();
    refreshSearchMatches();
    setStatus(`Imported and saved ${added + updated} mapping${added + updated === 1 ? "" : "s"}.`);
  } catch (e) {
    setStatus(e instanceof Error ? e.message : "Import failed", true);
  } finally {
    importing.value = false;
  }
}

onMounted(load);
</script>
