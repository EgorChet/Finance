<template>
  <section v-if="available" id="payslips" class="bx-section">
    <div class="bx-list-head">
      <h3>{{ t("Payslips") }}</h3>
      <button type="button" class="btn btn-sm" :disabled="uploading" @click="picker?.click()">
        {{ uploading ? t("Reading…") : "＋ " + t("Add payslip PDF") }}
      </button>
      <input ref="picker" type="file" accept="application/pdf,.pdf" class="ps-file" @change="onPick" />
    </div>
    <p class="bx-section-note">{{ t("Kept private: only you can open them. The original files are stored too.") }}</p>
    <p v-if="loadError" class="ps-error">{{ loadError }}</p>
    <p v-else-if="loaded && !payslips.length" class="bx-section-note">{{ t("No payslips yet") }}</p>

    <div v-if="payslips.length" class="bx-list">
      <button v-for="p in shown" :key="p.id" type="button" class="bx-row" @click="openId = p.id">
        <span class="tx-row-icon" aria-hidden="true">🧾</span>
        <span class="bx-row-body">
          <span class="bx-row-top">
            <span class="bx-row-name">{{ monthLabel(p) }}</span>
            <span class="bx-row-amount">{{ formatIlsWhole(p.totals.netPayable || p.totals.net) }}</span>
          </span>
          <span class="bx-row-meta">
            <span>{{ t("Total pay") }} {{ formatIlsWhole(p.totals.gross) }}</span>
          </span>
        </span>
        <span class="bx-chevron" aria-hidden="true">›</span>
      </button>
    </div>
    <button v-if="payslips.length > 6 && !showAll" type="button" class="btn btn-sm ps-more" @click="showAll = true">
      {{ t("Show all {n}", { n: payslips.length }) }}
    </button>

    <PayslipSheet
      :payslip="open"
      :busy="busy"
      @close="openId = null"
      @original="openOriginal"
      @remove="removeOpen"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { dateTag, t } from "@/shared/i18n";
import PayslipSheet from "@/features/household/components/PayslipSheet.vue";
import { deletePayslip, fetchPayslipPdf, fetchPayslips, uploadPayslipPdf } from "@/shared/api/client";
import { confirm } from "@/shared/composables/useConfirm";
import { useAuthStore } from "@/shared/stores/auth";
import { formatIlsWhole } from "@/shared/utils/format";
import type { Payslip } from "@core/salary/payslip";

const emit = defineEmits<{ saved: [string] }>();
const auth = useAuthStore();

const payslips = ref<Payslip[]>([]);
const loaded = ref(false);
const loadError = ref("");
const uploading = ref(false);
const busy = ref(false);
const openId = ref<string | null>(null);
const showAll = ref(false);
const picker = ref<HTMLInputElement | null>(null);

/** Payslips are Egor's alone; the demo has none. */
const available = computed(() => !auth.isDemo && auth.canEditBudget);
const open = computed(() => payslips.value.find((p) => p.id === openId.value) ?? null);
const shown = computed(() => (showAll.value ? payslips.value : payslips.value.slice(0, 6)));

function monthLabel(p: Payslip): string {
  const label = new Date(p.year, p.month - 1, 1).toLocaleDateString(dateTag(), { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

async function load() {
  loadError.value = "";
  try {
    payslips.value = (await fetchPayslips(auth.token || undefined)).payslips;
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e);
  } finally {
    loaded.value = true;
  }
}

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
    await load();
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
    await load();
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
.ps-file {
  display: none;
}
.ps-error {
  margin: 0;
  color: var(--danger);
}
.ps-more {
  margin-top: 0.5rem;
}
</style>
