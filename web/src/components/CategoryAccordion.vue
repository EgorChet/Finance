<template>
  <div class="category-accordion">
    <div class="category-legend-header">
      <strong>Categories</strong>
      <span class="category-legend-count">{{ items.length }}</span>
    </div>
    <p class="category-legend-hint">Tap to expand charges — you can open several at once.</p>

    <div class="category-accordion-list">
      <div
        v-for="(item, idx) in items"
        :key="item.key"
        class="category-accordion-item"
        :class="{ 'category-accordion-item--open': isOpen(item.key) }"
      >
        <button type="button" class="legend-btn category-accordion-trigger" @click="toggle(item.key)">
          <span class="legend-btn-left">
            <span class="swatch" :style="{ background: colors[idx % colors.length] }" />
            <span class="legend-btn-name">{{ item.name }}</span>
          </span>
          <span class="legend-btn-right">
            <span class="legend-btn-pct">{{ item.pct }}%</span>
            <span class="legend-btn-amount">{{ formatIls(item.value) }}</span>
            <span class="category-accordion-chevron" aria-hidden="true">{{ isOpen(item.key) ? "▾" : "▸" }}</span>
          </span>
        </button>

        <div v-if="isOpen(item.key)" class="category-accordion-panel">
          <template v-if="item.kind === 'home'">
            <div
              v-for="row in homeSubsections"
              :key="row.category_en"
              class="category-accordion-nested"
              :class="{ 'category-accordion-nested--open': isOpen(subKey(item.key, row.category_en)) }"
            >
              <button
                type="button"
                class="category-accordion-nested-trigger"
                @click="toggle(subKey(item.key, row.category_en))"
              >
                <span>{{ homeSubsectionLabel(row.category_en) }}</span>
                <span class="category-accordion-nested-meta">
                  {{ formatIls(row.total) }}
                  <span class="cost-breakdown-pct">{{ homePct(row.total) }}%</span>
                  <span class="category-accordion-chevron" aria-hidden="true">
                    {{ isOpen(subKey(item.key, row.category_en)) ? "▾" : "▸" }}
                  </span>
                </span>
              </button>
              <TransactionList
                v-if="isOpen(subKey(item.key, row.category_en))"
                class="category-accordion-txs"
                :transactions="txsForHomeSub(row.category_en)"
                title="Charges"
                :show-category="false"
                :statement-billing="statementBilling"
                :excludeable="excludeable"
                :excluding-key="excludingKey"
                @exclude="(tx) => emit('exclude', tx)"
              />
            </div>
          </template>

          <template v-else-if="item.kind === 'subscriptions'">
            <div
              v-for="row in subscriptionRows"
              :key="row.name"
              class="category-accordion-nested"
              :class="{ 'category-accordion-nested--open': isOpen(subKey(item.key, row.name)) }"
            >
              <button
                type="button"
                class="category-accordion-nested-trigger"
                @click="toggle(subKey(item.key, row.name))"
              >
                <span>{{ row.name }}</span>
                <span class="category-accordion-nested-meta">
                  {{ formatIls(row.total) }}
                  <span class="cost-breakdown-pct">{{ subscriptionPct(row.total) }}%</span>
                  <span class="category-accordion-chevron" aria-hidden="true">
                    {{ isOpen(subKey(item.key, row.name)) ? "▾" : "▸" }}
                  </span>
                </span>
              </button>
              <TransactionList
                v-if="isOpen(subKey(item.key, row.name))"
                class="category-accordion-txs"
                :transactions="txsForSubscriptionSub(row.name)"
                title="Charges"
                :show-category="false"
                :statement-billing="statementBilling"
                :excludeable="excludeable"
                :excluding-key="excludingKey"
                @exclude="(tx) => emit('exclude', tx)"
              />
            </div>
          </template>

          <template v-else-if="item.kind === 'other'">
            <div
              v-for="row in otherCategories"
              :key="row.category_en"
              class="category-accordion-nested"
              :class="{ 'category-accordion-nested--open': isOpen(subKey(item.key, row.category_en)) }"
            >
              <button
                type="button"
                class="category-accordion-nested-trigger"
                @click="toggle(subKey(item.key, row.category_en))"
              >
                <span>{{ row.category_en }}</span>
                <span class="category-accordion-nested-meta">
                  {{ formatIls(row.total) }}
                  <span class="cost-breakdown-pct">{{ otherPct(row.total) }}%</span>
                  <span class="category-accordion-chevron" aria-hidden="true">
                    {{ isOpen(subKey(item.key, row.category_en)) ? "▾" : "▸" }}
                  </span>
                </span>
              </button>
              <TransactionList
                v-if="isOpen(subKey(item.key, row.category_en))"
                class="category-accordion-txs"
                :transactions="txsForOtherSub(row.category_en)"
                title="Charges"
                :show-category="false"
                :statement-billing="statementBilling"
                :excludeable="excludeable"
                :excluding-key="excludingKey"
                @exclude="(tx) => emit('exclude', tx)"
              />
            </div>
          </template>

          <template v-else>
            <p class="category-accordion-meta">
              {{ leafMeta(item.key) }}
            </p>
            <TransactionList
              class="category-accordion-txs"
              :transactions="txsForLeaf(item.key)"
              title="Charges"
              :show-category="false"
              :statement-billing="statementBilling"
              :excludeable="excludeable"
              :excluding-key="excludingKey"
              @exclude="(tx) => emit('exclude', tx)"
            />
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import TransactionList from "./TransactionList.vue";
import type { CategorySummary, Transaction } from "../types";
import {
  groupCategoriesForPie,
  HOME_LIVING,
  homeSubsectionLabel,
  homeSubsectionKey,
  homeSubsectionTotals,
  isOtherBucketLabel,
  OTHER_BUCKET,
  otherBucketLabel,
  rollupCategory,
} from "../categories";
import { CHART_COLORS, formatIls, roundMoney } from "../utils/format";
import { subscriptionSubsectionLabel, subscriptionSubsectionTotals } from "../utils/subscriptionSections";

