<template>
  <div>
    <div v-if="auth.isDemo" class="demo-banner">
      Demo mode — recurring bills are read-only. Sign in to manage rent, loans, and other fixed charges.
    </div>
    <div class="recurring-header">
      <div>
        <h2 class="page-title">Recurring bills</h2>
        <p class="page-lead" style="margin-bottom: 0">
          Rent, loans, and other monthly charges added to statement totals and pace. Changes save automatically.
        </p>
      </div>
      <p v-if="saveStatus" class="recurring-save-status" :class="{ 'recurring-save-status--error': saveError }">
        {{ saveStatus }}
      </p>
    </div>

    <AppLoader
      v-if="loading"
      title="Loading recurring bills"
      subtitle="Fetching rent, loans, and other fixed charges"
    />
    <template v-else>
      <p v-if="error" style="color: var(--danger)">{{ error }}</p>

      <div v-if="groups.length" class="recurring-groups">
        <section v-for="group in groups" :key="group.id" class="recurring-card">
          <header class="recurring-card-header">
            <div>
              <h3 class="recurring-card-title">{{ group.name_en }}</h3>
              <p v-if="group.name_he" class="recurring-card-sub">{{ group.name_he }} · {{ group.category_en }}</p>
              <p v-else class="recurring-card-sub">{{ group.category_en }}</p>
            </div>
            <div v-if="!auth.isDemo" class="recurring-card-actions">
              <button type="button" class="btn" :disabled="saving" @click="addSegment(group)">Add period</button>
              <button type="button" class="btn btn-ghost" :disabled="saving" @click="removeCharge(group.id)">
                Remove bill
              </button>
            </div>
          </header>

          <div class="recurring-segments">
            <article v-for="seg in group.segments" :key="segmentKey(seg)" class="recurring-segment-card">
              <div class="recurring-segment-head">
                <span v-if="auth.isDemo" class="recurring-segment-amount-display">{{ formatIls(seg.amount) }}</span>
                <span class="recurring-status" :class="'recurring-status-' + segmentStatus(seg.from_month, seg.through_month)">
                  {{ statusLabel(seg) }}
                </span>
              </div>

              <div class="recurring-segment-fields">
                <div class="field-group">
                  <label class="field-label">Amount (₪)</label>
                  <input
                    v-if="!auth.isDemo"
                    v-model.number="seg.amount"
                    class="input"
                    type="number"
                    min="0"
                    step="0.01"
                    inputmode="decimal"
                    @input="queueSave()"
                  />
                  <p v-else class="recurring-segment-amount-display">{{ formatIls(seg.amount) }}</p>
                </div>

                <div class="field-group">
                  <label class="field-label">From</label>
                  <MonthSelect v-if="!auth.isDemo" v-model="seg.from_month" @update:model-value="queueSave()" />
                  <p v-else style="margin: 0">{{ ymToLabel(seg.from_month) }}</p>
                </div>

                <div class="field-group">
                  <label class="field-label">Through</label>
                  <p v-if="!auth.isDemo && isOngoingThrough(seg.through_month)" class="recurring-ongoing-readonly">No end date</p>
                  <MonthSelect
                    v-else-if="!auth.isDemo"
                    v-model="seg.through_month"
                    @update:model-value="queueSave()"
                  />
                  <p v-else style="margin: 0">{{ throughLabel(seg.through_month) }}</p>
                </div>

                <div v-if="!auth.isDemo" class="field-group">
                  <label class="recurring-ongoing">
                    <input
                      type="checkbox"
                      :checked="isOngoingThrough(seg.through_month)"
                      @change="toggleOngoing(seg, ($event.target as HTMLInputElement).checked)"
                    />
                    <span class="recurring-ongoing-text">No end date — runs every month</span>
                  </label>
                </div>
                <p v-else-if="isOngoingThrough(seg.through_month)" class="recurring-ongoing-readonly">Ongoing — no end date</p>
              </div>

              <div v-if="!auth.isDemo" class="recurring-segment-actions">
                <button type="button" class="btn btn-ghost" :disabled="saving" @click="removeSegment(seg)">
                  {{ saving ? "…" : "Delete period" }}
                </button>
              </div>
            </article>
          </div>

          <p class="recurring-timeline">{{ timelineSummary(group) }}</p>
        </section>
      </div>

      <p v-else style="color: var(--text-muted); margin: 1rem 0">
        No recurring bills configured yet.
      </p>

      <section v-if="!auth.isDemo" class="recurring-add">
        <h3 class="recurring-add-title">Add recurring bill</h3>
        <div class="recurring-add-fields">
          <div class="field-group">
            <label class="field-label">Name (English)</label>
            <input v-model="newCharge.name_en" class="input" placeholder="e.g. Rent" />
          </div>
          <div class="field-group">
            <label class="field-label">Name (Hebrew, optional)</label>
            <input v-model="newCharge.name_he" class="input" placeholder="שם בעברית" dir="rtl" />
          </div>
          <div class="field-group">
            <label class="field-label">Category</label>
            <CategorySelect v-model="newCharge.category_en" :options="categories" />
          </div>
          <div class="field-group">
            <label class="field-label">Amount (₪)</label>
            <input
              v-model.number="newCharge.amount"
              class="input"
              type="number"
              min="0"
              step="0.01"
              inputmode="decimal"
              placeholder="0"
            />
          </div>
          <div class="field-group">
            <label class="field-label">From</label>
            <MonthSelect v-model="newCharge.from_month" />
          </div>
          <div class="field-group">
            <label class="field-label">Through</label>
            <p v-if="newOngoing" class="recurring-ongoing-readonly">No end date</p>
            <MonthSelect v-else v-model="newCharge.through_month" />
          </div>
          <div class="field-group">
            <label class="recurring-ongoing">
              <input v-model="newOngoing" type="checkbox" />
              <span class="recurring-ongoing-text">No end date — runs every month</span>
            </label>
          </div>
          <button type="button" class="btn btn-primary recurring-add-btn" :disabled="saving" @click="addCharge">
            {{ saving ? "Saving…" : "Add bill" }}
          </button>
        </div>
      </section>

      <p v-if="status" class="recurring-form-error">{{ status }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { fetchFixedCharges, saveFixedCharges } from "../api/client";
import AppLoader from "../components/AppLoader.vue";
import CategorySelect from "../components/CategorySelect.vue";
import MonthSelect from "../components/MonthSelect.vue";
import { SPENDING_CATEGORIES } from "../categories";
import { useAuthStore } from "../stores/auth";
import { formatIls } from "../utils/format";
import {
  type ChargeGroup,
  type ConfiguredCharge,
  ONGOING_THROUGH_MONTH,
  currentYearMonth,
  groupCharges,
  isOngoingThrough,
  monthRangeLabel,
  segmentKey,
  segmentStatus,
  slugifyId,
  ymToLabel,
} from "../utils/fixedCharges";

const categories = SPENDING_CATEGORIES;
const auth = useAuthStore();
const loading = ref(true);
const saving = ref(false);
const error = ref("");
const status = ref("");
const saveStatus = ref("");
const saveError = ref(false);
const charges = ref<ConfiguredCharge[]>([]);
const savedSnapshot = ref("");

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveStatusTimer: ReturnType<typeof setTimeout> | null = null;

const newCharge = ref({
  name_en: "",
  name_he: "",
  category_en: "Housing",
  amount: 0,
  from_month: currentYearMonth(),
  through_month: ONGOING_THROUGH_MONTH,
});
const newOngoing = ref(true);

const groups = computed(() => groupCharges(charges.value));

watch(newOngoing, (on) => {
  if (on) newCharge.value.through_month = ONGOING_THROUGH_MONTH;
  else if (isOngoingThrough(newCharge.value.through_month)) {
    newCharge.value.through_month = currentYearMonth();
  }
});

function snapshot(data: ConfiguredCharge[]): string {
  return JSON.stringify(data);
}

function isDirty(): boolean {
  return snapshot(charges.value) !== savedSnapshot.value;
}

function showSaveStatus(message: string, isError = false) {
  saveStatus.value = message;
  saveError.value = isError;
  if (saveStatusTimer) clearTimeout(saveStatusTimer);
  if (!isError) {
    saveStatusTimer = setTimeout(() => {
      saveStatus.value = "";
    }, 2500);
  }
}

function queueSave(immediate = false) {
  if (auth.isDemo) return;
  if (saveTimer) clearTimeout(saveTimer);
  if (immediate) {
    void persistCharges();
    return;
  }
  saveTimer = setTimeout(() => void persistCharges(), 700);
}

async function persistCharges(): Promise<boolean> {
  if (auth.isDemo) return true;
  if (!isDirty()) return true;

  saveChain = saveChain.then(() => runPersist());
  return saveChain;
}

let saveChain: Promise<boolean> = Promise.resolve(true);

async function runPersist(): Promise<boolean> {
  if (!isDirty()) return true;

  saving.value = true;
  showSaveStatus("Saving…");
  status.value = "";
  try {
    const payload = charges.value.map((c) => ({
      ...c,
      amount: Math.round(c.amount * 100) / 100,
    }));
    const data = await saveFixedCharges(payload, auth.token || undefined);
    charges.value = data.charges.map((c) => ({ ...c }));
    savedSnapshot.value = snapshot(charges.value);
    showSaveStatus("Saved");
    return true;
  } catch (e) {
    showSaveStatus(String(e), true);
    return false;
  } finally {
    saving.value = false;
  }
}

function throughLabel(throughMonth: string): string {
  return isOngoingThrough(throughMonth) ? "Ongoing" : ymToLabel(throughMonth);
}

function statusLabel(seg: ConfiguredCharge): string {
  const s = segmentStatus(seg.from_month, seg.through_month);
  if (s === "ended") return "Ended";
  if (s === "upcoming") return "Starts " + ymToLabel(seg.from_month);
  if (isOngoingThrough(seg.through_month)) return "Active · ongoing";
  return "Active · ends " + ymToLabel(seg.through_month);
}

function timelineSummary(group: ChargeGroup): string {
  return group.segments.map((s) => `${formatIls(s.amount)} (${monthRangeLabel(s.from_month, s.through_month)})`).join(" → ");
}

function toggleOngoing(seg: ConfiguredCharge, ongoing: boolean) {
  if (ongoing) {
    seg.through_month = ONGOING_THROUGH_MONTH;
  } else if (isOngoingThrough(seg.through_month)) {
    seg.through_month = currentYearMonth();
  }
  queueSave();
}

function nextMonthAfter(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function prevMonthBefore(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addSegment(group: ChargeGroup) {
  const last = group.segments[group.segments.length - 1];
  let fromMonth = currentYearMonth();
  if (last) {
    if (isOngoingThrough(last.through_month)) {
      const prevYm = prevMonthBefore(fromMonth);
      if (last.from_month <= prevYm) {
        last.through_month = prevYm;
      } else {
        fromMonth = nextMonthAfter(last.from_month);
        last.through_month = prevMonthBefore(fromMonth);
      }
    } else {
      fromMonth = nextMonthAfter(last.through_month);
    }
  }
  charges.value.push({
    id: group.id,
    name_en: group.name_en,
    name_he: group.name_he,
    category_en: group.category_en,
    amount: last?.amount ?? 0,
    from_month: fromMonth,
    through_month: ONGOING_THROUGH_MONTH,
  });
  queueSave(true);
}

async function removeSegment(seg: ConfiguredCharge) {
  const key = segmentKey(seg);
  charges.value = charges.value.filter((c) => segmentKey(c) !== key);
  await persistCharges();
}

async function removeCharge(id: string) {
  const group = groups.value.find((g) => g.id === id);
  const label = group?.name_en ?? "this bill";
  if (!window.confirm(`Remove ${label} from recurring bills?`)) return;
  charges.value = charges.value.filter((c) => c.id !== id);
  await persistCharges();
}

function uniqueId(base: string): string {
  let id = slugifyId(base);
  if (!charges.value.some((c) => c.id === id)) return id;
  let n = 2;
  while (charges.value.some((c) => c.id === `${id}-${n}`)) n += 1;
  return `${id}-${n}`;
}

async function addCharge() {
  status.value = "";
  const name = newCharge.value.name_en.trim();
  if (!name) {
    status.value = "Enter a name for the bill.";
    return;
  }
  if (!newCharge.value.amount || newCharge.value.amount <= 0) {
    status.value = "Enter a positive amount.";
    return;
  }
  if (newCharge.value.from_month > newCharge.value.through_month) {
    status.value = "Start month must be on or before end month.";
    return;
  }
  const throughMonth = newOngoing.value ? ONGOING_THROUGH_MONTH : newCharge.value.through_month;
  charges.value.push({
    id: uniqueId(name),
    name_en: name,
    name_he: newCharge.value.name_he.trim() || undefined,
    category_en: newCharge.value.category_en.trim() || "Uncategorized",
    amount: newCharge.value.amount,
    from_month: newCharge.value.from_month,
    through_month: throughMonth,
  });
  newCharge.value = {
    name_en: "",
    name_he: "",
    category_en: "Housing",
    amount: 0,
    from_month: currentYearMonth(),
    through_month: ONGOING_THROUGH_MONTH,
  };
  newOngoing.value = true;

  const ok = await persistCharges();
  if (ok) {
    status.value = "";
    showSaveStatus(`Added ${name}`);
  } else {
    status.value = "Could not save — try again.";
  }
}

async function load() {
  loading.value = true;
  error.value = "";
  status.value = "";
  try {
    const data = await fetchFixedCharges(auth.isDemo, auth.token || undefined);
    charges.value = data.charges.map((c) => ({ ...c }));
    savedSnapshot.value = snapshot(charges.value);
  } catch (e) {
    error.value = String(e);
    charges.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(load);

onUnmounted(() => {
  if (saveTimer) clearTimeout(saveTimer);
  if (saveStatusTimer) clearTimeout(saveStatusTimer);
});
</script>
