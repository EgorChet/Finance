<template>
  <section v-if="available" id="payslips" class="bx-section">
    <div class="bx-list-head">
      <h3>{{ t("Payslips") }}</h3>
      <button type="button" class="btn btn-sm" :disabled="uploading" @click="picker?.click()">
        {{ uploading ? t("Reading…") : "＋ " + t("Add payslip PDF") }}
      </button>
      <input ref="picker" type="file" accept="application/pdf,.pdf" class="ps-file" @change="onPick" />
    </div>
    <InfoTip label="Who can see this" :text="t('Kept private: only you can open them. The original files are stored too.')" />
    <AppLoader v-if="!loaded" variant="list" :rows="3" title="Loading payslips" />
    <p v-else-if="loadError" class="ps-error">{{ loadError }}</p>
    <p v-else-if="loaded && !payslips.length" class="bx-section-note">{{ t("No payslips yet") }}</p>

    <details v-for="g in groups" :key="g.year" class="ps-year" :open="g.year === newestYear">
      <summary class="ps-year__head">
        <span class="ps-year__name">{{ g.year }}</span>
        <span class="ps-year__meta">{{ t("{n} {n|payslip|payslips}", { n: g.items.length }) }} · {{ t("Take-home") }} {{ formatIlsWhole(g.net) }}</span>
      </summary>
      <div class="bx-list">
        <button v-for="p in shown(g)" :key="p.id" type="button" class="bx-row" @click="openId = p.id">
            <span class="ps-icon" aria-hidden="true"><MoneyIcon name="receipt" /></span>
            <span class="bx-row-body">
              <span class="bx-row-top">
                <span class="bx-row-name">{{ monthLabel(p) }}</span>
                <span class="bx-row-amount">{{ formatIlsWhole(p.totals.netPayable || p.totals.net) }}</span>
              </span>
              <span class="bx-row-meta">
                <span class="ps-sub">{{ t("Total pay") }} {{ formatIlsWhole(p.totals.gross) }}<template v-if="extrasOf(p)"> · {{ extrasOf(p) }}</template></span>
                <span
                  v-if="changeOf(p)"
                  :class="changeOf(p)! > 0 ? 'ps-change--up' : 'ps-change--down'"
                  :title="t('{delta} vs previous month', { delta: signed(changeOf(p)!) })"
                  :aria-label="t('{delta} vs previous month', { delta: signed(changeOf(p)!) })"
                >{{ signed(changeOf(p)!) }}</span>
              </span>
            </span>
            <span class="bx-chevron" aria-hidden="true">›</span>
          </button>
        <button v-if="g.items.length > SHOWN" type="button" class="bx-row bx-row--more" @click="toggleYear(g.year)">
          {{ expanded.has(g.year) ? t("Show fewer") : t("Show all {n}", { n: g.items.length }) }}
        </button>
      </div>
    </details>

    <PayslipSheet
      :payslip="open"
      :busy="busy"
      @close="openId = null"
      @original="openOriginal"
      @translated="openTranslated"
      @remove="removeOpen"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { dateTag, locale, t } from "@/shared/i18n";
import InfoTip from "@/shared/components/InfoTip.vue";
import MoneyIcon from "@/features/money/MoneyIcon.vue";
import AppLoader from "@/shared/components/AppLoader.vue";
import PayslipSheet from "@/features/household/components/PayslipSheet.vue";
import { deletePayslip, fetchPayslipPdf, uploadPayslipPdf } from "@/shared/api/client";
import { usePayslipsDataStore } from "@/features/money/stores/payslipsData";
import { confirm } from "@/shared/composables/useConfirm";
import { useAuthStore } from "@/shared/stores/auth";
import { formatIlsWhole } from "@/shared/utils/format";
import { paymentKindLabel, type PaymentKind, type Payslip } from "@core/salary/payslip";
import { openPayslipPrint } from "@/features/household/utils/payslipPrint";

const emit = defineEmits<{ saved: [string]; loaded: [Payslip[]] }>();
const auth = useAuthStore();
const store = usePayslipsDataStore();

const payslips = ref<Payslip[]>([]);
const loaded = ref(false);
const loadError = ref("");
const uploading = ref(false);
const busy = ref(false);
const openId = ref<string | null>(null);
const picker = ref<HTMLInputElement | null>(null);
/** A year shows its latest months; the rest sit behind "Show all". */
const SHOWN = 6;
const expanded = ref(new Set<number>());
const shown = (g: { year: number; items: Payslip[] }) => (expanded.value.has(g.year) ? g.items : g.items.slice(0, SHOWN));
function toggleYear(year: number) {
  const next = new Set(expanded.value);
  if (!next.delete(year)) next.add(year);
  expanded.value = next;
}

/** Payslips are Egor's alone; the demo has none. */
const available = computed(() => !auth.isDemo && auth.canEditBudget);
const open = computed(() => payslips.value.find((p) => p.id === openId.value) ?? null);
const newestYear = computed(() => payslips.value.reduce((y, p) => Math.max(y, p.year), 0));
/** Payslips by year, newest first; only the latest year is open so the list stays short. */
const groups = computed(() => {
  const byYear = new Map<number, Payslip[]>();
  for (const p of payslips.value) byYear.set(p.year, [...(byYear.get(p.year) ?? []), p]);
  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, items]) => ({
      year,
      items: items.sort((a, b) => b.month - a.month),
      net: items.reduce((sum, p) => sum + netOf(p), 0),
    }));
});

