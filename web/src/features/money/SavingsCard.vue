<template>
  <section class="sv">
    <!-- Nothing is shown until every part has answered: a half-counted total is a wrong total. -->
    <AppLoader v-if="!settled" variant="card" title="Counting your savings" />

    <template v-else-if="card">
      <article class="sv-hero">
        <p class="sv-label">{{ t("Savings in total") }}</p>
        <p class="sv-big">{{ formatIlsWhole(card.totalIls) }}</p>
        <p v-if="card.yearTotal > 0" class="sv-chip">{{ t("This year") }} +{{ formatIlsWhole(card.yearTotal) }}</p>
        <p v-if="card.fundsNote" class="sv-sub">{{ card.fundsNote }}</p>
        <p v-if="card.partial" class="sv-sub">{{ t("Without crypto and stocks: no dollar rate yet") }}</p>

        <div class="sv-bar" role="img" :aria-label="t('Savings in total')">
          <span v-for="r in card.rows" :key="r.key" :style="{ flexGrow: r.ils, background: r.color }" />
        </div>
      </article>

      <ul class="sv-rows">
        <li v-for="r in card.rows" :key="r.key" class="sv-row">
          <span class="sv-icon" :style="{ '--c': r.color }">
            <img v-if="r.logo" :src="r.logo" alt="" width="26" height="26" />
            <MoneyIcon v-else :name="r.icon!" />
          </span>
          <span class="sv-body">
            <span class="sv-top">
              <span class="sv-name">{{ r.label }}</span>
              <strong class="sv-amount">{{ formatIlsWhole(r.ils) }}</strong>
            </span>
            <span class="sv-meta">
              <span>{{ r.sub }}</span>
              <span class="sv-end">
                <span v-if="r.change != null" class="sv-change" :class="r.change < 0 ? 'is-down' : 'is-up'">{{ changeLabel(r.change) }}</span>
                <span class="sv-pct">{{ r.pct }}%</span>
              </span>
            </span>
          </span>
        </li>
      </ul>

      <InfoTip label="What this is" :text="t('Funds are the sum of contributions from the payslips on file, not the account balance: returns, fees and money saved before the first payslip are not included. Crypto and stocks are valued at today\'s price and dollar rate. The crypto change is the price change since 1 January, not your own return.')" />
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useAuthStore } from "@/shared/stores/auth";
import { storeToRefs } from "pinia";
import { dateTag, t } from "@/shared/i18n";
import AppLoader from "@/shared/components/AppLoader.vue";
import InfoTip from "@/shared/components/InfoTip.vue";
import MoneyIcon from "@/features/money/MoneyIcon.vue";
import kaspaLogo from "@/assets/kaspa.png";
import { usePortfolioStore } from "@/shared/stores/portfolio";
import { formatIlsWhole, formatUsd } from "@/shared/utils/format";
import { savingsFromPayslips, type Payslip } from "@core/salary/payslip";

const props = defineProps<{ payslips: Payslip[]; payslipsReady: boolean }>();
const portfolio = usePortfolioStore();
const { kaspaQuote, fxcnQuote, marketSnapshot, ready: quotesReady } = storeToRefs(portfolio);

/** The dollar rate straight from the public rates service, for when the app's own snapshot has none. */
const fallbackRate = ref(0);
const rateChecked = ref(false);
watch(
  quotesReady,
  async (ready) => {
    if (!ready || (marketSnapshot.value?.usd_ils ?? 0) > 0) {
      if (ready) rateChecked.value = true;
      return;
    }
    try {
      const res = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=ILS");
      const rate = ((await res.json()) as { rates?: { ILS?: number } }).rates?.ILS;
      if (typeof rate === "number" && rate > 0) fallbackRate.value = rate;
    } catch {
      /* no rate: the card says so */
    } finally {
      rateChecked.value = true;
    }
  },
  { immediate: true },
);

/** A quote that failed earlier (a sleeping server) is asked for again before the card shows its total. */
const auth = useAuthStore();
const retrying = ref(false);
onMounted(async () => {
  if (!quotesReady.value || (kaspaQuote.value && fxcnQuote.value && marketSnapshot.value)) return;
  retrying.value = true;
  try {
    await portfolio.refresh(auth.isDemo, auth.token || undefined, true);
  } finally {
    retrying.value = false;
  }
});

const settled = computed(() => props.payslipsReady && quotesReady.value && rateChecked.value && !retrying.value);

/** "since" needs the genitive in Russian ("с января 2025"), so take the month from a full date and drop the day. */
const monthLabel = (p: Payslip) => {
  const tag = dateTag();
  const d = new Date(p.year, p.month - 1, 1);
  if (!tag.startsWith("ru")) return d.toLocaleDateString(tag, { month: "long", year: "numeric" }).toLowerCase();
  return d.toLocaleDateString(tag, { day: "numeric", month: "long", year: "numeric" }).replace(/^\d+\s*/, "").replace(/\s*г\.$/, "");
};

interface Row {
  key: string;
  label: string;
  sub: string;
  ils: number;
  pct: number;
  color: string;
  icon?: "pension" | "pitzuim" | "study" | "stocks";
  logo?: string;
  /** Price change since 1 January, in percent. Only where the app knows the starting price. */
  change?: number;
}

