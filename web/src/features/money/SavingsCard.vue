<template>
  <section v-if="card" class="sv bx-section">
    <p class="sv-label">{{ t("Savings in total") }}</p>
    <p class="sv-big">{{ formatIlsWhole(card.totalIls) }}</p>
    <p v-if="card.partial" class="sv-sub">{{ t("Without crypto and stocks: no dollar rate yet") }}</p>

    <ul class="sv-rows">
      <li v-if="card.funds.total > 0" class="sv-row">
        <span>{{ t("Pension, pitzuim and study fund") }}</span>
        <strong>{{ formatIlsWhole(card.funds.total) }}</strong>
      </li>
      <li v-if="card.crypto" class="sv-row">
        <span>{{ t("Crypto (Kaspa)") }}</span>
        <strong>{{ formatIlsWhole(card.crypto.ils) }} <small>({{ formatUsd(card.crypto.usd, 0) }})</small></strong>
      </li>
      <li v-if="card.stocks" class="sv-row">
        <span>{{ t("Stocks (FXCN)") }}</span>
        <strong>{{ formatIlsWhole(card.stocks.ils) }} <small>({{ formatUsd(card.stocks.usd, 0) }})</small></strong>
      </li>
    </ul>

    <template v-if="card.funds.total > 0">
      <h4 class="sv-h">{{ t("Funds in detail") }}</h4>
      <p class="sv-sub">
        {{ t("From {n} payslips, since {month}", { n: card.funds.months, month: card.since }) }}
        <template v-if="card.yearTotal > 0"> · {{ t("This year") }} {{ formatIlsWhole(card.yearTotal) }}</template>
      </p>
      <table class="sv-table">
        <thead>
          <tr><th /><th>{{ t("You") }}</th><th>{{ t("Employer") }}</th><th>{{ t("Total") }}</th></tr>
        </thead>
        <tbody>
          <tr>
            <th>{{ t("Pension") }}</th>
            <td>{{ formatIlsWhole(card.funds.pensionEmployee) }}</td>
            <td>{{ formatIlsWhole(card.funds.pensionEmployer) }}</td>
            <td class="sv-sum">{{ formatIlsWhole(card.funds.pensionEmployee + card.funds.pensionEmployer) }}</td>
          </tr>
          <tr>
            <th>{{ t("Pitzuim") }}</th>
            <td>—</td>
            <td>{{ formatIlsWhole(card.funds.severance) }}</td>
            <td class="sv-sum">{{ formatIlsWhole(card.funds.severance) }}</td>
          </tr>
          <tr>
            <th>{{ t("Study fund") }}</th>
            <td>{{ formatIlsWhole(card.funds.studyFundEmployee) }}</td>
            <td>{{ formatIlsWhole(card.funds.studyFundEmployer) }}</td>
            <td class="sv-sum">{{ formatIlsWhole(card.funds.studyFundEmployee + card.funds.studyFundEmployer) }}</td>
          </tr>
        </tbody>
      </table>
    </template>

    <InfoTip label="What this is" :text="t('Funds are the sum of contributions from the payslips on file, not the account balance: returns, fees and money saved before the first payslip are not included. Crypto and stocks are valued at today\'s price and dollar rate.')" />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { dateTag, t } from "@/shared/i18n";
import InfoTip from "@/shared/components/InfoTip.vue";
import { usePortfolioStore } from "@/shared/stores/portfolio";
import { formatIlsWhole, formatUsd } from "@/shared/utils/format";
import { savingsFromPayslips, type Payslip } from "@core/salary/payslip";

const props = defineProps<{ payslips: Payslip[] }>();
const { kaspaQuote, fxcnQuote, marketSnapshot } = storeToRefs(usePortfolioStore());

