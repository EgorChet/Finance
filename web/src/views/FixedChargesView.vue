<template>
  <div>
    <div v-if="auth.isDemo" class="demo-banner">
      Demo mode — recurring bills are read-only. Sign in to manage rent, loans, and other fixed charges.
    </div>
    <div class="recurring-header">
      <div>
        <h2 style="margin: 0 0 0.35rem">Recurring bills</h2>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin: 0">
          Rent, loans, and other monthly charges added to statement totals and pace. Set amount and date range per period — add a new segment when a payment changes or ends.
        </p>
      </div>
      <button
        v-if="!auth.isDemo"
        type="button"
        class="btn btn-primary"
        :disabled="saving || !dirty"
        @click="saveAll"
      >
        {{ saving ? "Saving…" : dirty ? "Save changes" : "Saved" }}
      </button>
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
            <div class="recurring-card-actions">
              <button
                v-if="!auth.isDemo"
                type="button"
                class="btn btn-ghost btn-compact"
                @click="addSegment(group)"
              >
                Add period
              </button>
              <button
                v-if="!auth.isDemo"
                type="button"
                class="btn btn-ghost btn-compact"
                @click="removeCharge(group.id)"
              >
                Remove
              </button>
            </div>
          </header>

          <div class="table-scroll">
            <table class="rules recurring-table">
              <thead>
                <tr>
                  <th>Amount</th>
                  <th>From</th>
                  <th>Through</th>
                  <th>Status</th>
                  <th v-if="!auth.isDemo"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="seg in group.segments" :key="segmentKey(seg)">
                  <td class="label-fix-amount">
                    <input
                      v-if="!auth.isDemo"
                      v-model.number="seg.amount"
                      class="input recurring-amount-input"
                      type="number"
                      min="0"
                      step="0.01"
                      @input="markDirty"
                    />
                    <span v-else>{{ formatIls(seg.amount) }}</span>
                  </td>
                  <td>
                    <input
                      v-if="!auth.isDemo"
                      v-model="seg.from_month"
                      class="input recurring-month-input"
                      type="month"
                      @input="markDirty"
                    />
                    <span v-else>{{ ymToLabel(seg.from_month) }}</span>
                  </td>
                  <td>
                    <div v-if="!auth.isDemo" class="recurring-through-cell">
                      <input
                        v-model="seg.through_month"
                        class="input recurring-month-input"
                        type="month"
                        :disabled="isOngoingThrough(seg.through_month)"
                        @input="markDirty"
                      />
                      <label class="recurring-ongoing">
                        <input
                          type="checkbox"
                          :checked="isOngoingThrough(seg.through_month)"
                          @change="toggleOngoing(seg, ($event.target as HTMLInputElement).checked)"
                        />
                        Ongoing
                      </label>
                    </div>
                    <span v-else>{{ throughLabel(seg.through_month) }}</span>
                  </td>
                  <td>
                    <span class="recurring-status" :class="'recurring-status-' + segmentStatus(seg.from_month, seg.through_month)">
                      {{ statusLabel(seg) }}
                    </span>
                  </td>
                  <td v-if="!auth.isDemo">
                    <button
                      type="button"
                      class="btn btn-ghost btn-compact"
                      @click="removeSegment(seg)"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="recurring-timeline">{{ timelineSummary(group) }}</p>
        </section>
      </div>

      <p v-else style="color: var(--text-muted); margin: 1rem 0">
        No recurring bills configured yet.
      </p>

      <section v-if="!auth.isDemo" class="recurring-add">
        <h3 style="margin: 0 0 0.75rem">Add recurring bill</h3>
        <div class="recurring-add-grid">
          <input v-model="newCharge.name_en" class="input" placeholder="Name (English)" />
          <input v-model="newCharge.name_he" class="input" placeholder="Name (Hebrew, optional)" />
          <input v-model="newCharge.category_en" class="input" list="recurring-cats" placeholder="Category" />
          <input v-model.number="newCharge.amount" class="input" type="number" min="0" step="0.01" placeholder="Amount ₪" />
          <input v-model="newCharge.from_month" class="input" type="month" />
          <div class="recurring-through-cell">
            <input
              v-model="newCharge.through_month"
              class="input"
              type="month"
              :disabled="newOngoing"
            />
            <label class="recurring-ongoing">
              <input v-model="newOngoing" type="checkbox" />
              Ongoing
            </label>
          </div>
          <button type="button" class="btn btn-primary" @click="addCharge">Add bill</button>
        </div>
        <datalist id="recurring-cats">
          <option v-for="c in categories" :key="c" :value="c" />
        </datalist>
      </section>

      <p v-if="status" style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0.75rem">{{ status }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { fetchFixedCharges, saveFixedCharges } from "../api/client";
import AppLoader from "../components/AppLoader.vue";
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
const dirty = ref(false);
const error = ref("");
const status = ref("");
const charges = ref<ConfiguredCharge[]>([]);
const savedSnapshot = ref("");

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

function markDirty() {
  dirty.value = snapshot(charges.value) !== savedSnapshot.value;
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
  markDirty();
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
  markDirty();
}

function removeSegment(seg: ConfiguredCharge) {
  const key = segmentKey(seg);
  charges.value = charges.value.filter((c) => segmentKey(c) !== key);
  markDirty();
}

function removeCharge(id: string) {
  charges.value = charges.value.filter((c) => c.id !== id);
  markDirty();
}

function uniqueId(base: string): string {
  let id = slugifyId(base);
  if (!charges.value.some((c) => c.id === id)) return id;
  let n = 2;
  while (charges.value.some((c) => c.id === `${id}-${n}`)) n += 1;
  return `${id}-${n}`;
}

function addCharge() {
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
  markDirty();
  status.value = "Bill added — click Save changes to apply.";
}

async function load() {
  loading.value = true;
  error.value = "";
  status.value = "";
  try {
    const data = await fetchFixedCharges(auth.isDemo, auth.token || undefined);
    charges.value = data.charges.map((c) => ({ ...c }));
    savedSnapshot.value = snapshot(charges.value);
    dirty.value = false;
  } catch (e) {
    error.value = String(e);
    charges.value = [];
  } finally {
    loading.value = false;
  }
}

async function saveAll() {
  if (auth.isDemo) return;
  saving.value = true;
  status.value = "";
  try {
    const payload = charges.value.map((c) => ({
      ...c,
      amount: Math.round(c.amount * 100) / 100,
    }));
    const data = await saveFixedCharges(payload, auth.token || undefined);
    charges.value = data.charges.map((c) => ({ ...c }));
    savedSnapshot.value = snapshot(charges.value);
    dirty.value = false;
    status.value = "Saved — Overview and pace will use the updated bills.";
  } catch (e) {
    status.value = String(e);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>
