<template>
  <div>
    <div v-if="auth.isDemo" class="demo-banner">
      Demo mode — extra charges are read-only. Sign in to manage recurring bills and one-time entries.
    </div>
    <div class="recurring-header">
      <div>
        <h2 class="page-title">Extra charges</h2>
        <p class="page-lead" style="margin-bottom: 0">
          Recurring monthly bills plus one-time charges from other cards or cash. Changes save automatically.
        </p>
      </div>
      <p v-if="saveStatus" class="recurring-save-status" :class="{ 'recurring-save-status--error': saveError }">
        {{ saveStatus }}
      </p>
    </div>

    <AppLoader
      v-if="loading"
      title="Loading extra charges"
      subtitle="Fetching recurring bills and one-time entries"
    />
    <template v-else>
      <p v-if="error" style="color: var(--danger)">{{ error }}</p>

      <div v-if="!auth.isDemo" class="recurring-add-toolbar">
        <button
          type="button"
          class="btn"
          :class="{ 'btn-primary': activeAddForm === 'recurring' }"
          :disabled="saving"
          @click="toggleAddForm('recurring')"
        >
          {{ activeAddForm === "recurring" ? "Cancel" : "Add recurring bill" }}
        </button>
        <button
          type="button"
          class="btn"
          :class="{ 'btn-primary': activeAddForm === 'once' }"
          :disabled="saving"
          @click="toggleAddForm('once')"
        >
          {{ activeAddForm === "once" ? "Cancel" : "Add one-time charge" }}
        </button>
      </div>

      <section v-if="activeAddForm === 'recurring' && !auth.isDemo" class="recurring-add recurring-add--panel">
        <h3 class="recurring-add-title">New recurring bill</h3>
        <div class="recurring-add-fields">
          <div class="field-group">
            <label class="field-label">Name</label>
            <input v-model="newRecurring.name_en" class="input" placeholder="e.g. Rent" />
          </div>
          <div class="field-group">
            <label class="field-label">Category</label>
            <CategorySelect v-model="newRecurring.category_en" :options="categories" />
          </div>
          <div class="recurring-add-schedule-row">
            <div class="field-group">
              <label class="field-label">Amount (₪)</label>
              <input
                v-model.number="newRecurring.amount"
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
              <MonthSelect v-model="newRecurring.from_month" />
            </div>
          </div>
          <div class="field-group recurring-segment-through">
            <label class="field-label">Through</label>
            <MonthSelect v-if="!newRecurringOngoing" v-model="newRecurring.through_month" />
            <label class="recurring-ongoing recurring-ongoing--compact">
              <input v-model="newRecurringOngoing" type="checkbox" />
              <span class="recurring-ongoing-text">No end date</span>
            </label>
          </div>
          <button type="button" class="btn btn-primary recurring-add-btn" :disabled="saving" @click="addRecurring">
            {{ saving ? "Saving…" : "Add recurring bill" }}
          </button>
        </div>
      </section>

      <section v-if="activeAddForm === 'once' && !auth.isDemo" class="recurring-add recurring-add--panel">
        <h3 class="recurring-add-title">New one-time charge</h3>
        <div class="recurring-add-fields">
          <div class="field-group">
            <label class="field-label">Name</label>
            <input v-model="newOneTime.name_en" class="input" placeholder="e.g. Cherry watermelon market" />
          </div>
          <div class="recurring-add-schedule-row recurring-add-schedule-row--triple">
            <div class="field-group">
              <label class="field-label">Date</label>
              <input v-model="newOneTime.charge_date" class="input" type="date" />
            </div>
            <div class="field-group">
              <label class="field-label">Amount (₪)</label>
              <input
                v-model.number="newOneTime.amount"
                class="input"
                type="number"
                min="0"
                step="0.01"
                inputmode="decimal"
                placeholder="0"
              />
            </div>
            <div class="field-group">
              <label class="field-label">Category</label>
              <CategorySelect v-model="newOneTime.category_en" :options="categories" />
            </div>
          </div>
          <button type="button" class="btn btn-primary recurring-add-btn" :disabled="saving" @click="addOneTime">
            {{ saving ? "Saving…" : "Add one-time charge" }}
          </button>
        </div>
      </section>

      <p v-if="status" class="recurring-form-error">{{ status }}</p>

      <section class="manual-section">
        <header class="manual-section-header">
          <h3 class="manual-section-title">Recurring monthly</h3>
          <p class="manual-section-lead">Rent, loans, subscriptions — same amount every month.</p>
        </header>

        <div v-if="recurringGroups.length" class="recurring-groups">
          <section v-for="group in recurringGroups" :key="group.id" class="recurring-card">
            <header class="recurring-card-header">
              <div>
                <h3 class="recurring-card-title">{{ group.name_en }}</h3>
                <p class="recurring-card-sub">{{ group.category_en }}</p>
              </div>
              <div v-if="!auth.isDemo" class="recurring-card-actions">
                <button type="button" class="btn" :disabled="saving" @click="addSegment(group)">Add period</button>
                <button type="button" class="btn btn-danger" :disabled="saving" @click="removeCharge(group.id)">
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

                <div class="recurring-segment-row">
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
                </div>

                <div class="recurring-segment-footer">
                  <div class="field-group recurring-segment-through">
                    <label class="field-label">Through</label>
                    <template v-if="!auth.isDemo">
                      <MonthSelect
                        v-if="!isOngoingThrough(seg.through_month)"
                        v-model="seg.through_month"
                        @update:model-value="queueSave()"
                      />
                      <label class="recurring-ongoing recurring-ongoing--compact">
                        <input
                          type="checkbox"
                          :checked="isOngoingThrough(seg.through_month)"
                          @change="toggleOngoing(seg, ($event.target as HTMLInputElement).checked)"
                        />
                        <span class="recurring-ongoing-text">No end date</span>
                      </label>
                    </template>
                    <p v-else style="margin: 0">{{ throughLabel(seg.through_month) }}</p>
                  </div>

                  <div v-if="!auth.isDemo" class="recurring-segment-actions">
                    <button type="button" class="btn btn-danger" :disabled="saving" @click="removeSegment(seg)">
                      {{ saving ? "…" : "Delete period" }}
                    </button>
                  </div>
                </div>
              </article>
            </div>

            <p class="recurring-timeline">{{ timelineSummary(group) }}</p>
          </section>
        </div>

        <p v-else class="manual-empty">No recurring bills yet.</p>
      </section>

      <section class="manual-section">
        <header class="manual-section-header">
          <h3 class="manual-section-title">One-time charges</h3>
          <p class="manual-section-lead">
            Purchases on another card, cash, or anything that happens once — shown on the exact date in spending.
          </p>
        </header>

        <div v-if="oneTimeCharges.length" class="recurring-groups">
          <article v-for="charge in oneTimeCharges" :key="segmentKey(charge)" class="recurring-segment-card">
            <div class="recurring-segment-head">
              <div>
                <strong>{{ charge.name_en }}</strong>
                <p class="recurring-card-sub">{{ charge.category_en }}</p>
              </div>
              <span class="recurring-status" :class="'recurring-status-' + oneTimeStatusClass(charge.charge_date!)">
                {{ oneTimeStatusLabel(charge.charge_date!) }}
              </span>
            </div>

            <div class="recurring-segment-row recurring-segment-row--triple">
              <div class="field-group">
                <label class="field-label">Date</label>
                <input
                  v-if="!auth.isDemo"
                  class="input"
                  type="date"
                  :value="charge.charge_date"
                  @input="onOneTimeDateChange(charge, ($event.target as HTMLInputElement).value)"
                />
                <p v-else style="margin: 0">{{ dateToLabel(charge.charge_date!) }}</p>
              </div>

              <div class="field-group">
                <label class="field-label">Amount (₪)</label>
                <input
                  v-if="!auth.isDemo"
                  v-model.number="charge.amount"
                  class="input"
                  type="number"
                  min="0"
                  step="0.01"
                  inputmode="decimal"
                  @input="queueSave()"
                />
                <p v-else class="recurring-segment-amount-display">{{ formatIls(charge.amount) }}</p>
              </div>

              <div class="field-group">
                <label class="field-label">Category</label>
                <CategorySelect v-if="!auth.isDemo" v-model="charge.category_en" :options="categories" @update:model-value="queueSave()" />
                <p v-else style="margin: 0">{{ charge.category_en }}</p>
              </div>
            </div>

            <div v-if="!auth.isDemo" class="recurring-segment-actions">
              <button type="button" class="btn btn-danger" :disabled="saving" @click="removeOneTime(charge)">
                {{ saving ? "…" : "Delete" }}
              </button>
            </div>
          </article>
        </div>

        <p v-else class="manual-empty">No one-time charges yet.</p>
      </section>
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
  dateToLabel,
  groupCharges,
  isMonthlyCharge,
  isOneTimeCharge,
  isOngoingThrough,
  monthRangeLabel,
  normalizeConfiguredCharge,
  oneTimeStatus,
  segmentKey,
  segmentStatus,
  slugifyId,
  todayIsoDate,
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

