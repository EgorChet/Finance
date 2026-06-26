<template>
  <div>
    <div v-if="auth.isDemo" class="demo-banner">Demo mode — rules are read-only.</div>
    <h2 v-if="!embedded" class="page-title">Merchant mappings</h2>
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
        <div class="mappings-toolbar-row">
          <input
            v-model="searchQuery"
            class="input mappings-search"
            type="search"
            placeholder="Search Hebrew, English, or category"
            autocomplete="off"
          />
          <template v-if="!auth.isDemo">
            <button type="button" class="btn" @click="exportJson">Export</button>
            <button type="button" class="btn" :disabled="importing" @click="importInput?.click()">
              {{ importing ? "Importing…" : "Import" }}
            </button>
            <input ref="importInput" type="file" accept=".json,application/json" hidden @change="importJson" />
          </template>
        </div>
        <p class="mappings-search-meta">
          <template v-if="searchQuery.trim()">
            {{ filteredRows.length }} of {{ rows.length }} mappings
          </template>
          <template v-else>{{ rows.length }} mappings</template>
        </p>
      </div>
      <div v-if="filteredRows.length" class="mappings-list">
        <article v-for="row in filteredRows" :key="row.Hebrew" class="mappings-card">
          <div v-if="!isEditing(row)" class="list-row">
            <div class="list-row__main list-row__main--inline">
              <span v-if="showHebrew(row)" class="mappings-row-hebrew" dir="rtl">{{ row.Hebrew }}</span>
              <span class="list-row__label">{{ primaryLabel(row) }}</span>
              <span v-if="row.Category" class="mappings-category-tag">{{ row.Category }}</span>
            </div>
            <button
              v-if="!auth.isDemo"
              type="button"
              class="btn btn-edit"
              :disabled="!!savingHebrew"
              @click="startEdit(row.Hebrew)"
            >
              Edit
            </button>
          </div>

          <EditPanel
            v-else
            title="Edit mapping"
            :done-label="savingHebrew === row.Hebrew ? '…' : 'Save'"
            :disabled="savingHebrew === row.Hebrew"
            @done="doneEdit(row)"
            @cancel="cancelEdit(row.Hebrew)"
          >
            <input v-model="row.English" class="input" placeholder="English name" />
            <CategorySelect
              v-model="row.Category"
              :options="categories"
              allow-empty
              empty-label="Uncategorized"
            />
          </EditPanel>
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
import EditPanel from "../components/EditPanel.vue";
import { useAuthStore } from "../stores/auth";
import { CATEGORY_PICKLIST } from "../categories";
import type { MerchantRow } from "../types";

withDefaults(
  defineProps<{
    embedded?: boolean;
  }>(),
  { embedded: false },
);

const categories = CATEGORY_PICKLIST;

const auth = useAuthStore();
const rows = ref<MerchantRow[]>([]);
const loading = ref(true);
const savedSnapshot = ref("{}");
const savingHebrew = ref<string | null>(null);
const importing = ref(false);
const importInput = ref<HTMLInputElement | null>(null);
const statusMessage = ref("");
const statusIsError = ref(false);
const searchQuery = ref("");
const editingHebrew = ref<string | null>(null);
const matchedHebrewKeys = ref<string[] | null>(null);

let statusTimer: ReturnType<typeof setTimeout> | null = null;

function labelsMatch(hebrew: string, english: string): boolean {
  const h = hebrew.trim().toLowerCase();
  const e = english.trim().toLowerCase();
  return h.length > 0 && e.length > 0 && h === e;
}

function showHebrew(row: MerchantRow): boolean {
  const h = row.Hebrew.trim();
  if (!h) return false;
  if (!row.English.trim()) return true;
  return !labelsMatch(row.Hebrew, row.English);
}

function primaryLabel(row: MerchantRow): string {
  return row.English.trim() || row.Hebrew.trim() || "—";
}

