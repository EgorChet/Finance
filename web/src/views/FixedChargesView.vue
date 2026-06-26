<template>
  <div>
    <div v-if="auth.isDemo" class="demo-banner">
      Demo mode — household settings are read-only. Sign in to manage your budget and charges.
    </div>
    <div class="recurring-header">
      <div class="recurring-header-top">
        <div>
          <h2 class="page-title">Household</h2>
          <p class="page-lead" style="margin-bottom: 0">
            Living budget, recurring bills, one-time charges, and exclusions.
          </p>
        </div>
        <p
          v-if="!loading && saveStatus"
          class="recurring-save-status"
          :class="{ 'recurring-save-status--error': saveError }"
        >
          {{ saveStatus }}
        </p>
      </div>
    </div>

    <AppLoader
      v-if="loading"
      title="Loading household settings"
      subtitle="Fetching budget, bills, and exclusions"
    />
    <template v-else>
      <p v-if="error" style="color: var(--danger)">{{ error }}</p>

      <LivingBudgetSection
        v-model:segments="livingBudgetSegments"
        v-model:month-topups="livingBudgetMonthTopups"
        :configured-charges="charges"
        :readonly="auth.isDemo"
        :disabled="saving"
        @save="persistCharges"
      />

      <section class="manual-section">
        <header class="manual-section-header">
          <div>
            <h3 class="manual-section-title">Recurring monthly</h3>
            <p class="manual-section-lead">Rent, loans, subscriptions — same amount every month.</p>
          </div>
        </header>

        <div v-if="!auth.isDemo" class="recurring-add-toolbar recurring-add-toolbar--inline">
          <button
            type="button"
            class="btn"
            :class="{ 'btn-primary': activeAddForm === 'recurring' }"
            :disabled="saving"
            @click="toggleAddForm('recurring')"
          >
            {{ activeAddForm === "recurring" ? "Cancel" : "Add recurring bill" }}
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
                <ToggleSwitch v-model="newRecurringOngoing" :disabled="saving" />
                <span class="recurring-ongoing-text">No end date</span>
              </label>
            </div>
            <button type="button" class="btn btn-primary recurring-add-btn" :disabled="saving" @click="addRecurring">
              {{ saving ? "Saving…" : "Add recurring bill" }}
            </button>
          </div>
        </section>
        <p v-if="status && activeAddForm === 'recurring'" class="recurring-form-error">{{ status }}</p>

        <div v-if="recurringGroups.length" class="recurring-groups">
          <section v-for="group in recurringGroups" :key="group.id" class="recurring-card recurring-card--compact">
            <header class="recurring-card-header">
              <div>
                <h3 class="recurring-card-title">{{ group.name_en }}</h3>
                <p class="recurring-card-sub">{{ group.category_en }} · {{ timelineSummary(group) }}</p>
              </div>
              <div v-if="!auth.isDemo && isEditingGroup(group)" class="section-header-actions">
                <IconButton icon="plus" label="Add period" :disabled="saving" @click="addSegment(group)" />
              </div>
            </header>

            <ul class="charge-compact-list">
              <li v-for="(seg, segIndex) in group.segments" :key="`${group.id}-${segIndex}`" class="charge-compact-row-wrap">
                <div v-if="auth.isDemo || !isEditingCharge(seg)" class="list-row">
                  <div class="list-row__main">
                    <span class="list-row__amount">{{ formatIls(seg.amount) }}</span>
                    <span class="list-row__meta">{{ monthRangeLabel(seg.from_month, seg.through_month) }}</span>
                  </div>
                  <span
                    class="list-row__status recurring-status"
                    :class="'recurring-status-' + segmentStatus(seg.from_month, seg.through_month)"
                  >
                    {{ statusLabel(seg) }}
                  </span>
                  <button
                    v-if="!auth.isDemo"
                    type="button"
                    class="btn btn-edit"
                    :disabled="saving"
                    @click="startEditCharge(seg)"
                  >
                    Edit
                  </button>
                </div>

                <EditPanel
                  v-else
                  title="Edit period"
                  done-label="Save"
                  :disabled="saving"
                  deletable
                  :delete-label="segmentDeleteLabel(group)"
                  @done="finishEditCharge(seg)"
                  @cancel="cancelEditCharge(seg)"
                  @delete="deleteSegmentOrBill(group, seg)"
                >
                  <div class="recurring-segment-row">
                    <div class="field-group">
                      <label class="field-label">Amount (₪)</label>
                      <input
                        v-model.number="seg.amount"
                        class="input"
                        type="number"
                        min="0"
                        step="0.01"
                        inputmode="decimal"
                      />
                    </div>
                    <div class="field-group">
                      <label class="field-label">From</label>
                      <MonthSelect v-model="seg.from_month" />
                    </div>
                  </div>
                  <div class="field-group recurring-segment-through">
                    <label class="field-label">Through</label>
                    <MonthSelect v-if="!isOngoingThrough(seg.through_month)" v-model="seg.through_month" />
                    <label class="recurring-ongoing recurring-ongoing--compact">
                      <ToggleSwitch
                        :model-value="isOngoingThrough(seg.through_month)"
                        :disabled="saving"
                        @update:model-value="toggleOngoing(seg, $event)"
                      />
                      <span class="recurring-ongoing-text">No end date</span>
                    </label>
                  </div>
                </EditPanel>
              </li>
            </ul>
          </section>
        </div>

        <p v-else class="manual-empty">No recurring bills yet.</p>
      </section>

      <section class="manual-section">
        <header class="manual-section-header">
          <div>
            <h3 class="manual-section-title">One-time charges</h3>
            <p class="manual-section-lead">
              Purchases on another card, cash, or anything that happens once — shown on the exact date in spending.
            </p>
          </div>
        </header>

        <div v-if="!auth.isDemo" class="recurring-add-toolbar recurring-add-toolbar--inline">
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

        <section v-if="activeAddForm === 'once' && !auth.isDemo" class="recurring-add recurring-add--panel">
          <h3 class="recurring-add-title">New one-time charge</h3>
          <div class="recurring-add-fields">
            <div class="field-group">
              <label class="field-label">Name</label>
              <input v-model="newOneTime.name_en" class="input" placeholder="e.g. Cherry watermelon market" />
            </div>
            <div class="charge-detail-fields">
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
        <p v-if="status && activeAddForm === 'once'" class="recurring-form-error">{{ status }}</p>

        <div v-if="oneTimeCharges.length" class="recurring-groups">
          <ul class="charge-compact-list">
            <li v-for="charge in oneTimeCharges" :key="charge.id" class="charge-compact-row-wrap">
              <div v-if="auth.isDemo || !isEditingCharge(charge)" class="list-row">
                <div class="list-row__main">
                  <strong class="list-row__label">{{ charge.name_en }}</strong>
                  <span class="list-row__meta">
                    {{ formatIls(charge.amount) }} · {{ dateToLabel(charge.charge_date!) }} · {{ charge.category_en }}
                  </span>
                </div>
                <span
                  class="list-row__status recurring-status"
                  :class="'recurring-status-' + oneTimeStatusClass(charge.charge_date!)"
                >
                  {{ oneTimeStatusLabel(charge.charge_date!) }}
                </span>
                <button
                  v-if="!auth.isDemo"
                  type="button"
                  class="btn btn-edit"
                  :disabled="saving"
                  @click="startEditCharge(charge)"
                >
                  Edit
                </button>
              </div>

              <EditPanel
                v-else
                title="Edit charge"
                done-label="Save"
                :disabled="saving"
                deletable
                delete-label="Delete charge"
                @done="finishEditCharge(charge)"
                @cancel="cancelEditCharge(charge)"
                @delete="removeOneTime(charge)"
              >
                <div class="charge-detail-fields">
                  <div class="field-group">
                    <label class="field-label">Name</label>
                    <input v-model="charge.name_en" class="input" />
                  </div>
                  <div class="field-group">
                    <label class="field-label">Date</label>
                    <input
                      class="input"
                      type="date"
                      :value="charge.charge_date"
                      @input="onOneTimeDateChange(charge, ($event.target as HTMLInputElement).value)"
                    />
                  </div>
                  <div class="field-group">
                    <label class="field-label">Amount (₪)</label>
                    <input
                      v-model.number="charge.amount"
                      class="input"
                      type="number"
                      min="0"
                      step="0.01"
                      inputmode="decimal"
                    />
                  </div>
                  <div class="field-group">
                    <label class="field-label">Category</label>
                    <CategorySelect v-model="charge.category_en" :options="categories" />
                  </div>
                </div>
              </EditPanel>
            </li>
          </ul>
        </div>

        <p v-else class="manual-empty">No one-time charges yet.</p>
      </section>

      <ExcludedSection />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { fetchFixedCharges, fetchLivingBudget, saveFixedCharges, saveLivingBudget } from "../api/client";
