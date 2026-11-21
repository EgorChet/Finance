<template>
  <SheetEditor
    :open="open"
    :title="title"
    subtitle="Until your payslip is uploaded, this month's budget uses this number. The payslip replaces it by itself."
    save-label="Save"
    :deletable="!!current"
    delete-label="Remove my estimate"
    :busy="busy"
    :error="error"
    @save="save"
    @cancel="emit('close')"
    @delete="clear"
  >
    <SheetAmountInput v-model="amount" label="Salary after tax you expect" />
    <button v-if="suggestion && amount !== suggestion" type="button" class="btn btn-sm mes-use" @click="amount = suggestion">
      {{ t("Use {amount} (your last payslip)", { amount: formatIls(suggestion) }) }}
    </button>
    <p v-if="current && payslipNet" class="mes-note">
      {{ t("The payslip is already here: {amount}. It replaces any estimate.", { amount: formatIls(payslipNet) }) }}
    </p>
  </SheetEditor>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { dateTag, t } from "@/shared/i18n";
import SheetAmountInput from "@/shared/components/SheetAmountInput.vue";
import SheetEditor from "@/shared/components/SheetEditor.vue";
import { saveMonthEstimate } from "@/shared/api/client";
import { useAuthStore } from "@/shared/stores/auth";
import { formatIls } from "@/shared/utils/format";

const props = defineProps<{
  open: boolean;
  /** YYYY-MM */
  month: string;
  /** The last payslip's net, offered as the starting point. */
  suggestion?: number | null;
  /** The estimate already given for this month. */
  current?: number | null;
  /** The month's payslip net, when it exists. */
  payslipNet?: number | null;
}>();
const emit = defineEmits<{ close: []; saved: [string] }>();

const auth = useAuthStore();
const amount = ref(0);
const busy = ref(false);
const error = ref("");

watch(
  () => [props.open, props.month] as const,
  ([open]) => {
    if (!open) return;
    error.value = "";
    amount.value = props.current ?? props.suggestion ?? 0;
  },
  { immediate: true },
);

const title = computed(() => {
  const [y, m] = props.month.split("-").map(Number);
  const label = new Date(y || 2000, (m || 1) - 1, 1).toLocaleDateString(dateTag(), { month: "long" });
  return `${t("Expected budget")} · ${label}`;
});

async function persist(value: number | null, message: string) {
  busy.value = true;
  error.value = "";
  try {
    await saveMonthEstimate(props.month, value, auth.token || undefined);
    emit("saved", message);
    emit("close");
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

function save() {
  if (!(amount.value > 0)) {
    error.value = t("Enter the amount you expect.");
    return;
  }
  void persist(amount.value, t("Saved the expected budget"));
}

function clear() {
  void persist(null, t("Removed the expected budget"));
}
</script>

<style scoped>
.mes-use {
  justify-self: start;
  margin-top: 0.6rem;
}
.mes-note {
  margin: 0.6rem 0 0;
  font-size: 0.82rem;
  color: var(--text-muted);
}
</style>
