<template>
  <div>
    <DemoBanner />
    <header class="bx-page-head">
      <h2 class="page-title">{{ t("Money") }}</h2>
    </header>
    <div class="money-cols">
      <div class="money-col">
        <SavingsCard :payslips="payslips" :payslips-ready="payslipsReady" />
      </div>
      <div class="money-col">
        <button type="button" class="money-calc" @click="calcOpen = true">
          <span class="money-calc__icon" aria-hidden="true"><MoneyIcon name="calc" /></span>
          <span class="money-calc__text">
            <strong>{{ t("Salary calculator") }}</strong>
            <span>{{ t("Take-home pay, or the gross you need for a net amount") }}</span>
          </span>
          <span class="money-calc__chevron" aria-hidden="true">›</span>
        </button>
        <SalaryCalculator :open="calcOpen" @close="calcOpen = false" />
        <PayslipsSection @saved="showSaveStatus" @loaded="onLoaded" />
        <p v-if="saveStatus" class="recurring-save-status">{{ saveStatus }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useAuthStore } from "@/shared/stores/auth";
import DemoBanner from "@/shared/components/DemoBanner.vue";
import PayslipsSection from "@/features/household/components/PayslipsSection.vue";
import SavingsCard from "@/features/money/SavingsCard.vue";
import MoneyIcon from "@/features/money/MoneyIcon.vue";
import SalaryCalculator from "@/features/household/components/SalaryCalculator.vue";
import { t } from "@/shared/i18n";
import type { Payslip } from "@core/salary/payslip";

const auth = useAuthStore();
const calcOpen = ref(false);
const payslips = ref<Payslip[]>([]);
const loadedOnce = ref(false);
/** Payslips are the owner's alone: for anyone else there is nothing to wait for. */
const payslipsReady = computed(() => auth.isDemo || !auth.canEditBudget || loadedOnce.value);
function onLoaded(list: Payslip[]) {
  payslips.value = list;
  loadedOnce.value = true;
}
const saveStatus = ref("");
let timer: ReturnType<typeof setTimeout> | null = null;

function showSaveStatus(message: string) {
  saveStatus.value = message;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => (saveStatus.value = ""), 4000);
}
</script>

<style scoped>
.money-calc {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  width: 100%;
  min-height: 72px;
  padding: 0.8rem 1rem;
  border: 0;
  border-radius: 20px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.money-calc__icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
}
.money-calc__text {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 0.15rem;
}
.money-calc__text span {
  font-size: 0.82rem;
  color: var(--text-muted);
}
.money-calc__chevron {
  font-size: 1.4rem;
  color: var(--text-faint);
}
.money-cols,
.money-col {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.25rem;
  align-content: start;
}
@media (min-width: 1024px) {
  .money-cols {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 2rem;
    align-items: start;
  }
}
</style>