type AddFormKind = "recurring" | "once";
const activeAddForm = ref<AddFormKind | null>(null);

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveStatusTimer: ReturnType<typeof setTimeout> | null = null;

const newRecurring = ref({
  name_en: "",
  category_en: "Housing",
  amount: 0,
  from_month: currentYearMonth(),
  through_month: ONGOING_THROUGH_MONTH,
});
const newRecurringOngoing = ref(true);

const newOneTime = ref({
  name_en: "",
  category_en: "Groceries",
  amount: 0,
  charge_date: todayIsoDate(),
});

const recurringGroups = computed(() => groupCharges(charges.value.filter(isMonthlyCharge)));
const oneTimeCharges = computed(() =>
  charges.value
    .filter(isOneTimeCharge)
    .sort((a, b) => (b.charge_date ?? "").localeCompare(a.charge_date ?? "")),
);

watch(newRecurringOngoing, (on) => {
  if (on) newRecurring.value.through_month = ONGOING_THROUGH_MONTH;
  else if (isOngoingThrough(newRecurring.value.through_month)) {
    newRecurring.value.through_month = currentYearMonth();
  }
});

function toggleAddForm(kind: AddFormKind) {
  if (activeAddForm.value === kind) {
    activeAddForm.value = null;
  } else {
    activeAddForm.value = kind;
  }
  status.value = "";
}

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
    const payload = charges.value.map((c) => normalizeConfiguredCharge(c));
    const data = await saveFixedCharges(payload, auth.token || undefined);
    charges.value = data.charges.map((c) => normalizeConfiguredCharge(c));
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

