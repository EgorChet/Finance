<template>
  <div>
    <DemoBanner />
    <header class="bx-page-head">
      <h2 class="page-title">{{ t("Budget") }}</h2>
      <p v-if="!auth.isDemo && !auth.canEditBudget" class="bx-locked">🔒 {{ t("Only Egor can change the budget") }}</p>
      <p
        v-if="!loading && saveStatus"
        class="recurring-save-status"
        :class="{ 'recurring-save-status--error': saveError }"
      >
        {{ saveStatus }}
      </p>
    </header>

    <AppLoader
      v-if="loading"
      variant="hero"
      :title="t('Loading budget')"
      :subtitle="t('Fetching budget, bills, and exclusions')"
    />
    <template v-else>
      <p v-if="error" style="color: var(--danger)">{{ error }}</p>

      <LivingBudgetSection
        v-model:segments="livingBudgetSegments"
        v-model:month-topups="livingBudgetMonthTopups"
        :configured-charges="charges"
        :reference-ym="referenceYm"
        :readonly="budgetLocked"
        :disabled="saving"
        :persist="persistCharges"
        :save-error="status"
        :card-bills="cardBillsMonthly"
        :cycle-plan="cyclePlan"
        @save="persistCharges"
        @edit-recurring-charge="editRecurringCharge"
      />

      <section id="recurring" class="bx-section">
        <div class="bx-list-head">
          <h3>{{ t("Recurring bills") }} <span v-if="activeMonthlyTotal > 0" class="bx-list-total">{{ formatIlsWhole(activeMonthlyTotal) }}{{ t("/mo") }}</span></h3>
          <button v-if="!budgetLocked" type="button" class="bx-pill" :disabled="saving" @click="openAddForm('recurring')">+ {{ t("Add") }}</button>
        </div>
        <div v-if="visibleRecurringGroups.length" class="bx-list">
          <template v-for="group in visibleRecurringGroups" :key="group.id">
            <component
              :is="budgetLocked && singleVisibleSegment(group) ? 'div' : 'button'"
              :type="budgetLocked && singleVisibleSegment(group) ? undefined : 'button'"
              class="bx-row"
              :disabled="!budgetLocked && saving"
              @click="onGroupTap(group)"
            >
              <MerchantIcon :merchant-he="groupDisplayName(group)" :category="group.category_en" />
              <span class="bx-row-body">
                <span class="bx-row-top">
                  <span class="bx-row-name">{{ tr(groupDisplayName(group)) }}</span>
                  <span class="bx-row-amount">{{ formatIlsWhole(groupCurrentAmount(group)) }}<small>{{ t("/mo") }}</small></span>
                </span>
                <span class="bx-row-meta">
                  <span>{{ groupMeta(group) }}</span>
                  <span v-if="groupStatus(group)" class="bx-status" :class="`bx-status--${groupStatus(group)!.cls}`">{{ tr(groupStatus(group)!.label) }}</span>
                </span>
              </span>
              <span v-if="!singleVisibleSegment(group)" class="bx-chevron" :class="{ 'is-open': expandedGroups.has(group.id) }" aria-hidden="true">›</span>
            </component>
            <div v-if="!singleVisibleSegment(group) && expandedGroups.has(group.id)" class="bx-sub">
              <component
                :is="budgetLocked ? 'div' : 'button'"
                v-for="(seg, segIndex) in [...visibleGroupSegments(group), ...(showEndedRecurring ? endedGroupSegments(group) : [])]"
                :key="`${group.id}-${segIndex}`"
                :type="budgetLocked ? undefined : 'button'"
                class="bx-sub-row"
                :disabled="!budgetLocked && saving"
                @click="!budgetLocked && startEditCharge(seg)"
              >
                <span>{{ tr(monthRangeLabel(seg.from_month, seg.through_month)) }}</span>
                <span class="bx-sub-right">
                  <span v-if="statusLabel(seg) !== 'Active'" class="bx-status" :class="`bx-status--${segmentStatus(seg.from_month, seg.through_month, referenceYm)}`">{{ tr(statusLabel(seg)) }}</span>
                  <b>{{ formatIlsWhole(seg.amount) }}</b>
                </span>
              </component>
            </div>
          </template>
          <button
            v-if="endedRecurringCount"
            type="button"
            class="bx-row bx-row--more"
            @click="showEndedRecurring = !showEndedRecurring"
          >
            {{ showEndedRecurring ? t("Hide ended periods ({n})", { n: endedRecurringCount }) : t("Show ended periods ({n})", { n: endedRecurringCount }) }}
          </button>
        </div>
        <p v-else class="bx-empty-line">{{ t("No recurring bills yet. Rent, loans and subscriptions go here.") }}</p>
      </section>

      <RegularChargesSection :readonly="budgetLocked" @saved="showSaveStatus" @monthly="cardBillsMonthly = $event" @plan="cyclePlan = $event" />

      <section id="one-time" class="bx-section">
        <div class="bx-list-head">
          <h3>{{ t("One-time charges") }}</h3>
          <button v-if="!budgetLocked" type="button" class="bx-pill" :disabled="saving" @click="openAddForm('once')">+ {{ t("Add") }}</button>
        </div>
        <div v-if="visibleOneTimeCharges.length || pastOneTimeCharges.length" class="bx-list">
          <component
            :is="budgetLocked ? 'div' : 'button'"
            v-for="charge in [...visibleOneTimeCharges, ...(showPastOneTime ? pastOneTimeCharges : [])]"
            :key="charge.id"
            :type="budgetLocked ? undefined : 'button'"
            class="bx-row"
            :disabled="!budgetLocked && saving"
            @click="!budgetLocked && startEditCharge(charge)"
          >
            <MerchantIcon :merchant-he="chargeDisplayName(charge)" :category="charge.category_en" />
            <span class="bx-row-body">
              <span class="bx-row-top">
                <span class="bx-row-name">{{ tr(chargeDisplayName(charge)) }}</span>
                <span class="bx-row-amount">{{ formatIlsWhole(charge.amount) }}</span>
              </span>
              <span class="bx-row-meta">
                <span>{{ dateToLabel(charge.charge_date!) }} · {{ catName(charge.category_en) }}</span>
                <span
                  v-if="oneTimeStatusClass(charge.charge_date!) !== 'ended'"
                  class="bx-status"
                  :class="`bx-status--${oneTimeStatusClass(charge.charge_date!)}`"
                >
                  {{ oneTimeStatus(charge.charge_date!, referenceToday) === 'active' ? 'Today' : 'Coming up' }}
                </span>
              </span>
            </span>
          </component>
          <button
            v-if="pastOneTimeCharges.length"
            type="button"
            class="bx-row bx-row--more"
            @click="showPastOneTime = !showPastOneTime"
          >
            {{ showPastOneTime ? t("Hide past charges ({n})", { n: pastOneTimeCharges.length }) : t("Show past charges ({n})", { n: pastOneTimeCharges.length }) }}
          </button>
        </div>
        <p v-else class="bx-empty-line">
          {{ t("Nothing planned. Add purchases on another card, cash, or a big one-off you know is coming — it's set aside in your budget.") }}
        </p>
      </section>

      <!-- Edit an existing recurring period -->
      <SheetEditor
        :open="!budgetLocked && !!editingCharge && isMonthlyCharge(editingCharge)"
        :title="editingGroup ? groupDisplayName(editingGroup) : 'Recurring bill'"
        :subtitle="editingIsNewSegment ? t('New period from a price change') : editingGroupSegmentCount > 1 ? `${t('Billing period')} · ${catName(editingGroup?.category_en)}` : `${t('Monthly')} · ${catName(editingGroup?.category_en)}`"
        :save-label="editingIsNewSegment ? 'Add period' : 'Save'"
        :deletable="!editingIsNewSegment"
        :delete-label="editingGroup ? segmentDeleteLabel(editingGroup) : 'Delete'"
        :busy="saving"
        :error="status"
        @save="editingCharge && finishEditCharge(editingCharge)"
        @cancel="editingCharge && cancelEditCharge(editingCharge)"
        @delete="editingGroup && editingCharge && deleteSegmentOrBill(editingGroup, editingCharge)"
      >
        <template v-if="editingCharge">
          <SheetAmountInput v-model="editingCharge.amount" label="Amount per month" />
          <div class="sheet-field">
            <span class="sheet-field__label">{{ t("From") }}</span>
            <MonthSelect v-model="editingCharge.from_month" />
          </div>
          <label class="sheet-toggle-row">
            <span>{{ t("No end date") }}</span>
            <ToggleSwitch
              :model-value="isOngoingThrough(editingCharge.through_month)"
              @update:model-value="toggleOngoing(editingCharge, $event)"
            />
          </label>
          <div v-if="!isOngoingThrough(editingCharge.through_month)" class="sheet-field">
            <span class="sheet-field__label">{{ t("Through") }}</span>
            <MonthSelect v-model="editingCharge.through_month" />
          </div>
          <button
            v-if="editingGroup && !editingIsNewSegment"
            type="button"
            class="sheet-editor__secondary"
            :disabled="saving"
            @click="addAnotherPeriod"
          >
            + {{ t("Add a new period (price change)") }}
          </button>
        </template>
      </SheetEditor>

      <!-- Edit an existing one-time charge -->
      <SheetEditor
        :open="!budgetLocked && !!editingCharge && isOneTimeCharge(editingCharge)"
        title="Edit one-time charge"
        delete-label="Delete charge"
        deletable
        :busy="saving"
        :error="status"
        @save="editingCharge && finishEditCharge(editingCharge)"
        @cancel="editingCharge && cancelEditCharge(editingCharge)"
        @delete="editingCharge && removeOneTime(editingCharge)"
      >
        <template v-if="editingCharge">
          <SheetAmountInput v-model="editingCharge.amount" label="Amount" />
          <label class="sheet-field">
            <span class="sheet-field__label">{{ t("Name") }}</span>
            <input v-model="editingCharge.name_en" class="input" enterkeyhint="done" />
          </label>
          <label class="sheet-field">
            <span class="sheet-field__label">{{ t("Date") }}</span>
            <input
              class="input"
              type="date"
              :value="editingCharge.charge_date"
              @input="onOneTimeDateChange(editingCharge, ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="sheet-field">
            <span class="sheet-field__label">{{ t("Category") }}</span>
            <CategorySelect v-model="editingCharge.category_en" :options="categories" />
          </label>
        </template>
      </SheetEditor>

      <!-- Add a recurring bill -->
      <SheetEditor
        :open="!budgetLocked && activeAddForm === 'recurring'"
        title="New recurring bill"
        save-label="Add bill"
        :busy="saving"
        :error="status"
        @save="addRecurring"
        @cancel="closeAddForm"
      >
        <SheetAmountInput v-model="newRecurring.amount" label="Amount per month" />
        <label class="sheet-field">
          <span class="sheet-field__label">{{ t("Name") }}</span>
          <input v-model="newRecurring.name_en" class="input" :placeholder="t('e.g. Rent')" enterkeyhint="done" />
        </label>
        <label class="sheet-field">
          <span class="sheet-field__label">{{ t("Category") }}</span>
          <CategorySelect v-model="newRecurring.category_en" :options="categories" />
        </label>
        <div class="sheet-field">
          <span class="sheet-field__label">{{ t("From") }}</span>
          <MonthSelect v-model="newRecurring.from_month" />
        </div>
        <label class="sheet-toggle-row">
          <span>{{ t("No end date") }}</span>
          <ToggleSwitch v-model="newRecurringOngoing" />
        </label>
        <div v-if="!newRecurringOngoing" class="sheet-field">
          <span class="sheet-field__label">{{ t("Through") }}</span>
          <MonthSelect v-model="newRecurring.through_month" />
        </div>
      </SheetEditor>

      <!-- Add a one-time charge -->
      <SheetEditor
        :open="!budgetLocked && activeAddForm === 'once'"
        title="New one-time charge"
        save-label="Add charge"
        :busy="saving"
        :error="status"
        @save="addOneTime"
        @cancel="closeAddForm"
      >
        <SheetAmountInput v-model="newOneTime.amount" label="Amount" />
        <label class="sheet-field">
          <span class="sheet-field__label">{{ t("Name") }}</span>
          <input v-model="newOneTime.name_en" class="input" :placeholder="t('e.g. Market on cash')" enterkeyhint="done" />
        </label>
        <label class="sheet-field">
          <span class="sheet-field__label">{{ t("Date") }}</span>
          <input v-model="newOneTime.charge_date" class="input" type="date" />
        </label>
        <label class="sheet-field">
          <span class="sheet-field__label">{{ t("Category") }}</span>
          <CategorySelect v-model="newOneTime.category_en" :options="categories" />
        </label>
      </SheetEditor>

      <div class="minor-sections">
        <h3 class="minor-sections__title">{{ t("More") }}</h3>
        <ExcludedSection />
        <AdjustmentsSection />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import DemoBanner from "@/shared/components/DemoBanner.vue";