import AppLoader from "../components/AppLoader.vue";
import CategorySelect from "../components/CategorySelect.vue";
import EditPanel from "../components/EditPanel.vue";
import ExcludedSection from "../components/ExcludedSection.vue";
import IconButton from "../components/IconButton.vue";
import LivingBudgetSection from "../components/LivingBudgetSection.vue";
import MonthSelect from "../components/MonthSelect.vue";
import ToggleSwitch from "../components/ToggleSwitch.vue";
import { SPENDING_CATEGORIES } from "../categories";
import { useAuthStore } from "../stores/auth";
import { confirm } from "../composables/useConfirm";
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
import {
  type LivingBudgetMonthTopup,
  type LivingBudgetSegment,
  normalizeLivingBudgetMonthTopup,
  normalizeLivingBudgetSegment,
  serializeLivingBudget,
  validateLivingBudget,
} from "../utils/livingBudget";

const categories = SPENDING_CATEGORIES;
const auth = useAuthStore();
const loading = ref(true);
const hydrated = ref(false);
const saving = ref(false);
const error = ref("");
const status = ref("");
const saveStatus = ref("");
const saveError = ref(false);
const charges = ref<ConfiguredCharge[]>([]);
const livingBudgetSegments = ref<LivingBudgetSegment[]>([]);
const livingBudgetMonthTopups = ref<LivingBudgetMonthTopup[]>([]);
const savedSnapshot = ref("");
const savedBudgetSnapshot = ref("");

