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
        :reference-ym="referenceYm"
        :readonly="auth.isDemo"
        :disabled="saving"
        @save="persistCharges"
        @edit-recurring-charge="editRecurringCharge"
      />

      <section id="recurring" class="manual-section">
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

        <div v-if="visibleRecurringGroups.length" class="recurring-groups">
          <section v-for="group in visibleRecurringGroups" :key="group.id" class="recurring-card recurring-card--compact">
            <template v-if="singleVisibleSegment(group)">
              <div
                v-if="auth.isDemo || !isEditingCharge(singleVisibleSegment(group)!)"
                class="list-row recurring-card-single"
              >
                <div class="list-row__main">
                  <strong class="list-row__label">{{ groupDisplayName(group) }}</strong>
                  <span class="list-row__meta">{{ recurringSegmentMeta(group, singleVisibleSegment(group)!) }}</span>
                </div>
                <span
                  class="list-row__status recurring-status"
                  :class="'recurring-status-' + segmentStatus(singleVisibleSegment(group)!.from_month, singleVisibleSegment(group)!.through_month, referenceYm)"
                >
                  {{ statusLabel(singleVisibleSegment(group)!) }}
                </span>
                <button
                  v-if="!auth.isDemo"
                  type="button"
                  class="btn btn-edit"
                  :disabled="saving"
                  @click="startEditCharge(singleVisibleSegment(group)!)"
                >
                  Edit
                </button>
              </div>

              <EditPanel
                v-else
                title="Edit recurring bill"
                done-label="Save"
                :disabled="saving"
                deletable
                :delete-label="segmentDeleteLabel(group)"
                @done="finishEditCharge(singleVisibleSegment(group)!)"
                @cancel="cancelEditCharge(singleVisibleSegment(group)!)"
                @delete="deleteSegmentOrBill(group, singleVisibleSegment(group)!)"
              >
                <div class="recurring-segment-row">
                  <div class="field-group">
                    <label class="field-label">Amount (₪)</label>
                    <input
                      v-model.number="singleVisibleSegment(group)!.amount"
                      class="input"
                      type="number"
                      min="0"
                      step="0.01"
                      inputmode="decimal"
                    />
                  </div>
                  <div class="field-group">
                    <label class="field-label">From</label>
                    <MonthSelect v-model="singleVisibleSegment(group)!.from_month" />
                  </div>
                </div>
                <div class="field-group recurring-segment-through">
                  <label class="field-label">Through</label>
                  <MonthSelect
                    v-if="!isOngoingThrough(singleVisibleSegment(group)!.through_month)"
                    v-model="singleVisibleSegment(group)!.through_month"
                  />
                  <label class="recurring-ongoing recurring-ongoing--compact">
                    <ToggleSwitch
                      :model-value="isOngoingThrough(singleVisibleSegment(group)!.through_month)"
                      :disabled="saving"
                      @update:model-value="toggleOngoing(singleVisibleSegment(group)!, $event)"
                    />
                    <span class="recurring-ongoing-text">No end date</span>
                  </label>
                </div>
              </EditPanel>
            </template>

            <template v-else>
              <header class="recurring-card-header">
                <div>
                  <h3 class="recurring-card-title">{{ groupDisplayName(group) }}</h3>
                  <p class="recurring-card-sub">{{ group.category_en }}</p>
                </div>
                <div v-if="!auth.isDemo && isEditingGroup(group)" class="section-header-actions">
                  <IconButton icon="plus" label="Add period" :disabled="saving" @click="addSegment(group)" />
                </div>
              </header>

              <ul class="charge-compact-list">
                <li
                  v-for="(seg, segIndex) in visibleGroupSegments(group)"
                  :key="`${group.id}-${segIndex}`"
                  class="charge-compact-row-wrap"
                >
                  <div v-if="auth.isDemo || !isEditingCharge(seg)" class="list-row">
                    <div class="list-row__main">
                      <span class="list-row__amount">{{ formatIls(seg.amount) }}</span>
                      <span class="list-row__meta">{{ monthRangeLabel(seg.from_month, seg.through_month) }}</span>
                    </div>
                    <span
                      class="list-row__status recurring-status"
                      :class="'recurring-status-' + segmentStatus(seg.from_month, seg.through_month, referenceYm)"
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
            </template>

            <ul v-if="showEndedRecurring && endedGroupSegments(group).length" class="charge-compact-list household-ended-list">
              <li v-for="(seg, segIndex) in endedGroupSegments(group)" :key="`${group.id}-ended-${segIndex}`" class="charge-compact-row-wrap">
                <div v-if="auth.isDemo || !isEditingCharge(seg)" class="list-row">
                  <div class="list-row__main">
                    <span class="list-row__amount">{{ formatIls(seg.amount) }}</span>
                    <span class="list-row__meta">{{ monthRangeLabel(seg.from_month, seg.through_month) }}</span>
                  </div>
                  <span
                    class="list-row__status recurring-status"
                    :class="'recurring-status-' + segmentStatus(seg.from_month, seg.through_month, referenceYm)"
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

        <button
          v-if="endedRecurringCount"
          type="button"
          class="btn btn-ghost household-show-more"
          @click="showEndedRecurring = !showEndedRecurring"
        >
          {{ showEndedRecurring ? "Hide" : "Show" }} ended recurring periods ({{ endedRecurringCount }})
        </button>

        <p v-if="!recurringGroups.length" class="manual-empty">No recurring bills yet.</p>
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

        <div v-if="visibleOneTimeCharges.length" class="recurring-groups">
          <ul class="charge-compact-list">
            <li v-for="charge in visibleOneTimeCharges" :key="charge.id" class="charge-compact-row-wrap">
              <div v-if="auth.isDemo || !isEditingCharge(charge)" class="list-row">
                <div class="list-row__main">
                  <strong class="list-row__label">{{ chargeDisplayName(charge) }}</strong>
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

        <button
          v-if="pastOneTimeCharges.length"
          type="button"
          class="btn btn-ghost household-show-more"
          @click="showPastOneTime = !showPastOneTime"
        >
          {{ showPastOneTime ? "Hide" : "Show" }} past one-time charges ({{ pastOneTimeCharges.length }})
        </button>

        <ul v-if="showPastOneTime && pastOneTimeCharges.length" class="charge-compact-list household-ended-list">
          <li v-for="charge in pastOneTimeCharges" :key="`past-${charge.id}`" class="charge-compact-row-wrap">
            <div v-if="auth.isDemo || !isEditingCharge(charge)" class="list-row">
              <div class="list-row__main">
                <strong class="list-row__label">{{ chargeDisplayName(charge) }}</strong>
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

        <p v-if="!oneTimeCharges.length" class="manual-empty">No one-time charges yet.</p>
      </section>

      <ExcludedSection />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { saveFixedCharges, saveLivingBudget } from "@/shared/api/client";