/** The dollar rate straight from the public rates service, for when the app's own snapshot has none. */
const fallbackRate = ref(0);
onMounted(() => {
  setTimeout(async () => {
    if ((marketSnapshot.value?.usd_ils ?? 0) > 0) return;
    try {
      const res = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=ILS");
      const rate = ((await res.json()) as { rates?: { ILS?: number } }).rates?.ILS;
      if (typeof rate === "number" && rate > 0) fallbackRate.value = rate;
    } catch {
      /* no rate: the card says so */
    }
  }, 2000);
});

/** "since" needs the genitive in Russian ("с января 2025"), so take the month from a full date and drop the day. */
const monthLabel = (p: Payslip) => {
  const tag = dateTag();
  const d = new Date(p.year, p.month - 1, 1);
  if (!tag.startsWith("ru")) return d.toLocaleDateString(tag, { month: "long", year: "numeric" }).toLowerCase();
  return d.toLocaleDateString(tag, { day: "numeric", month: "long", year: "numeric" }).replace(/^\d+\s*/, "").replace(/\s*г\.$/, "");
};

/** Funds from the payslips plus the crypto and stocks the app already tracks, all in ₪ at today's dollar rate. */
const card = computed(() => {
  const list = props.payslips;
  const funds = savingsFromPayslips(list);
  const rate = marketSnapshot.value?.usd_ils || fallbackRate.value;
  const haveRate = typeof rate === "number" && rate > 0;
  const kasUsd = kaspaQuote.value?.portfolio_usdt ?? 0;
  const fxcnUsd = fxcnQuote.value?.portfolio_usd ?? 0;
  const crypto = kasUsd > 0 && haveRate ? { usd: kasUsd, ils: kasUsd * rate } : null;
  const stocks = fxcnUsd > 0 && haveRate ? { usd: fxcnUsd, ils: fxcnUsd * rate } : null;
  const partial = !haveRate && (kasUsd > 0 || fxcnUsd > 0);
  if (funds.total <= 0 && !crypto && !stocks) return null;

  const newest = list.reduce((y, p) => Math.max(y, p.year), 0);
  const oldest = list.length ? list.reduce((a, b) => (b.year * 12 + b.month < a.year * 12 + a.month ? b : a)) : null;
  return {
    funds,
    crypto,
    stocks,
    partial,
    totalIls: funds.total + (crypto?.ils ?? 0) + (stocks?.ils ?? 0),
    yearTotal: savingsFromPayslips(list.filter((p) => p.year === newest)).total,
    since: oldest ? monthLabel(oldest) : "",
  };
});
</script>

<style scoped>
.sv {
  display: grid;
  min-width: 0;
  box-sizing: border-box;
  gap: 0.2rem;
  padding: 1.1rem 1.2rem;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--surface);
}
.sv-label {
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-muted);
}
.sv-big {
  margin: 0;
  font-size: 2.2rem;
  font-weight: 750;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.sv-sub {
  margin: 0 0 0.5rem;
  font-size: 0.82rem;
  color: var(--text-faint);
}
.sv-rows {
  list-style: none;
  margin: 0.4rem 0 0;
  padding: 0;
}
.sv-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.75rem;
  padding: 0.65rem 0;
  border-top: 1px solid var(--border);
}
.sv-row strong {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.sv-row small {
  font-weight: 500;
  color: var(--text-faint);
}
.sv-h {
  margin: 1rem 0 0;
  font-size: 0.95rem;
}
.sv-table {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}
.sv-table th,
.sv-table td {
  padding: 0.5rem 0;
  border-top: 1px solid var(--border);
  text-align: right;
  font-size: 0.88rem;
}
.sv-table thead th {
  border-top: 0;
  padding-top: 0;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-faint);
}
.sv-table th + th,
.sv-table td {
  padding-left: 0.4rem;
}
.sv-table tbody th {
  text-align: left;
  font-weight: 500;
}
.sv-table td {
  font-weight: 500;
}
.sv-table td.sv-sum {
  font-weight: 700;
}
</style>