type AddFormKind = "recurring" | "once";
const activeAddForm = ref<AddFormKind | null>(null);
const editingCharge = ref<ConfiguredCharge | null>(null);
const chargeEditSnapshot = ref<ConfiguredCharge | null>(null);

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
const hasUnsavedChanges = computed(() => hydrated.value && isDirty());

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
  return JSON.stringify(
    data.map(normalizeConfiguredCharge).sort((a, b) => segmentKey(a).localeCompare(segmentKey(b))),
  );
}

function budgetSnapshot(segments: LivingBudgetSegment[], monthTopups: LivingBudgetMonthTopup[]): string {
  return serializeLivingBudget({ segments, month_topups: monthTopups });
}

function syncSavedSnapshots() {
  savedSnapshot.value = snapshot(charges.value);
  savedBudgetSnapshot.value = budgetSnapshot(livingBudgetSegments.value, livingBudgetMonthTopups.value);
}

function isChargesDirty(): boolean {
  return snapshot(charges.value) !== savedSnapshot.value;
}

function isBudgetDirty(): boolean {
  return budgetSnapshot(livingBudgetSegments.value, livingBudgetMonthTopups.value) !== savedBudgetSnapshot.value;
}

function isDirty(): boolean {
  return isChargesDirty() || isBudgetDirty();
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

async function persistCharges(): Promise<boolean> {
  if (auth.isDemo) return true;
  if (!isDirty()) return true;

  saveChain = saveChain.then(() => runPersist());
  return saveChain;
}

let saveChain: Promise<boolean> = Promise.resolve(true);

async function runPersist(): Promise<boolean> {
  if (!isDirty()) return true;

  if (isBudgetDirty()) {
    const budgetError = validateLivingBudget(livingBudgetSegments.value, livingBudgetMonthTopups.value);
    if (budgetError) {
      showSaveStatus(budgetError, true);
      status.value = budgetError;
      return false;
    }
  }

  saving.value = true;
  showSaveStatus("Saving…");
  status.value = "";
  saveError.value = false;
  try {
    const tasks: Promise<void>[] = [];
    if (isChargesDirty()) {
      tasks.push(
        saveFixedCharges(
          charges.value.map((c) => normalizeConfiguredCharge(c)),
          auth.token || undefined,
        ).then((data) => {
          charges.value = data.charges.map((c) => normalizeConfiguredCharge(c));
        }),
      );
    }
    if (isBudgetDirty()) {
      tasks.push(
        saveLivingBudget(
          {
            segments: livingBudgetSegments.value.map((s) => normalizeLivingBudgetSegment(s)),
            month_topups: livingBudgetMonthTopups.value.map((t) => normalizeLivingBudgetMonthTopup(t)),
          },
          auth.token || undefined,
        ).then((data) => {
          livingBudgetSegments.value = data.segments.map((s) => normalizeLivingBudgetSegment(s));
          livingBudgetMonthTopups.value = (data.month_topups || []).map((t) => normalizeLivingBudgetMonthTopup(t));
        }),
      );
    }
    await Promise.all(tasks);
    syncSavedSnapshots();
    showSaveStatus("Saved");
    return true;
  } catch (e) {
    showSaveStatus(String(e), true);
    status.value = String(e);
    return false;
  } finally {
    saving.value = false;
  }
}

function isEditingCharge(charge: ConfiguredCharge): boolean {
  return editingCharge.value === charge;
}

function isEditingGroup(group: { segments: ConfiguredCharge[] }): boolean {
  return group.segments.some((seg) => editingCharge.value === seg);
}

function segmentDeleteLabel(group: ChargeGroup): string {
  return group.segments.length <= 1 ? "Remove bill" : "Delete period";
}

async function deleteSegmentOrBill(group: ChargeGroup, seg: ConfiguredCharge) {
  if (group.segments.length <= 1) {
    await removeCharge(group.id);
  } else {
    await removeSegment(seg);
  }
}

function startEditCharge(charge: ConfiguredCharge) {
  chargeEditSnapshot.value = normalizeConfiguredCharge({ ...charge });
  editingCharge.value = charge;
}

async function finishEditCharge(charge: ConfiguredCharge) {
  if (editingCharge.value !== charge) return;
  chargeEditSnapshot.value = null;
  editingCharge.value = null;
  await persistCharges();
}

function cancelEditCharge(charge: ConfiguredCharge) {
  if (editingCharge.value !== charge || !chargeEditSnapshot.value) {
    editingCharge.value = null;
    chargeEditSnapshot.value = null;
    return;
  }

  const savedCharges = JSON.parse(savedSnapshot.value) as ConfiguredCharge[];
  const snapKey = segmentKey(chargeEditSnapshot.value);
  const wasPersisted = savedCharges.some((c) => segmentKey(c) === snapKey);
  const idx = charges.value.indexOf(charge);

  if (wasPersisted && idx >= 0) {
    charges.value[idx] = { ...chargeEditSnapshot.value };
  } else {
    charges.value = charges.value.filter((c) => c !== charge);
  }

  chargeEditSnapshot.value = null;
  editingCharge.value = null;
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
}

function onOneTimeDateChange(charge: ConfiguredCharge, date: string) {
  charge.charge_date = date;
  charge.from_month = date.slice(0, 7);
  charge.through_month = date.slice(0, 7);
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
}

async function removeSegment(seg: ConfiguredCharge) {
  const label = `${formatIls(seg.amount)} (${monthRangeLabel(seg.from_month, seg.through_month)})`;
  const ok = await confirm({
    title: "Delete period?",
    message: `Remove this billing period — ${label}?`,
    confirmLabel: "Delete period",
    tone: "danger",
  });
  if (!ok) return;
  if (editingCharge.value === seg) {
    editingCharge.value = null;
    chargeEditSnapshot.value = null;
  }
  const key = segmentKey(seg);
  charges.value = charges.value.filter((c) => segmentKey(c) !== key);
  await persistCharges();
}

async function removeCharge(id: string) {
  const group = recurringGroups.value.find((g) => g.id === id);
  const label = group?.name_en ?? "this bill";
  const ok = await confirm({
    title: "Remove bill?",
    message: `Remove ${label} from recurring bills?`,
    confirmLabel: "Remove bill",
    tone: "danger",
  });
  if (!ok) return;
  if (group?.segments.some((s) => editingCharge.value === s)) {
    editingCharge.value = null;
    chargeEditSnapshot.value = null;
  }
  charges.value = charges.value.filter((c) => c.id !== id || isOneTimeCharge(c));
  await persistCharges();
}

async function removeOneTime(charge: ConfiguredCharge) {
  const ok = await confirm({
    title: "Delete charge?",
    message: `Delete "${charge.name_en}" (${formatIls(charge.amount)})?`,
    confirmLabel: "Delete",
    tone: "danger",
  });
  if (!ok) return;
  if (editingCharge.value === charge) {
    editingCharge.value = null;
    chargeEditSnapshot.value = null;
  }
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
  hydrated.value = false;
  error.value = "";
  status.value = "";
  try {
    const token = auth.token || undefined;
    const chargesData = await fetchFixedCharges(auth.isDemo, token);
    charges.value = chargesData.charges.map((c) => normalizeConfiguredCharge(c));
    try {
      const budgetData = await fetchLivingBudget(auth.isDemo, token);
      livingBudgetSegments.value = budgetData.segments.map((s) => normalizeLivingBudgetSegment(s));
      livingBudgetMonthTopups.value = (budgetData.month_topups || []).map((t) => normalizeLivingBudgetMonthTopup(t));
    } catch (budgetErr) {
      livingBudgetSegments.value = [];
      livingBudgetMonthTopups.value = [];
      error.value = `Could not load living budget: ${budgetErr}. Redeploy the Render API if you recently added this feature.`;
    }
    syncSavedSnapshots();
  } catch (e) {
    error.value = String(e);
    charges.value = [];
    livingBudgetSegments.value = [];
    livingBudgetMonthTopups.value = [];
    syncSavedSnapshots();
  } finally {
    hydrated.value = true;
    loading.value = false;
  }
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!auth.isDemo && hasUnsavedChanges.value) {
    e.preventDefault();
  }
}

onBeforeRouteLeave(async () => {
  if (auth.isDemo || !isDirty()) return true;
  await persistCharges();
  return true;
});

onMounted(() => {
  load();
  window.addEventListener("beforeunload", onBeforeUnload);
});

onUnmounted(() => {
  window.removeEventListener("beforeunload", onBeforeUnload);
  if (saveStatusTimer) clearTimeout(saveStatusTimer);
});
</script>