function oneTimeStatusLabel(chargeDate: string): string {
  const s = oneTimeStatus(chargeDate);
  if (s === "upcoming") return "Scheduled · " + dateToLabel(chargeDate);
  if (s === "active") return "Today";
  return dateToLabel(chargeDate);
}

function oneTimeStatusClass(chargeDate: string): string {
  const s = oneTimeStatus(chargeDate);
  if (s === "upcoming") return "upcoming";
  if (s === "active") return "active";
  return "ended";
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

function onOneTimeDateChange(charge: ConfiguredCharge, date: string) {
  charge.charge_date = date;
  charge.from_month = date.slice(0, 7);
  charge.through_month = date.slice(0, 7);
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
    schedule: "monthly",
    name_en: group.name_en,
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
  const group = recurringGroups.value.find((g) => g.id === id);
  const label = group?.name_en ?? "this bill";
  if (!window.confirm(`Remove ${label} from recurring bills?`)) return;
  charges.value = charges.value.filter((c) => c.id !== id || isOneTimeCharge(c));
  await persistCharges();
}

async function removeOneTime(charge: ConfiguredCharge) {
  const key = segmentKey(charge);
  charges.value = charges.value.filter((c) => segmentKey(c) !== key);
  await persistCharges();
}

function uniqueRecurringId(base: string): string {
  let id = slugifyId(base);
  if (!charges.value.some((c) => c.id === id && isMonthlyCharge(c))) return id;
  let n = 2;
  while (charges.value.some((c) => c.id === `${id}-${n}` && isMonthlyCharge(c))) n += 1;
  return `${id}-${n}`;
}

function uniqueOneTimeId(base: string, chargeDate: string): string {
  const slug = slugifyId(base);
  let id = `${slug}-${chargeDate}`;
  if (!charges.value.some((c) => c.id === id)) return id;
  let n = 2;
  while (charges.value.some((c) => c.id === `${id}-${n}`)) n += 1;
  return `${id}-${n}`;
}

async function addRecurring() {
  status.value = "";
  const name = newRecurring.value.name_en.trim();
  if (!name) {
    status.value = "Enter a name for the bill.";
    return;
  }
  if (!newRecurring.value.amount || newRecurring.value.amount <= 0) {
    status.value = "Enter a positive amount.";
    return;
  }
  if (!newRecurringOngoing.value && newRecurring.value.from_month > newRecurring.value.through_month) {
    status.value = "Start month must be on or before end month.";
    return;
  }
  const throughMonth = newRecurringOngoing.value ? ONGOING_THROUGH_MONTH : newRecurring.value.through_month;
  charges.value.push(
    normalizeConfiguredCharge({
      id: uniqueRecurringId(name),
      schedule: "monthly",
      name_en: name,
      category_en: newRecurring.value.category_en.trim() || "Uncategorized",
      amount: newRecurring.value.amount,
      from_month: newRecurring.value.from_month,
      through_month: throughMonth,
    }),
  );
  newRecurring.value = {
    name_en: "",
    category_en: "Housing",
    amount: 0,
    from_month: currentYearMonth(),
    through_month: ONGOING_THROUGH_MONTH,
  };
  newRecurringOngoing.value = true;

  const ok = await persistCharges();
  if (ok) {
    status.value = "";
    activeAddForm.value = null;
    showSaveStatus(`Added ${name}`);
  } else {
    status.value = "Could not save — try again.";
  }
}

async function addOneTime() {
  status.value = "";
  const name = newOneTime.value.name_en.trim();
  if (!name) {
    status.value = "Enter a name for the charge.";
    return;
  }
  if (!newOneTime.value.charge_date) {
    status.value = "Pick a date.";
    return;
  }
  if (!newOneTime.value.amount || newOneTime.value.amount <= 0) {
    status.value = "Enter a positive amount.";
    return;
  }
  charges.value.push(
    normalizeConfiguredCharge({
      id: uniqueOneTimeId(name, newOneTime.value.charge_date),
      schedule: "once",
      name_en: name,
      category_en: newOneTime.value.category_en.trim() || "Uncategorized",
      amount: newOneTime.value.amount,
      charge_date: newOneTime.value.charge_date,
      from_month: newOneTime.value.charge_date.slice(0, 7),
      through_month: newOneTime.value.charge_date.slice(0, 7),
    }),
  );
  newOneTime.value = {
    name_en: "",
    category_en: "Groceries",
    amount: 0,
    charge_date: todayIsoDate(),
  };

  const ok = await persistCharges();
  if (ok) {
    status.value = "";
    activeAddForm.value = null;
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
    charges.value = data.charges.map((c) => normalizeConfiguredCharge(c));
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