/** "+12,5% с нач. года" / "−40,4% с нач. года" */
const changeLabel = (pct: number) =>
  `${pct < 0 ? "−" : "+"}${Math.abs(pct).toLocaleString(dateTag(), { maximumFractionDigits: 1 })}% ${t("YTD").toLowerCase()}`;

const card = computed(() => {
  const list = props.payslips;
  const f = savingsFromPayslips(list);
  const rate = marketSnapshot.value?.usd_ils || fallbackRate.value;
  const kasUsd = kaspaQuote.value?.portfolio_usdt ?? 0;
  const fxcnUsd = fxcnQuote.value?.portfolio_usd ?? 0;
  const partial = !(rate > 0) && (kasUsd > 0 || fxcnUsd > 0);
  const newest = list.reduce((y, p) => Math.max(y, p.year), 0);
  const oldest = list.length ? list.reduce((a, b) => (b.year * 12 + b.month < a.year * 12 + a.month ? b : a)) : null;
  const fundsNote = oldest && list.length ? t("From {n} payslips, since {month}", { n: list.length, month: monthLabel(oldest) }) : "";

  const rows: Omit<Row, "pct">[] = [];
  const pension = f.pensionEmployee + f.pensionEmployer;
  if (pension > 0) {
    rows.push({ key: "pension", label: t("Pension"), ils: pension, color: "#8b7cff", icon: "pension",
      sub: `${t("You")} ${formatIlsWhole(f.pensionEmployee)} · ${t("Employer")} ${formatIlsWhole(f.pensionEmployer)}` });
  }
  if (f.severance > 0) {
    rows.push({ key: "pitzuim", label: t("Pitzuim"), ils: f.severance, color: "#2dd4bf", icon: "pitzuim",
      sub: t("Employer") });
  }
  const study = f.studyFundEmployee + f.studyFundEmployer;
  if (study > 0) {
    rows.push({ key: "study", label: t("Study fund"), ils: study, color: "#fbbf24", icon: "study",
      sub: `${t("You")} ${formatIlsWhole(f.studyFundEmployee)} · ${t("Employer")} ${formatIlsWhole(f.studyFundEmployer)}` });
  }
  if (kasUsd > 0 && rate > 0) {
    rows.push({ key: "kaspa", label: t("Crypto (Kaspa)"), ils: kasUsd * rate, color: "#49eacb", logo: kaspaLogo, sub: formatUsd(kasUsd, 0),
      change: kaspaQuote.value?.year_change_pct });
  }
  if (fxcnUsd > 0 && rate > 0) {
    rows.push({ key: "fxcn", label: t("Stocks (FXCN)"), ils: fxcnUsd * rate, color: "#4fc3ff", icon: "stocks", sub: formatUsd(fxcnUsd, 0) });
  }
  const totalIls = rows.reduce((s, r) => s + r.ils, 0);
  if (totalIls <= 0) return null;
  return {
    partial,
    fundsNote,
    totalIls,
    yearTotal: savingsFromPayslips(list.filter((p) => p.year === newest)).total,
    rows: rows.map((r) => ({ ...r, pct: Math.round((r.ils / totalIls) * 100) })) as Row[],
  };
});
</script>

<style scoped>
.sv {
  display: grid;
  gap: 0.9rem;
  min-width: 0;
}
.sv-hero {
  padding: 1.2rem 1.2rem 1.1rem;
  border-radius: 24px;
  background: var(--hero-neutral);
}
.sv-label {
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-muted);
}
.sv-big {
  margin: 0.15rem 0 0.4rem;
  font-size: 2.4rem;
  font-weight: 750;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}
.sv-chip {
  display: inline-block;
  margin: 0 0 0.8rem;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--success) 18%, transparent);
  color: var(--success);
  font-size: 0.8rem;
  font-weight: 650;
}
.sv-sub {
  margin: 0 0 0.6rem;
  font-size: 0.82rem;
  color: var(--text-faint);
}
.sv-bar {
  display: flex;
  gap: 3px;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
}
.sv-bar span {
  min-width: 4px;
}
.sv-rows {
  list-style: none;
  margin: 0;
  padding: 0 0.85rem;
  border-radius: 20px;
  background: var(--surface);
}
.sv-row {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.8rem 0.1rem;
}
.sv-row + .sv-row {
  border-top: 1px solid var(--border);
}
.sv-icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--c) 18%, transparent);
  color: var(--c);
}
.sv-icon img {
  border-radius: 50%;
}
.sv-body {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 0.15rem;
}
.sv-top,
.sv-meta {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.75rem;
}
.sv-name {
  font-weight: 600;
}
.sv-amount {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.sv-meta {
  font-size: 0.8rem;
  color: var(--text-muted);
}
.sv-end {
  display: inline-flex;
  align-items: baseline;
  gap: 0.6rem;
}
.sv-change {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.sv-change.is-up {
  color: var(--success);
}
.sv-change.is-down {
  color: var(--danger);
}
.sv-pct {
  font-variant-numeric: tabular-nums;
  color: var(--text-faint);
}
</style>
