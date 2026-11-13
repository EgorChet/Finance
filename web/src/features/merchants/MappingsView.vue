<template>
  <div class="md">
    <div v-if="auth.isDemo" class="demo-banner">{{ t("Demo mode — names are read-only.") }}</div>
    <AppLoader v-if="loading" :title="t('Loading merchants')" />
    <template v-else>
      <p v-if="statusMessage" class="md-status" :class="{ 'md-status--error': statusIsError }">{{ statusMessage }}</p>

      <input v-model="searchQuery" class="input md-search" type="search" :placeholder="t('Search merchants')" autocomplete="off" />

      <div class="md-controls">
        <div class="seg md-period" role="tablist" :aria-label="t('Period')">
          <button
            v-for="p in PERIODS"
            :key="p.id"
            type="button"
            class="seg-btn"
            :class="{ 'seg-btn--on': period === p.id }"
            @click="period = p.id"
          >
            {{ t(p.label) }}
          </button>
        </div>
        <div class="md-sorts" role="tablist" :aria-label="t('Sort')">
          <button
            v-for="s in SORTS"
            :key="s.id"
            type="button"
            class="find-chip"
            :class="{ 'find-chip--on': sort === s.id }"
            @click="sort = s.id"
          >
            {{ t(s.label) }}
          </button>
        </div>
      </div>

      <p class="md-summary">
        {{ t("{n} {n|merchant|merchants}", { n: shown.length }) }} · {{ formatIlsWhole(shownTotal) }}
      </p>

      <ul v-if="shown.length" class="bx-list md-list">
        <li v-for="(m, i) in shown" :key="m.hebrew">
          <button type="button" class="bx-row md-row" @click="open(m)">
            <span v-if="sort === 'spent' || sort === 'visits'" class="md-rank">{{ i + 1 }}</span>
            <MerchantIcon :merchant-he="m.hebrew" :merchant-en="m.english" :category="m.category" />
            <span class="bx-row-body">
              <span class="bx-row-top">
                <span class="bx-row-name">{{ m.name }}</span>
                <span class="bx-row-amount">{{ formatIlsWhole(m.total) }}</span>
              </span>
              <span class="bx-row-meta">
                <span>{{ t("{n} {n|visit|visits}", { n: m.count }) }} · {{ shortDate(m.last) }} · {{ catName(m.category) }}</span>
                <span v-if="m.count > 1">{{ t("avg {amount}", { amount: formatIlsWhole(m.total / m.count) }) }}</span>
              </span>
            </span>
          </button>
        </li>
      </ul>
      <p v-else class="bx-empty-line">{{ t("No merchants match.") }}</p>

      <div v-if="!auth.readOnly" class="md-tools">
        <button type="button" class="bh-link" @click="exportJson">{{ t("Export names") }}</button>
        <span aria-hidden="true">·</span>
        <button type="button" class="bh-link" :disabled="importing" @click="importInput?.click()">
          {{ importing ? t("Importing…") : t("Import names") }}
        </button>
        <input ref="importInput" type="file" accept=".json,application/json" hidden @change="importJson" />
      </div>
    </template>

    <BottomSheet :open="!!selected" @close="selected = null">
      <template v-if="selected">
        <div class="md-sheet-head">
          <MerchantIcon :merchant-he="selected.hebrew" :merchant-en="selected.english" :category="selected.category" />
          <div>
            <p class="md-sheet-name">{{ selected.name }}</p>
            <p v-if="selected.hebrew !== selected.name" class="md-sheet-he" dir="rtl" lang="he">{{ selected.hebrew }}</p>
          </div>
        </div>
        <div class="bh-stats md-sheet-stats">
          <div><span>{{ t("Spent") }}</span><strong>{{ formatIlsWhole(selected.total) }}</strong></div>
          <div><span>{{ t("Visits") }}</span><strong>{{ selected.count }}</strong></div>
          <div><span>{{ t("Average") }}</span><strong>{{ formatIlsWhole(selected.total / Math.max(1, selected.count)) }}</strong></div>
        </div>
        <p class="md-sheet-meta">
          {{ t("First {first} · last {last}", { first: shortDate(selected.first), last: shortDate(selected.last) }) }}<template v-if="periodLabel"> · {{ t(periodLabel) }}</template>
        </p>

        <template v-if="!auth.readOnly">
          <label class="sheet-field">
            <span class="sheet-field__label">{{ t("English name") }}</span>
            <input v-model="draftEnglish" class="input" :placeholder="selected.name" enterkeyhint="done" />
          </label>
          <label class="sheet-field">
            <span class="sheet-field__label">{{ t("Category") }}</span>
            <CategorySelect v-model="draftCategory" :options="CATEGORY_PICKLIST" allow-empty empty-label="Uncategorized" />
          </label>
          <button type="button" class="btn btn-primary md-sheet-save" :disabled="saving || !dirty" @click="save">
            {{ saving ? t("Saving…") : t("Save") }}
          </button>
        </template>
        <button type="button" class="btn md-sheet-charges" @click="seeCharges(selected)">{{ t("See all charges ›") }}</button>
      </template>
    </BottomSheet>
  </div>
