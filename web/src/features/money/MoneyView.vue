<template>
  <div>
    <DemoBanner />
    <header class="bx-page-head">
      <h2 class="page-title">{{ t("Money") }}</h2>
    </header>
    <div class="money-cols">
      <div class="money-col">
        <SavingsCard :payslips="payslips" />
      </div>
      <div class="money-col">
        <PayslipsSection @saved="showSaveStatus" @loaded="payslips = $event" />
        <p v-if="saveStatus" class="recurring-save-status">{{ saveStatus }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import DemoBanner from "@/shared/components/DemoBanner.vue";
import PayslipsSection from "@/features/household/components/PayslipsSection.vue";
import SavingsCard from "@/features/money/SavingsCard.vue";
import { t } from "@/shared/i18n";
import type { Payslip } from "@core/salary/payslip";

const payslips = ref<Payslip[]>([]);
const saveStatus = ref("");
let timer: ReturnType<typeof setTimeout> | null = null;

function showSaveStatus(message: string) {
  saveStatus.value = message;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => (saveStatus.value = ""), 4000);
}
</script>

<style scoped>
.money-cols,
.money-col {
  display: grid;
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