import AppLoader from "@/shared/components/AppLoader.vue";
import CategorySelect from "@/shared/components/CategorySelect.vue";
import EditPanel from "@/shared/components/EditPanel.vue";
import ExcludedSection from "@/features/household/components/ExcludedSection.vue";
import IconButton from "@/shared/components/IconButton.vue";
import LivingBudgetSection from "@/features/household/components/LivingBudgetSection.vue";
import MonthSelect from "@/shared/components/MonthSelect.vue";
import ToggleSwitch from "@/shared/components/ToggleSwitch.vue";
import { SPENDING_CATEGORIES } from "@/shared/categories";
import { useAuthStore } from "@/shared/stores/auth";
import { invalidateHouseholdDataCaches } from "@/shared/stores/invalidateCaches";
import { useHomeDataStore } from "@/features/home/stores/homeData";
import { type HouseholdBundle, useHouseholdDataStore } from "@/shared/stores/viewData";
import { confirm } from "@/shared/composables/useConfirm";
import { referenceDate, yearMonthForDate } from "@/shared/utils/appDate";
import { formatIls } from "@/shared/utils/format";
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
  document.getElementById("recurring")?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (!charge || auth.isDemo) return;
  startEditCharge(charge);
}

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
    invalidateHouseholdDataCaches();
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
  const label =
    group.segments.length <= 1
      ? groupDisplayName(group)
      : `${formatIls(seg.amount)} (${monthRangeLabel(seg.from_month, seg.through_month)})`;
  const ok = await confirm({
    title: group.segments.length <= 1 ? "Remove bill?" : "Delete period?",
    message:
      group.segments.length <= 1
        ? `Remove ${label} from recurring bills?`
        : `Remove this billing period — ${label}?`,
    confirmLabel: group.segments.length <= 1 ? "Remove bill" : "Delete period",
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

function singleVisibleSegment(group: ChargeGroup): ConfiguredCharge | null {
  const visible = visibleGroupSegments(group);
  return visible.length === 1 ? visible[0]! : null;
}

function recurringSegmentMeta(group: ChargeGroup, seg: ConfiguredCharge): string {
  return `${group.category_en} · ${formatIls(seg.amount)} · ${monthRangeLabel(seg.from_month, seg.through_month)}`;
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
  if (s === "upcoming") return "Scheduled · " + dateToLabel(chargeDate);
  if (s === "active") return "Today";
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
      title: "Delete period?",
      message: `Remove this billing period — ${label}?`,
      confirmLabel: "Delete period",
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
      title: "Remove bill?",
      message: `Remove ${label} from recurring bills?`,
      confirmLabel: "Remove bill",
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
    title: "Delete charge?",
    message: `Delete "${chargeDisplayName(charge)}" (${formatIls(charge.amount)})?`,
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
      error.value = String(e);
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
