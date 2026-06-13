<template>
  <div>
    <div v-if="auth.isDemo" class="demo-banner">Demo mode — rules are read-only.</div>
    <h2 style="margin: 0 0 1rem">Merchant mappings</h2>
    <AppLoader
      v-if="loading"
      title="Loading merchant mappings"
      subtitle="Fetching your saved labels and categories"
    />
    <template v-else>
    <div v-if="statusMessage" class="demo-banner" :class="{ 'import-error': statusIsError }">
      {{ statusMessage }}
    </div>
    <div v-if="!auth.isDemo" style="display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap">
      <input v-model="newHebrew" class="input" placeholder="Hebrew" style="max-width: 180px" />
      <input v-model="newEnglish" class="input" placeholder="English" style="max-width: 180px" />
      <input v-model="newCategory" class="input" placeholder="Category" list="spending-cats" style="max-width: 160px" />
      <button class="btn btn-primary" @click="addRule">Add</button>
      <button class="btn" :disabled="saving" @click="save">{{ saving ? "Saving…" : "Save all" }}</button>
      <button class="btn" @click="exportJson">Export JSON</button>
      <input ref="importInput" type="file" accept=".json,application/json" hidden @change="importJson" />
      <button class="btn" type="button" :disabled="importing" @click="importInput?.click()">
        {{ importing ? "Importing…" : "Import JSON" }}
      </button>
    </div>
    <div class="table-scroll">
      <table class="rules">
      <thead>
        <tr>
          <th>Hebrew</th>
          <th>English</th>
          <th>Category</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.Hebrew">
          <td>{{ row.Hebrew }}</td>
          <td>
            <input v-model="row.English" :readonly="auth.isDemo" />
          </td>
          <td>
            <input v-model="row.Category" list="spending-cats" :readonly="auth.isDemo" />
          </td>
        </tr>
      </tbody>
    </table>
    </div>
    <datalist id="spending-cats">
      <option v-for="c in categories" :key="c" :value="c" />
    </datalist>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { fetchRules, saveRules } from "../api/client";
import AppLoader from "../components/AppLoader.vue";
import { useAuthStore } from "../stores/auth";
import { SPENDING_CATEGORIES } from "../categories";
import { canonicalMerchantEnglish } from "../utils/merchantVendor";
import type { MerchantRow } from "../types";

const categories = SPENDING_CATEGORIES;

const auth = useAuthStore();
const rows = ref<MerchantRow[]>([]);
const loading = ref(true);
const saving = ref(false);
const importing = ref(false);
const importInput = ref<HTMLInputElement | null>(null);
const statusMessage = ref("");
const statusIsError = ref(false);
const newHebrew = ref("");
const newEnglish = ref("");
const newCategory = ref("");

function rulesFromRows() {
  const rules: Record<string, { english: string; category?: string }> = {};
  for (const row of rows.value) {
    rules[row.Hebrew] = {
      english: canonicalMerchantEnglish(row.English, row.Hebrew),
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
  setStatus("");
  try {
    const rules = await fetchRules(auth.isDemo, auth.token || undefined);
    rows.value = rowsFromRules(rules);
  } catch (e) {
    setStatus(e instanceof Error ? e.message : "Could not load merchant rules", true);
  } finally {
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
  newHebrew.value = "";
  newEnglish.value = "";
  newCategory.value = "";
}

async function save() {
  if (auth.isDemo) return;
  saving.value = true;
  setStatus("");
  try {
    await saveRules(rulesFromRows(), auth.token || undefined);
    setStatus(`Saved ${rows.value.length} merchant rules to the server.`);
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
      const english = canonicalMerchantEnglish(
        typeof rule.english === "string" ? rule.english : "",
        hebrew,
      );
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
    setStatus(`Imported ${Object.keys(imported).length} rules (${added} new, ${updated} updated). Saving…`);

    const result = await saveRules(rulesFromRows(), auth.token || undefined);
    if (!result.saved) throw new Error("Server did not confirm save.");
    setStatus(`Imported and saved ${rows.value.length} merchant rules.`);
  } catch (e) {
    setStatus(e instanceof Error ? e.message : "Import failed", true);
  } finally {
    importing.value = false;
  }
}

onMounted(load);
</script>
