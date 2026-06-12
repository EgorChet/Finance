<template>
  <div>
    <div v-if="auth.isDemo" class="demo-banner">Demo mode — rules are read-only.</div>
    <h2 style="margin: 0 0 1rem">Merchant mappings</h2>
    <div v-if="!auth.isDemo" style="display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap">
      <input v-model="newHebrew" class="input" placeholder="Hebrew" style="max-width: 180px" />
      <input v-model="newEnglish" class="input" placeholder="English" style="max-width: 180px" />
      <input v-model="newCategory" class="input" placeholder="Category" list="spending-cats" style="max-width: 160px" />
      <button class="btn btn-primary" @click="addRule">Add</button>
      <button class="btn" :disabled="saving" @click="save">{{ saving ? "Saving…" : "Save all" }}</button>
      <button class="btn" @click="exportJson">Export JSON</button>
      <label class="btn">
        Import
        <input type="file" accept=".json" hidden @change="importJson" />
      </label>
    </div>
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
    <datalist id="spending-cats">
      <option v-for="c in categories" :key="c" :value="c" />
    </datalist>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { fetchMerchants, fetchRules, saveRules } from "../api/client";
import { useAuthStore } from "../stores/auth";
import { SPENDING_CATEGORIES } from "../categories";
import type { MerchantRow } from "../types";

const categories = SPENDING_CATEGORIES;

const auth = useAuthStore();
const rows = ref<MerchantRow[]>([]);
const saving = ref(false);
const newHebrew = ref("");
const newEnglish = ref("");
const newCategory = ref("");

async function load() {
  rows.value = await fetchMerchants(auth.isDemo, null, auth.token || undefined);
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
  try {
    const rules: Record<string, { english: string; category?: string }> = {};
    for (const row of rows.value) {
      rules[row.Hebrew] = { english: row.English, category: row.Category || undefined };
    }
    await saveRules(rules, auth.token || undefined);
  } finally {
    saving.value = false;
  }
}

function exportJson() {
  const rules: Record<string, { english: string; category?: string }> = {};
  for (const row of rows.value) {
    rules[row.Hebrew] = { english: row.English, category: row.Category || undefined };
  }
  const blob = new Blob([JSON.stringify(rules, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "merchant_rules.json";
  a.click();
}

async function importJson(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file || auth.isDemo) return;
  const text = await file.text();
  const imported = JSON.parse(text) as Record<string, { english: string; category?: string }>;
  for (const [he, rule] of Object.entries(imported)) {
    const existing = rows.value.find((r) => r.Hebrew === he);
    if (existing) {
      existing.English = rule.english;
      existing.Category = rule.category || "";
    } else {
      rows.value.push({ Hebrew: he, English: rule.english, Category: rule.category || "" });
    }
  }
}

onMounted(load);
</script>