</template>

<script setup lang="ts">
import { catName, dateTag, t } from "@/shared/i18n";
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { saveRuleEntry, saveRules } from "@/shared/api/client";
import { useAllReportStore } from "@/shared/stores/allReport";
import AppLoader from "@/shared/components/AppLoader.vue";
import BottomSheet from "@/shared/components/BottomSheet.vue";
import CategorySelect from "@/shared/components/CategorySelect.vue";
import MerchantIcon from "@/shared/components/MerchantIcon.vue";
import { useAuthStore } from "@/shared/stores/auth";
import { invalidateRulesDataCaches } from "@/shared/stores/invalidateCaches";
import { useRulesDataStore } from "@/shared/stores/viewData";
import { CATEGORY_PICKLIST } from "@/shared/categories";
import type { Transaction } from "@/shared/types";
import { formatIlsWhole } from "@/shared/utils/format";
import { effectiveSpend } from "@/shared/utils/transaction";
import { knownMerchantName, merchantDisplayName } from "@/shared/utils/merchantNames";

withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false });

type Rule = { english: string; category?: string | null };
type Merchant = {
  hebrew: string;
  english: string;
  name: string;
  category: string;
  total: number;
  count: number;
  first: string;
  last: string;
};

const PERIODS = [
  { id: "3m", label: "3 months", months: 3 },
  { id: "12m", label: "12 months", months: 12 },
  { id: "all", label: "All", months: 0 },
] as const;
const SORTS = [
  { id: "spent", label: "Most spent" },
  { id: "visits", label: "Most visits" },
  { id: "recent", label: "Recent" },
  { id: "az", label: "A–Z" },
] as const;

const auth = useAuthStore();
const router = useRouter();
const rulesData = useRulesDataStore();

const loading = ref(true);
const transactions = ref<Transaction[]>([]);
const rules = ref<Record<string, Rule>>({});
const searchQuery = ref("");
const period = ref<(typeof PERIODS)[number]["id"]>("12m");
const sort = ref<(typeof SORTS)[number]["id"]>("spent");
const statusMessage = ref("");
const statusIsError = ref(false);
const importing = ref(false);
const importInput = ref<HTMLInputElement | null>(null);
const selected = ref<Merchant | null>(null);
const draftEnglish = ref("");
const draftCategory = ref("");
const saving = ref(false);

function setStatus(message: string, isError = false) {
  statusMessage.value = message;
  statusIsError.value = isError;
  if (!isError && message) setTimeout(() => (statusMessage.value = ""), 2500);
}

function shortDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(dateTag(), { day: "numeric", month: "short", year: "2-digit" });
}

const periodLabel = computed(() => PERIODS.find((p) => p.id === period.value)?.label ?? "");

const fromDate = computed(() => {
  const months = PERIODS.find((p) => p.id === period.value)?.months ?? 0;
  if (!months) return "";
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
});