function monthLabel(p: Payslip): string {
  const label = new Date(p.year, p.month - 1, 1).toLocaleDateString(dateTag(), { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const netOf = (p: Payslip) => p.totals.netPayable || p.totals.net;

/** Take-home change against the month right before it; nothing when that month has no payslip. */
function changeOf(p: Payslip): number | null {
  const prevId = p.month === 1 ? `${p.year - 1}-12` : `${p.year}-${String(p.month - 1).padStart(2, "0")}`;
  const prev = payslips.value.find((x) => x.id === prevId);
  if (!prev) return null;
  const d = Math.round(netOf(p) - netOf(prev));
  return d === 0 ? null : d;
}

function signed(n: number): string {
  return (n > 0 ? "+" : "−") + formatIlsWhole(Math.abs(n));
}

/** One-off payments that explain an unusual month (bonus, vacation pay-out…). */
const EXTRA_KINDS: PaymentKind[] = ["bonus", "vacation", "recuperation", "holidays", "sick", "reserve", "overtime", "election_day"];
function extrasOf(p: Payslip): string {
  const lang = locale.value === "en" ? "en" : "ru";
  const kinds = [...new Set(p.payments.filter((x) => !x.benefit && x.amount > 0 && EXTRA_KINDS.includes(x.kind)).map((x) => x.kind))];
  return kinds.map((k) => paymentKindLabel(k, lang)).join(", ");
}

/** The Russian page with the Hebrew in brackets; the print dialog saves it as PDF. */
function openTranslated() {
  const p = open.value;
  if (!p) return;
  if (!openPayslipPrint(p)) emit("saved", t("Allow pop-ups to download the payslip"));
}

/** Cached payslips show at once; a fresh copy is fetched behind them and swapped in when it arrives. */
async function load(force = false) {
  loadError.value = "";
  try {
    const res = await store.load(auth.isDemo, auth.token || undefined, force ? { force: true } : {});
    payslips.value = res.payslips;
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loaded.value = true;
    emit("loaded", payslips.value);
  }
}
watch(
  () => store.data,
  (d) => {
    if (d) payslips.value = d.payslips;
  },
);
watch(payslips, (list) => emit("loaded", list));

async function onPick(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = "";
  if (!files.length) return;
  uploading.value = true;
  let added = 0;
  let refused = 0;
  try {
    for (const file of files) {
      const result = await uploadPayslipPdf(file, auth.token || undefined);
      added += result.imported.length;
      refused += result.rejected.length;
    }
    await load(true);
    if (added) emit("saved", t("Added {n} {n|payslip|payslips}", { n: added }));
    if (refused) emit("saved", t("{n} {n|page was|pages were} not added: not a payslip, or the numbers didn't add up", { n: refused }));
    if (!added && !refused) emit("saved", t("Nothing to add"));
  } catch (err) {
    emit("saved", err instanceof Error ? err.message : String(err));
  } finally {
    uploading.value = false;
  }
}

/** The original is fetched with the login, so it opens as a local file in a new tab. */
async function openOriginal() {
  const p = open.value;
  if (!p) return;
  busy.value = true;
  try {
    const { blob, page } = await fetchPayslipPdf(p.id, auth.token || undefined);
    const url = URL.createObjectURL(blob);
    window.open(`${url}#page=${page}`, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    emit("saved", e instanceof Error ? e.message : String(e));
  } finally {
    busy.value = false;
  }
}

async function removeOpen() {
  const p = open.value;
  if (!p) return;
  const ok = await confirm({
    title: t("Remove payslip"),
    message: t("Remove the payslip for {month}? Its data is deleted; the original file too if no other payslip uses it.", { month: monthLabel(p) }),
    confirmLabel: t("Remove payslip"),
    tone: "danger",
  });
  if (!ok) return;
  busy.value = true;
  try {
    await deletePayslip(p.id, auth.token || undefined);
    openId.value = null;
    await load(true);
  } catch (e) {
    emit("saved", e instanceof Error ? e.message : String(e));
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  if (available.value) void load();
});
</script>

<style scoped>
.ps-icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
}
.ps-year {
  margin: 0 0 0.6rem;
}
.ps-year__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 40px;
  padding: 0.35rem 0.2rem;
  cursor: pointer;
  list-style: none;
}
.ps-year__head::-webkit-details-marker {
  display: none;
}
.ps-year__head::after {
  content: "›";
  order: 3;
  font-size: 1.2rem;
  color: var(--text-muted);
  transition: transform 0.15s;
}
.ps-year[open] > .ps-year__head::after {
  transform: rotate(90deg);
}
.ps-year__name {
  font-weight: 700;
}
.ps-year__meta {
  margin-left: auto;
  font-size: 0.82rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.ps-file {
  display: none;
}
.ps-error {
  margin: 0;
  color: var(--danger);
}
.ps-sub {
  min-width: 0;
}
.ps-change--up {
  color: var(--success);
}
.ps-change--down {
  color: var(--danger);
}
</style>