import { catName, t, tr } from "@/shared/i18n";
import type { BudgetPlan } from "@core/spending/budgetPlan";
import MerchantIcon from "@/shared/components/MerchantIcon.vue";
import { friendlyError } from "@/shared/utils/friendlyError";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute } from "vue-router";
import { saveFixedCharges, saveLivingBudget } from "@/shared/api/client";
import AppLoader from "@/shared/components/AppLoader.vue";
import CategorySelect from "@/shared/components/CategorySelect.vue";
import AdjustmentsSection from "@/features/household/components/AdjustmentsSection.vue";
import ExcludedSection from "@/features/household/components/ExcludedSection.vue";
import IconButton from "@/shared/components/IconButton.vue";
import LivingBudgetSection from "@/features/household/components/LivingBudgetSection.vue";
import RegularChargesSection from "@/features/household/components/RegularChargesSection.vue";
import MonthSelect from "@/shared/components/MonthSelect.vue";
import SheetAmountInput from "@/shared/components/SheetAmountInput.vue";
import SheetEditor from "@/shared/components/SheetEditor.vue";
import ToggleSwitch from "@/shared/components/ToggleSwitch.vue";
import { SPENDING_CATEGORIES } from "@/shared/categories";
import { useAuthStore } from "@/shared/stores/auth";
import { invalidateHouseholdDataCaches } from "@/shared/stores/invalidateCaches";
import { useHomeDataStore } from "@/features/home/stores/homeData";
import { type HouseholdBundle, useHouseholdDataStore } from "@/shared/stores/viewData";
import { confirm } from "@/shared/composables/useConfirm";
import { referenceDate, yearMonthForDate } from "@/shared/utils/appDate";
import { formatIls, formatIlsWhole } from "@/shared/utils/format";
import { isoDateLocal } from "@/shared/utils/transactionPeriod";
import {
  type ChargeGroup,
  type ConfiguredCharge,
  ONGOING_THROUGH_MONTH,
  chargeDisplayName,
  currentYearMonth,
  dateToLabel,
  groupDisplayName,
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
} from "@/features/household/utils/fixedCharges";
import {
  type LivingBudgetMonthTopup,
  type LivingBudgetSegment,
  normalizeLivingBudgetMonthTopup,
  normalizeLivingBudgetSegment,
  serializeLivingBudget,
  validateLivingBudget,
} from "@/features/household/utils/livingBudget";