function rowMatchesQuery(row: MerchantRow, q: string): boolean {
  return (
    row.Hebrew.toLowerCase().includes(q) ||
    (row.English || "").toLowerCase().includes(q) ||
    (row.Category || "").toLowerCase().includes(q)
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

function isEditing(row: MerchantRow): boolean {
  return !auth.isDemo && editingHebrew.value === row.Hebrew;
}

const filteredRows = computed(() => {
  let list: MerchantRow[];
  if (!matchedHebrewKeys.value) {
    list = rows.value;
  } else {
    const keys = new Set(matchedHebrewKeys.value);
    list = rows.value.filter((row) => keys.has(row.Hebrew));
  }
  const editing = editingHebrew.value;
  if (editing && !list.some((row) => row.Hebrew === editing)) {
    const pinned = rows.value.find((row) => row.Hebrew === editing);
    if (pinned) list = [pinned, ...list];
  }
  return list;
});

type RuleEntry = { english: string; category?: string };

function rulesFromRows() {
  const rules: Record<string, RuleEntry> = {};
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

function syncSnapshot() {
  const rules = rulesFromRows();
  const sorted: Record<string, RuleEntry> = {};
  for (const key of Object.keys(rules).sort()) {
    sorted[key] = rules[key]!;
  }
  savedSnapshot.value = JSON.stringify(sorted);
}

function savedEntry(hebrew: string): RuleEntry | undefined {
  const saved = JSON.parse(savedSnapshot.value || "{}") as Record<string, RuleEntry>;
  return saved[hebrew];
}

function rowEntry(row: MerchantRow): RuleEntry {
  return { english: row.English.trim(), category: row.Category || undefined };
}

function rowIsDirty(hebrew: string): boolean {
  const row = rows.value.find((r) => r.Hebrew === hebrew);
  if (!row) return false;
  const prev = savedEntry(hebrew);
  const next = rowEntry(row);
  if (!prev) return true;
  return prev.english !== next.english || (prev.category || undefined) !== next.category;
}

function restoreRow(hebrew: string) {
  const row = rows.value.find((r) => r.Hebrew === hebrew);
  const prev = savedEntry(hebrew);
  if (!row || !prev) return;
  row.English = prev.english;
  row.Category = prev.category || "";
}

function setStatus(message: string, isError = false) {
  statusMessage.value = message;
  statusIsError.value = isError;
  if (statusTimer) clearTimeout(statusTimer);
  if (!isError && message) {
    statusTimer = setTimeout(() => {
      statusMessage.value = "";
    }, 2500);
  }
}

async function persistRow(hebrew: string): Promise<boolean> {
  const row = rows.value.find((r) => r.Hebrew === hebrew);
  if (!row || auth.isDemo) return true;
  if (!rowIsDirty(hebrew)) return true;

  const token = auth.token || undefined;
  const entry = { hebrew, english: row.English.trim(), category: row.Category || undefined };
  savingHebrew.value = hebrew;
  try {
    const result = await saveRuleEntry(entry, token);
    if (!result.ok) throw new Error("Server did not confirm save.");
    const snap = JSON.parse(savedSnapshot.value || "{}") as Record<string, RuleEntry>;
    snap[hebrew] = { english: entry.english, category: entry.category };
    savedSnapshot.value = JSON.stringify(snap, Object.keys(snap).sort());
    return true;
  } catch (e) {
    setStatus(e instanceof Error ? e.message : "Save failed", true);
    return false;
  } finally {
    if (savingHebrew.value === hebrew) savingHebrew.value = null;
  }
}

async function load() {
  loading.value = true;
  editingHebrew.value = null;
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
    loading.value = false;
  }
}

async function startEdit(hebrew: string) {
  if (editingHebrew.value && editingHebrew.value !== hebrew) {
    const ok = await persistRow(editingHebrew.value);
    if (!ok) return;
  }
  editingHebrew.value = hebrew;
  const row = rows.value.find((r) => r.Hebrew === hebrew);
  if (row) row.Category = row.Category || "";
}

function cancelEdit(hebrew: string) {
  restoreRow(hebrew);
  editingHebrew.value = null;
  refreshSearchMatches();
}

async function doneEdit(row: MerchantRow) {
  const ok = await persistRow(row.Hebrew);
  if (!ok) return;
  editingHebrew.value = null;
  refreshSearchMatches();
  setStatus("Saved.");
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
  editingHebrew.value = null;
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
    setStatus(`Imported ${added + updated} mapping${added + updated === 1 ? "" : "s"}.`);
  } catch (e) {
    setStatus(e instanceof Error ? e.message : "Import failed", true);
  } finally {
    importing.value = false;
  }
}

onMounted(load);
</script>