const props = defineProps<{
  categories: CategorySummary[];
  transactions: Transaction[];
  totalSpent: number;
  expandedKeys: string[];
  statementBilling?: string | null;
  excludeable?: boolean;
  excludingKey?: string | null;
}>();

const emit = defineEmits<{
  "update:expandedKeys": [string[]];
  exclude: [Transaction];
}>();

const colors = CHART_COLORS;

const pieGroup = computed(() => groupCategoriesForPie(props.categories));

const homeSubsections = computed(() =>
  homeSubsectionTotals(
    props.transactions.filter((t) => rollupCategory(t.category_en) === HOME_LIVING),
  ),
);

const homeTotal = computed(() => roundMoney(homeSubsections.value.reduce((s, c) => s + c.total, 0)));

const subscriptionRows = computed(() =>
  subscriptionSubsectionTotals(
    props.transactions.filter((t) => rollupCategory(t.category_en) === "Subscriptions"),
  ),
);

const otherCategories = computed(() => pieGroup.value.other);

const otherTotal = computed(() => roundMoney(otherCategories.value.reduce((s, c) => s + c.total, 0)));

type AccordionItem = {
  key: string;
  name: string;
  value: number;
  pct: number;
  kind: "leaf" | "home" | "subscriptions" | "other";
};

const items = computed((): AccordionItem[] => {
  const { top, other } = pieGroup.value;
  const grand = props.categories.reduce((s, c) => s + c.total, 0);
  const pct = (total: number) => (grand ? Math.round((total / grand) * 100) : 0);

  const result: AccordionItem[] = top.map((c) => {
    if (c.category_en === HOME_LIVING) {
      return {
        key: HOME_LIVING,
        name: c.category_en,
        value: roundMoney(c.total),
        pct: pct(c.total),
        kind: "home" as const,
      };
    }
    if (c.category_en === "Subscriptions") {
      return {
        key: "Subscriptions",
        name: c.category_en,
        value: roundMoney(c.total),
        pct: pct(c.total),
        kind: "subscriptions" as const,
      };
    }
    return {
      key: c.category_en,
      name: c.category_en,
      value: roundMoney(c.total),
      pct: pct(c.total),
      kind: "leaf" as const,
    };
  });

  if (other.length) {
    const otherVal = roundMoney(other.reduce((s, c) => s + c.total, 0));
    result.push({
      key: OTHER_BUCKET,
      name: otherBucketLabel(other.length),
      value: otherVal,
      pct: pct(otherVal),
      kind: "other",
    });
  }

  return result;
});

function subKey(parent: string, child: string): string {
  return `${parent}::${child}`;
}

function isOpen(key: string): boolean {
  return props.expandedKeys.includes(key);
}

function toggle(key: string) {
  const next = new Set(props.expandedKeys);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  emit("update:expandedKeys", [...next]);
}

function txsForLeaf(category: string): Transaction[] {
  return props.transactions.filter((t) => rollupCategory(t.category_en) === category);
}

function txsForHomeSub(categoryEn: string): Transaction[] {
  return props.transactions.filter((t) => homeSubsectionKey(t.category_en) === categoryEn);
}

function txsForSubscriptionSub(name: string): Transaction[] {
  return props.transactions.filter(
    (t) => rollupCategory(t.category_en) === "Subscriptions" && subscriptionSubsectionLabel(t) === name,
  );
}

function txsForOtherSub(categoryEn: string): Transaction[] {
  return props.transactions.filter((t) => t.category_en === categoryEn);
}

function leafMeta(key: string): string {
  const txs = txsForLeaf(key);
  const share = props.totalSpent ? Math.round((txs.reduce((s, t) => s + t.charge_amount, 0) / props.totalSpent) * 100) : 0;
  return `${share}% of total · ${txs.length.toLocaleString()} ${txs.length === 1 ? "charge" : "charges"}`;
}

function homePct(amount: number): number {
  return homeTotal.value ? Math.round((roundMoney(amount) / homeTotal.value) * 100) : 0;
}

function subscriptionPct(amount: number): number {
  const total = subscriptionRows.value.reduce((s, r) => s + r.total, 0);
  return total ? Math.round((roundMoney(amount) / total) * 100) : 0;
}

function otherPct(amount: number): number {
  return otherTotal.value ? Math.round((roundMoney(amount) / otherTotal.value) * 100) : 0;
}
</script>
