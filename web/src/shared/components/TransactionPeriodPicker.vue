<template>
  <div class="pill-row tx-period-row">
    <button
      v-for="opt in TRANSACTION_PERIOD_OPTIONS"
      :key="opt.value"
      type="button"
      class="pill"
      :class="{ active: modelValue === opt.value }"
      @click="$emit('update:modelValue', opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import type { TransactionPeriod } from "@/shared/utils/transactionPeriod";
import { TRANSACTION_PERIOD_OPTIONS } from "@/shared/utils/transactionPeriod";

defineProps<{ modelValue: TransactionPeriod }>();
defineEmits<{ "update:modelValue": [TransactionPeriod] }>();
</script>