const categories = SPENDING_CATEGORIES;
const auth = useAuthStore();
/** Demo, or a household member who isn't allowed to change the budget. */
/** Average monthly bills on the Cal card, reported by "Bills on your card". */
const cardBillsMonthly = ref(0);
const cyclePlan = ref<BudgetPlan | null>(null);
const budgetLocked = computed(() => auth.readOnly || !auth.canEditBudget);
const homeData = useHomeDataStore();
const householdData = useHouseholdDataStore();
const refDate = computed(() => referenceDate(auth.isDemo, auth.demoAsOf));
const referenceYm = computed(() => yearMonthForDate(refDate.value));
const referenceToday = computed(() => isoDateLocal(refDate.value));
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
const showEndedRecurring = ref(false);
const showPastOneTime = ref(false);

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
const visibleRecurringGroups = computed(() =>
  recurringGroups.value.filter(
    (group) =>
      visibleGroupSegments(group).length > 0 ||
      (showEndedRecurring.value && endedGroupSegments(group).length > 0),
  ),
);
const oneTimeCharges = computed(() =>
  charges.value
    .filter(isOneTimeCharge)
    .sort((a, b) => (b.charge_date ?? "").localeCompare(a.charge_date ?? "")),
);
const visibleOneTimeCharges = computed(() =>
  oneTimeCharges.value.filter((charge) => oneTimeStatus(charge.charge_date!, referenceToday.value) !== "past"),
);
const pastOneTimeCharges = computed(() =>
  oneTimeCharges.value.filter((charge) => oneTimeStatus(charge.charge_date!, referenceToday.value) === "past"),
);
const endedRecurringCount = computed(() =>
  recurringGroups.value.reduce((sum, group) => sum + endedGroupSegments(group).length, 0),
);
// Recurring and one-time lists fold away by default; each viewer's choice is remembered.
type FoldKey = "recurring" | "oneTime";
const FOLD_STORAGE_KEY = "finance-budget-folds";
const route = useRoute();
function readFolds(): Partial<Record<FoldKey, boolean>> {
  try {
    return JSON.parse(localStorage.getItem(FOLD_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}
const savedFolds = readFolds();
const recurringOpen = ref(route.hash === "#recurring" || savedFolds.recurring === true);
const oneTimeOpen = ref(route.hash === "#one-time" || savedFolds.oneTime === true);
function setFold(key: FoldKey, open: boolean) {
  if (key === "recurring") recurringOpen.value = open;
  else oneTimeOpen.value = open;
  try {
    localStorage.setItem(
      FOLD_STORAGE_KEY,
      JSON.stringify({ recurring: recurringOpen.value, oneTime: oneTimeOpen.value }),
    );
  } catch {
    /* storage unavailable: the choice just isn't remembered */
  }
}

const recurringSummary = computed(() => {
  const active = recurringGroups.value.flatMap((group) =>
    group.segments.filter((seg) => segmentStatus(seg.from_month, seg.through_month, referenceYm.value) === "active"),
  );
  if (!active.length) return recurringGroups.value.length ? t("Nothing active this month") : t("No bills yet");
  const total = active.reduce((sum, seg) => sum + (Number(seg.amount) || 0), 0);
  return t("{n} {n|bill|bills} · {amount} a month", { n: active.length, amount: formatIls(total) });
});

const oneTimeSummary = computed(() => {
  const upcoming = visibleOneTimeCharges.value;
  if (upcoming.length) {
    const total = upcoming.reduce((sum, charge) => sum + (Number(charge.amount) || 0), 0);
    return t("{n} upcoming · {amount}", { n: upcoming.length, amount: formatIls(total) });
  }
  if (pastOneTimeCharges.value.length) return t("None upcoming · {n} past", { n: pastOneTimeCharges.value.length });
  return t("None yet");
});

const hasUnsavedChanges = computed(() => hydrated.value && isDirty());

function visibleGroupSegments(group: ChargeGroup) {
  return group.segments.filter(
    (seg) => segmentStatus(seg.from_month, seg.through_month, referenceYm.value) !== "ended",
  );
}

function endedGroupSegments(group: ChargeGroup) {
  return group.segments.filter(
    (seg) => segmentStatus(seg.from_month, seg.through_month, referenceYm.value) === "ended",
  );
}

function editRecurringCharge(chargeId: string, fromMonth: string) {
  const charge =
    charges.value.find(
      (c) => c.id === chargeId && isMonthlyCharge(c) && c.from_month === fromMonth,
    ) ?? charges.value.find((c) => c.id === chargeId && isMonthlyCharge(c));
  if (!charge || budgetLocked.value) {
    document.getElementById("recurring")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  startEditCharge(charge);
}

watch(newRecurringOngoing, (on) => {
  if (on) newRecurring.value.through_month = ONGOING_THROUGH_MONTH;
  else if (isOngoingThrough(newRecurring.value.through_month)) {
    newRecurring.value.through_month = currentYearMonth();
  }
});

// Clear a save error once the data is valid again, or once the edit was cancelled.
watch([livingBudgetSegments, livingBudgetMonthTopups, charges], () => {
  if (!status.value && !saveError.value) return;
  const fixed =
    !isDirty() ||
    (isBudgetDirty() && !validateLivingBudget(livingBudgetSegments.value, livingBudgetMonthTopups.value));
  if (fixed) {
    status.value = "";
    if (saveError.value) saveStatus.value = "";
    saveError.value = false;
  }
}, { deep: true });

function openAddForm(kind: AddFormKind) {
  editingCharge.value = null;
  chargeEditSnapshot.value = null;
  activeAddForm.value = kind;
  status.value = "";
}

function closeAddForm() {
  activeAddForm.value = null;
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
  if (budgetLocked.value) return true;
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
  showSaveStatus(t("Saving…"));
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
    invalidateHouseholdDataCaches();
    showSaveStatus(t("Saved"));
    return true;
  } catch (e) {
    showSaveStatus(friendlyError(e), true);
    status.value = friendlyError(e);
    return false;
  } finally {
    saving.value = false;
  }
}

const editingGroup = computed<ChargeGroup | null>(() => {
  const charge = editingCharge.value;
  if (!charge || !isMonthlyCharge(charge)) return null;
  return recurringGroups.value.find((g) => g.segments.includes(charge)) ?? null;
});

const editingGroupSegmentCount = computed(() => editingGroup.value?.segments.length ?? 0);

/** Set while editing a period created by "Add a new period", so Cancel can undo the split. */
const newSegmentContext = ref<{ segment: ConfiguredCharge; previous: ConfiguredCharge | null; previousThrough: string } | null>(null);

const editingIsNewSegment = computed(
  () => !!editingCharge.value && newSegmentContext.value?.segment === editingCharge.value,
);

function addAnotherPeriod() {
  const group = editingGroup.value;
  if (!group) return;
  const previous = group.segments[group.segments.length - 1] ?? null;
  const previousThrough = previous?.through_month ?? "";
  addSegment(group);
  const added = charges.value[charges.value.length - 1]!;
  chargeEditSnapshot.value = normalizeConfiguredCharge({ ...added });
  editingCharge.value = added;
  newSegmentContext.value = { segment: added, previous, previousThrough };
  status.value = "";
}

function segmentDeleteLabel(group: ChargeGroup): string {
  return group.segments.length <= 1 ? t("Remove bill") : t("Delete period");
}

async function deleteSegmentOrBill(group: ChargeGroup, seg: ConfiguredCharge) {
  const label =
    group.segments.length <= 1
      ? groupDisplayName(group)
      : `${formatIls(seg.amount)} (${monthRangeLabel(seg.from_month, seg.through_month)})`;
  const ok = await confirm({
    title: group.segments.length <= 1 ? t("Remove bill?") : t("Delete period?"),
    message:
      group.segments.length <= 1
        ? t("Remove {label} from recurring bills?", { label })
        : t("Remove this billing period — {label}?", { label }),
    confirmLabel: group.segments.length <= 1 ? t("Remove bill") : t("Delete period"),
    tone: "danger",
  });
  if (!ok) return;
  if (group.segments.length <= 1) {
    await removeCharge(group.id, { skipConfirm: true });
  } else {
    await removeSegment(seg, { skipConfirm: true });
  }
}

function startEditCharge(charge: ConfiguredCharge) {
  activeAddForm.value = null;
  newSegmentContext.value = null;
  status.value = "";
  chargeEditSnapshot.value = normalizeConfiguredCharge({ ...charge });
  editingCharge.value = charge;
}

async function finishEditCharge(charge: ConfiguredCharge) {
  if (editingCharge.value !== charge) return;
  status.value = "";
  if (isMonthlyCharge(charge) && !isOngoingThrough(charge.through_month) && charge.from_month > charge.through_month) {
    status.value = t("Start month must be on or before end month.");
    return;
  }
  // Keep the sheet open until the save succeeds, so a failure is shown where the user is looking.
  const ok = await persistCharges();
  if (!ok) {
    if (!status.value) status.value = t("Could not save — try again.");
    return;
  }
  if (editingCharge.value !== charge) return;
  chargeEditSnapshot.value = null;
  editingCharge.value = null;
  newSegmentContext.value = null;
}

function cancelEditCharge(charge: ConfiguredCharge) {
  status.value = "";
  const split = newSegmentContext.value;
  newSegmentContext.value = null;
  if (split?.segment === charge && split.previous && charges.value.includes(split.previous)) {
    split.previous.through_month = split.previousThrough;
  }
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
  return isOngoingThrough(throughMonth) ? t("Ongoing") : ymToLabel(throughMonth);
}

const expandedGroups = ref(new Set<string>());

function onGroupTap(group: ChargeGroup) {
  const single = singleVisibleSegment(group);
  if (single) {
    if (!budgetLocked.value) startEditCharge(single);
    return;
  }
  const next = new Set(expandedGroups.value);
  if (next.has(group.id)) next.delete(group.id);
  else next.add(group.id);
  expandedGroups.value = next;
}

/** The amount in force this month (or the next one to start). */
function groupCurrentSegment(group: ChargeGroup): ConfiguredCharge | null {
  const segs = visibleGroupSegments(group);
  return segs.find((s) => s.from_month <= referenceYm.value && referenceYm.value <= s.through_month) ?? segs[0] ?? null;
}

function groupCurrentAmount(group: ChargeGroup): number {
  return groupCurrentSegment(group)?.amount ?? 0;
}

function groupMeta(group: ChargeGroup): string {
  const seg = groupCurrentSegment(group);
  const periods = visibleGroupSegments(group).length;
  const range = seg ? monthRangeLabel(seg.from_month, seg.through_month) : "";
  return periods > 1 ? `${catName(group.category_en)} · ${t("{n} periods", { n: periods })}` : `${catName(group.category_en)} · ${tr(range)}`;
}

function groupStatus(group: ChargeGroup): { label: string; cls: string } | null {
  const seg = groupCurrentSegment(group);
  if (!seg) return null;
  const label = statusLabel(seg);
  if (label === "Active") return null;
  return { label, cls: segmentStatus(seg.from_month, seg.through_month, referenceYm.value) };
}

const activeMonthlyTotal = computed(() =>
  recurringGroups.value.reduce((sum, g) => {
    const seg = g.segments.find((s) => s.from_month <= referenceYm.value && referenceYm.value <= s.through_month);
    return sum + (seg?.amount ?? 0);
  }, 0),
);

function singleVisibleSegment(group: ChargeGroup): ConfiguredCharge | null {
  const visible = visibleGroupSegments(group);
  return visible.length === 1 ? visible[0]! : null;
}

function statusLabel(seg: ConfiguredCharge): string {
  const s = segmentStatus(seg.from_month, seg.through_month, referenceYm.value);
  if (s === "ended") return "Ended";
  if (s === "upcoming") return `Starts ${ymToLabel(seg.from_month)}`;
  if (isOngoingThrough(seg.through_month)) return "Active";
  return `Ends ${ymToLabel(seg.through_month)}`;
}

function oneTimeStatusLabel(chargeDate: string): string {
  const s = oneTimeStatus(chargeDate, referenceToday.value);
  if (s === "upcoming") return `${t("Scheduled")} · ${dateToLabel(chargeDate)}`;
  if (s === "active") return t("Today");
  return dateToLabel(chargeDate);
}

function oneTimeStatusClass(chargeDate: string): string {
  const s = oneTimeStatus(chargeDate, referenceToday.value);
  if (s === "upcoming") return "upcoming";
  if (s === "active") return "active";
  return "ended";
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

async function removeSegment(seg: ConfiguredCharge, options: { skipConfirm?: boolean } = {}) {
  const label = `${formatIls(seg.amount)} (${monthRangeLabel(seg.from_month, seg.through_month)})`;
  if (!options.skipConfirm) {
    const ok = await confirm({
      title: t("Delete period?"),
      message: t("Remove this billing period — {label}?", { label }),
      confirmLabel: t("Delete period"),
      tone: "danger",
    });
    if (!ok) return;
  }
  if (editingCharge.value === seg) {
    editingCharge.value = null;
    chargeEditSnapshot.value = null;
  }
  const key = segmentKey(seg);
  charges.value = charges.value.filter((c) => segmentKey(c) !== key);
  await persistCharges();
}

async function removeCharge(id: string, options: { skipConfirm?: boolean } = {}) {
  const group = recurringGroups.value.find((g) => g.id === id);
  const label = group ? groupDisplayName(group) : "this bill";
  if (!options.skipConfirm) {
    const ok = await confirm({
      title: t("Remove bill?"),
      message: t("Remove {label} from recurring bills?", { label }),
      confirmLabel: t("Remove bill"),
      tone: "danger",
    });
    if (!ok) return;
  }
  if (group?.segments.some((s) => editingCharge.value === s)) {
    editingCharge.value = null;
    chargeEditSnapshot.value = null;
  }
  charges.value = charges.value.filter((c) => c.id !== id || isOneTimeCharge(c));
  await persistCharges();
}

async function removeOneTime(charge: ConfiguredCharge) {
  const ok = await confirm({
    title: t("Delete charge?"),
    message: t("Delete \"{name}\" ({amount})?", { name: tr(chargeDisplayName(charge)), amount: formatIls(charge.amount) }),
    confirmLabel: t("Delete"),
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
    status.value = t("Enter a name for the bill.");
    return;
  }
  if (!newRecurring.value.amount || newRecurring.value.amount <= 0) {
    status.value = t("Enter a positive amount.");
    return;
  }
  if (!newRecurringOngoing.value && newRecurring.value.from_month > newRecurring.value.through_month) {
    status.value = t("Start month must be on or before end month.");
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
    showSaveStatus(t("Added {name}", { name }));
  } else {
    status.value = t("Could not save — try again.");
  }
}

async function addOneTime() {
  status.value = "";
  const name = newOneTime.value.name_en.trim();
  if (!name) {
    status.value = t("Enter a name for the charge.");
    return;
  }
  if (!newOneTime.value.charge_date) {
    status.value = t("Pick a date.");
    return;
  }
  if (!newOneTime.value.amount || newOneTime.value.amount <= 0) {
    status.value = t("Enter a positive amount.");
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
    showSaveStatus(t("Added {name}", { name }));
  } else {
    status.value = t("Could not save — try again.");
  }
}

async function applyHouseholdBundle(bundle: HouseholdBundle) {
  charges.value = bundle.charges.map((c) => normalizeConfiguredCharge(c));
  livingBudgetSegments.value = bundle.living_budget.segments.map((s) => normalizeLivingBudgetSegment(s));
  livingBudgetMonthTopups.value = (bundle.living_budget.month_topups || []).map((t) =>
    normalizeLivingBudgetMonthTopup(t),
  );
  syncSavedSnapshots();
}

function applyHomeBundlePeek() {
  const cached = homeData.peek(auth.isDemo, auth.token || undefined);
  if (!cached) return false;
  charges.value = cached.fixed_charges.map((c) => normalizeConfiguredCharge(c));
  livingBudgetSegments.value = cached.living_budget.segments.map((s) => normalizeLivingBudgetSegment(s));
  livingBudgetMonthTopups.value = (cached.living_budget.month_topups || []).map((t) =>
    normalizeLivingBudgetMonthTopup(t),
  );
  syncSavedSnapshots();
  return true;
}

async function load(options: { background?: boolean; force?: boolean } = {}) {
  const demo = auth.isDemo;
  const token = auth.token || undefined;

  if (!options.force && !options.background) {
    const householdCached = householdData.peek(demo, token);
    if (householdCached) {
      await applyHouseholdBundle(householdCached);
      hydrated.value = true;
      loading.value = false;
      void load({ background: true });
      return;
    }
    if (applyHomeBundlePeek()) {
      hydrated.value = true;
      loading.value = false;
      void load({ background: true });
      return;
    }
  }

  if (!options.background) {
    loading.value = true;
    hydrated.value = false;
    error.value = "";
    status.value = "";
  }
  try {
    const bundle = await householdData.load(demo, token, options);
    await applyHouseholdBundle(bundle);
    error.value = "";
  } catch (e) {
    if (!options.background) {
      error.value = friendlyError(e);
      charges.value = [];
      livingBudgetSegments.value = [];
      livingBudgetMonthTopups.value = [];
      syncSavedSnapshots();
    }
  } finally {
    hydrated.value = true;
    if (!options.background) loading.value = false;
  }
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!budgetLocked.value && hasUnsavedChanges.value) {
    e.preventDefault();
  }
}

onBeforeRouteLeave(async () => {
  if (budgetLocked.value || !isDirty()) return true;
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