/** One row per merchant (by the name on the statement), from the charges in the period. */
const merchants = computed((): Merchant[] => {
  const by = new Map<string, Merchant & { cats: Map<string, number> }>();
  for (const tx of transactions.value) {
    // Charges added under Budget (car loan, rent…) aren't shops.
    if (tx.notes?.startsWith("fixed_charge:")) continue;
    const amount = effectiveSpend(tx);
    if (!(amount > 0)) continue;
    const date = tx.date.slice(0, 10);
    if (fromDate.value && date < fromDate.value) continue;
    const hebrew = tx.merchant_he.trim();
    if (!hebrew) continue;
    let m = by.get(hebrew);
    if (!m) {
      m = { hebrew, english: "", name: "", category: "", total: 0, count: 0, first: date, last: date, cats: new Map() };
      by.set(hebrew, m);
    }
    m.total += amount;
    m.count += 1;
    if (date < m.first) m.first = date;
    if (date >= m.last) {
      m.last = date;
      if (tx.merchant_en) m.english = tx.merchant_en;
    }
    const cat = tx.category_en || "Uncategorized";
    m.cats.set(cat, (m.cats.get(cat) ?? 0) + 1);
  }
  return [...by.values()].map(({ cats, ...m }) => {
    const rule = rules.value[m.hebrew];
    const english = rule?.english?.trim() || m.english;
    return {
      ...m,
      english,
      name: merchantDisplayName({ merchant_he: m.hebrew, merchant_en: english }),
      category: rule?.category || [...cats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "Uncategorized",
    };
  });
});

const shown = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  const list = q
    ? merchants.value.filter((m) =>
        `${m.name} ${m.hebrew} ${m.english} ${m.category} ${knownMerchantName(m.hebrew) ?? ""}`.toLowerCase().includes(q),
      )
    : merchants.value;
  const sorted = [...list];
  if (sort.value === "spent") sorted.sort((a, b) => b.total - a.total);
  else if (sort.value === "visits") sorted.sort((a, b) => b.count - a.count || b.total - a.total);
  else if (sort.value === "recent") sorted.sort((a, b) => b.last.localeCompare(a.last));
  else sorted.sort((a, b) => a.name.localeCompare(b.name));
  return sorted;
});

const shownTotal = computed(() => shown.value.reduce((s, m) => s + m.total, 0));

function open(m: Merchant) {
  selected.value = m;
  const rule = rules.value[m.hebrew];
  draftEnglish.value = rule?.english?.trim() || (m.name !== m.hebrew ? m.name : "");
  draftCategory.value = rule?.category || (m.category === "Uncategorized" ? "" : m.category);
}

const dirty = computed(() => {
  const m = selected.value;
  if (!m) return false;
  const rule = rules.value[m.hebrew];
  return (
    draftEnglish.value.trim() !== (rule?.english?.trim() ?? "") ||
    (draftCategory.value || "") !== (rule?.category || "")
  );
});

async function save() {
  const m = selected.value;
  if (!m || auth.readOnly) return;
  saving.value = true;
  try {
    const entry = { hebrew: m.hebrew, english: draftEnglish.value.trim(), category: draftCategory.value || undefined };
    const res = await saveRuleEntry(entry, auth.token || undefined);
    if (!res.ok) throw new Error("Server did not confirm save.");
    rules.value = { ...rules.value, [m.hebrew]: { english: entry.english, category: entry.category } };
    invalidateRulesDataCaches();
    selected.value = null;
    setStatus(t("Saved {name}.", { name: entry.english || m.name }));
  } catch (e) {
    setStatus(e instanceof Error ? e.message : t("Could not save"), true);
  } finally {
    saving.value = false;
  }
}

function seeCharges(m: Merchant) {
  selected.value = null;
  void router.push({ name: "browse", query: { q: m.hebrew } });
}

function exportJson() {
  const blob = new Blob([JSON.stringify(rules.value, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "merchant_rules.json";
  a.click();
}

async function importJson(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || auth.readOnly) return;
  importing.value = true;
  try {
    const imported = JSON.parse(await file.text()) as Record<string, Rule>;
    if (!imported || typeof imported !== "object" || Array.isArray(imported)) {
      throw new Error("JSON must be an object keyed by Hebrew merchant name.");
    }
    const next: Record<string, Rule> = { ...rules.value };
    for (const [he, rule] of Object.entries(imported)) {
      if (!he.trim() || !rule || typeof rule !== "object") continue;
      next[he.trim()] = {
        english: typeof rule.english === "string" ? rule.english.trim() : "",
        category: typeof rule.category === "string" ? rule.category : undefined,
      };
    }
    const result = await saveRules(next as never, auth.token || undefined);
    if (!result.saved) throw new Error("Server did not confirm save.");
    invalidateRulesDataCaches();
    rules.value = next;
    setStatus(t("Imported {n} names.", { n: Object.keys(imported).length }));
  } catch (err) {
    setStatus(err instanceof Error ? err.message : t("Import failed"), true);
  } finally {
    importing.value = false;
  }
}

onMounted(async () => {
  const demo = auth.isDemo;
  const token = auth.token || undefined;
  try {
    const [report, saved] = await Promise.all([useAllReportStore().load(demo, token), rulesData.load(demo, token)]);
    transactions.value = report.transactions;
    rules.value = saved as Record<string, Rule>;
  } catch (e) {
    setStatus(e instanceof Error ? e.message : t("Could not load merchants"), true);
  } finally {
    loading.value = false;
  }
});
</script>
