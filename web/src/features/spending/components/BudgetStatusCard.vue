<template>
  <div class="metric-card metric-card-budget budget-status" :class="`budget-status--${status.tone}`">
    <div class="budget-status__head">
      <span class="budget-status__chip">
        <span class="budget-status__dot" aria-hidden="true" />
        {{ status.title }}
      </span>
      <span class="budget-status__day">Day {{ status.dayIndex }} of {{ status.cycleLength }}</span>
    </div>

    <div class="budget-status__main">
      <div class="metric-label">{{ status.everydayLeft > 0 ? "You can spend" : "Everyday budget" }}</div>
      <div class="metric-value">
        <template v-if="status.everydayLeft > 0">
          {{ ils(status.allowanceToday) }}<span class="budget-status__unit"> a day</span>
        </template>
        <template v-else>{{ status.everydayLeft < 0 ? `${ils(-status.everydayLeft)} over` : "Used up" }}</template>
      </div>
      <div class="budget-status__sub">
        <template v-if="status.everydayLeft > 0">
          for the next {{ status.daysLeft }} {{ status.daysLeft === 1 ? "day" : "days" }} · plan {{ ils(status.plannedDaily) }} a day
        </template>
        <template v-else>{{ status.daysLeft }} {{ status.daysLeft === 1 ? "day" : "days" }} left in the cycle</template>
      </div>
    </div>

    <div
      class="budget-status__bar"
      role="progressbar"
      :aria-valuenow="status.usedPct"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="`${status.usedPct}% of the everyday budget used, plan says ${status.planPct}% by today`"
    >
      <span class="budget-status__fill" :style="{ width: `${status.usedPct}%` }" />
      <span class="budget-status__plan" :style="{ left: `${status.planPct}%` }" title="Where the plan says you should be today" />
    </div>
    <div class="budget-status__scale">
      <span>{{ ils(status.everydaySpent) }} spent</span>
      <span>{{ status.everydayLeft >= 0 ? `${ils(status.everydayLeft)} left` : "nothing left" }} of {{ ils(status.everydayBudget) }}</span>
    </div>

    <p class="budget-status__msg">{{ status.message }}</p>

    <details class="budget-status__how">
      <summary>How this is worked out</summary>
      <table class="budget-status__table">
        <tbody>
          <tr>
            <td>Living budget</td>
            <td>{{ ils(status.livingBudget) }}</td>
          </tr>
          <tr v-for="bill in status.bills" :key="bill.kind" class="budget-status__bill">
            <td>
              − {{ bill.label }}
              <span class="budget-status__tag">{{ bill.charged ? "charged" : "set aside" }}</span>
            </td>
            <td>{{ ils(bill.amount) }}</td>
          </tr>
          <tr class="budget-status__total">
            <td>= Everyday budget</td>
            <td>{{ ils(status.everydayBudget) }}</td>
          </tr>
          <tr>
            <td>÷ {{ status.cycleLength }} days = plan</td>
            <td>{{ ils(status.plannedDaily) }} a day</td>
          </tr>
          <tr class="budget-status__gap-row">
            <td>Plan up to yesterday</td>
            <td>{{ ils(status.planToDate) }}</td>
          </tr>
          <tr>
            <td>
              <button v-if="everydayClickable" type="button" class="budget-status__link" @click="$emit('everyday')">
                Spent so far ›
              </button>
              <span v-else>Spent so far</span>
            </td>
            <td>{{ ils(status.everydaySpent) }}</td>
          </tr>
          <tr class="budget-status__total" :class="status.aheadOfPlan > 0 ? 'is-over' : 'is-under'">
            <td>{{ status.aheadOfPlan > 0 ? "More than plan" : "Under plan" }}</td>
            <td>{{ ils(Math.abs(status.aheadOfPlan)) }}</td>
          </tr>
        </tbody>
      </table>
      <p class="budget-status__note">
        Bills not charged yet are set aside at last cycle's amount, so the daily number doesn't drop when they post.
        Green: on plan. Yellow: a bit ahead of plan, easy to catch up. Red: more than 3 days' worth ahead and the
        daily amount down by over 25%, or over budget.
      </p>
    </details>

    <div v-if="periodLabel" class="metric-budget-footer">
      <div class="metric-budget-footer__period">Budget period: {{ periodLabel }}</div>
      <RouterLink class="metric-budget-edit-link" to="/app/household#living-budget">Edit budget</RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BudgetStatus } from "@/features/spending/utils/budgetStatus";

defineProps<{
  status: BudgetStatus;
  periodLabel?: string | null;
  everydayClickable?: boolean;
}>();

defineEmits<{ everyday: [] }>();

function ils(n: number): string {
  return `₪${Math.round(n).toLocaleString("en-US")}`;
}
</script>
