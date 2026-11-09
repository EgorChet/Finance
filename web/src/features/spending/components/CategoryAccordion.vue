<template>
  <div class="category-accordion">
    <div class="category-legend-header">
      <strong>Categories</strong>
      <span class="category-legend-count">{{ items.length }}</span>
    </div>

    <section v-if="compareContext" class="cat-changes">
      <p class="cat-changes-title">{{ changesTitle }}</p>
      <div v-if="changes.length" class="cat-changes-list">
        <button
          v-for="c in changes"
          :key="c.key"
          type="button"
          class="cat-change"
          :class="c.delta > 0 ? 'cat-change--up' : 'cat-change--down'"
          @click="openAndScroll(c.key)"
        >
          <span class="cat-change-name">{{ c.name }}</span>
          <span class="cat-change-delta">{{ c.delta > 0 ? "+" : "−" }}{{ formatIlsWhole(Math.abs(c.delta)) }}</span>
        </button>
      </div>
      <p v-else class="cat-changes-empty">Every category is about where it usually is.</p>
    </section>
    <p v-else class="category-legend-hint">Tap a category to see its charges.</p>

    <div class="category-accordion-list">
      <CategoryRow
        v-for="(item, idx) in items"
        :key="item.key"
        :anchor-id="anchorId(item.key)"
        :name="item.name"
        :amount="item.value"
        :pct="item.pct"
        :color="colors[idx % colors.length]"
        :icon="item.kind === 'other' ? categoryIcon('Other') : categoryIcon(item.key)"
        :count="countFor(item)"
        :open="isOpen(item.key)"
        :result="resultFor(scopeForItem(item))"
        v-bind="labels"
        @toggle="toggle(item.key)"
      >
        <template v-if="item.kind === 'home'">
          <CategoryRow
            v-for="row in homeSubsections"
            :key="row.category_en"
            nested
            :name="homeSubsectionLabel(row.category_en)"
            :icon="categoryIcon(row.category_en)"
            :amount="row.total"
            :pct="sharePct(row.total, homeTotal)"
            :count="txsForHomeSub(row.category_en).length"
            :open="isOpen(subKey(item.key, row.category_en))"
            :result="resultFor(scopeForHomeSub(row.category_en))"
            v-bind="labels"
            @toggle="toggle(subKey(item.key, row.category_en))"
          >
            <TransactionList v-bind="listProps" :transactions="txsForHomeSub(row.category_en)" @exclude="(tx) => emit('exclude', tx)" @adjust="(tx) => emit('adjust', tx)" />
          </CategoryRow>
        </template>

        <template v-else-if="item.kind === 'subscriptions'">
          <CategoryRow
            v-for="row in subscriptionRows"
            :key="row.name"
            nested
            :name="row.name"
            :icon="categoryIcon(row.name)"
            :amount="row.total"
            :pct="sharePct(row.total, subscriptionTotal)"
            :count="txsForSubscriptionSub(row.name).length"
            :open="isOpen(subKey(item.key, row.name))"
            :result="resultFor(scopeForSubscriptionSub(row.name))"
            v-bind="labels"
            @toggle="toggle(subKey(item.key, row.name))"
          >
            <TransactionList v-bind="listProps" :transactions="txsForSubscriptionSub(row.name)" @exclude="(tx) => emit('exclude', tx)" @adjust="(tx) => emit('adjust', tx)" />
          </CategoryRow>
        </template>

        <template v-else-if="item.kind === 'other'">
          <CategoryRow
            v-for="row in otherCategories"
            :key="row.category_en"
            nested
            :name="row.category_en"
            :icon="categoryIcon(row.category_en)"
            :amount="row.total"
            :pct="sharePct(row.total, otherTotal)"
            :count="txsForOtherSub(row.category_en).length"
            :open="isOpen(subKey(item.key, row.category_en))"
            :result="resultFor(scopeForOtherSub(row.category_en))"
            v-bind="labels"
            @toggle="toggle(subKey(item.key, row.category_en))"
          >
            <TransactionList v-bind="listProps" :transactions="txsForOtherSub(row.category_en)" @exclude="(tx) => emit('exclude', tx)" @adjust="(tx) => emit('adjust', tx)" />
          </CategoryRow>
        </template>

        <TransactionList v-else v-bind="listProps" :transactions="txsForLeaf(item.key)" @exclude="(tx) => emit('exclude', tx)" @adjust="(tx) => emit('adjust', tx)" />
      </CategoryRow>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick } from "vue";
import CategoryRow from "@/features/spending/components/CategoryRow.vue";
import TransactionList from "@/shared/components/TransactionList.vue";
import type { CategorySummary, Transaction } from "@/shared/types";
import {
  groupCategoriesForPie,
  HOME_LIVING,
  homeSubsectionLabel,
  homeSubsectionKey,
  homeSubsectionTotals,
  OTHER_BUCKET,
  otherBucketLabel,
  rollupCategory,
} from "@/shared/categories";
import {
  categoryCompareTone,
  computeCategoryCompareFromContext,
  scopeKey,
  type CategoryCompareContext,
  type CategoryCompareResult,
  type CategoryCompareScope,
} from "@/features/spending/utils/categoryCompare";
import { CHART_COLORS, formatIlsWhole, roundMoney } from "@/shared/utils/format";
import { categoryIcon } from "@/features/spending/utils/categoryIcons";
import { subscriptionSubsectionLabel, subscriptionSubsectionTotals } from "@/features/spending/utils/subscriptionSections";

const props = defineProps<{
  categories: CategorySummary[];
  transactions: Transaction[];
  totalSpent: number;
  expandedKeys: string[];
  statementBilling?: string | null;
  excludeable?: boolean;
  adjustable?: boolean;
  excludingKey?: string | null;
  adjustingKey?: string | null;
  /** What each category is compared against; null hides comparisons. */
  compareContext?: CategoryCompareContext | null;
  /** "This cycle" / "Oct 2026". */
  currentLabel?: string;
}>();

const emit = defineEmits<{
  "update:expandedKeys": [string[]];
  exclude: [Transaction];
  adjust: [Transaction];
}>();

const colors = CHART_COLORS;

const labels = computed(() => ({
  currentLabel: props.currentLabel ?? "This cycle",
  lastLabel: props.compareContext?.lastLabel ?? "",
  pointLabel: props.compareContext?.pointLabel ?? "",
}));

const listProps = computed(() => ({
  class: "category-accordion-txs",
  title: "Charges",
  showCategory: false,
  statementBilling: props.statementBilling,
  excludeable: props.excludeable,
  adjustable: props.adjustable,
  excludingKey: props.excludingKey,
  adjustingKey: props.adjustingKey,
}));

const pieGroup = computed(() => groupCategoriesForPie(props.categories));

const homeSubsections = computed(() =>
  homeSubsectionTotals(props.transactions.filter((t) => rollupCategory(t.category_en) === HOME_LIVING)),
);
const homeTotal = computed(() => roundMoney(homeSubsections.value.reduce((s, c) => s + c.total, 0)));

const subscriptionRows = computed(() =>
  subscriptionSubsectionTotals(props.transactions.filter((t) => rollupCategory(t.category_en) === "Subscriptions")),
);
const subscriptionTotal = computed(() => roundMoney(subscriptionRows.value.reduce((s, r) => s + r.total, 0)));

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
  const result: AccordionItem[] = top.map((c) => ({
    key: c.category_en,
    name: c.category_en,
    value: roundMoney(c.total),
    pct: sharePct(c.total, grand),
    kind:
      c.category_en === HOME_LIVING ? "home" : c.category_en === "Subscriptions" ? "subscriptions" : "leaf",
  }));
  if (other.length) {
    const otherVal = roundMoney(other.reduce((s, c) => s + c.total, 0));
    result.push({ key: OTHER_BUCKET, name: otherBucketLabel(other.length), value: otherVal, pct: sharePct(otherVal, grand), kind: "other" });
  }
  return result;
});

function sharePct(amount: number, total: number): number {
  return total ? Math.round((amount / total) * 100) : 0;
}

function scopeForItem(item: AccordionItem): CategoryCompareScope {
  if (item.kind === "other") {
    return { kind: "otherBucket", categories: otherCategories.value.map((c) => c.category_en) };
  }
  return { kind: "rollup", category: item.key };
}
const scopeForHomeSub = (category: string): CategoryCompareScope => ({ kind: "homeSub", category });
const scopeForSubscriptionSub = (name: string): CategoryCompareScope => ({ kind: "subscriptionSub", name });
const scopeForOtherSub = (category: string): CategoryCompareScope => ({ kind: "raw", category });

/** Results are computed lazily and cached per scope. */
const resultCache = computed(() => {
  void props.compareContext;
  void props.transactions;
  return new Map<string, CategoryCompareResult>();
});

function resultFor(scope: CategoryCompareScope): CategoryCompareResult | null {
  const ctx = props.compareContext;
  if (!ctx) return null;
  const key = scopeKey(scope);
  const cache = resultCache.value;
  let r = cache.get(key);
  if (!r) {
    r = computeCategoryCompareFromContext(ctx, props.transactions, scope, key);
    cache.set(key, r);
  }
  return r;
}

/** Biggest movers vs usual among top-level categories: up to 3 up, 2 down. */
const changes = computed(() => {
  if (!props.compareContext) return [];
  const rows = items.value
    .map((item) => ({ item, r: resultFor(scopeForItem(item)) }))
    .filter(({ r }) => {
      const tone = categoryCompareTone(r);
      return tone === "high" || tone === "low" || tone === "new";
    })
    .map(({ item, r }) => ({ key: item.key, name: item.name, delta: r!.delta ?? 0 }));
  const up = rows.filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3);
  const down = rows.filter((c) => c.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 2);
  return [...up, ...down];
});

const changesTitle = computed(() => {
  const ctx = props.compareContext;
  if (!ctx) return "";
  if (ctx.mode === "cycle") return `Compared with your usual ${ctx.pointLabel}`;
  const n = ctx.historical.length;
  return n > 1 ? `Compared with your previous ${n} months` : `Compared with ${ctx.lastLabel}`;
});

function countFor(item: AccordionItem): number {
  if (item.kind === "other") {
    const cats = new Set(otherCategories.value.map((c) => c.category_en));
    return props.transactions.filter((t) => cats.has(t.category_en)).length;
  }
  return txsForLeaf(item.key).length;
}

function subKey(parent: string, child: string): string {
  return `${parent}::${child}`;
}

function anchorId(key: string): string {
  return `cat-${key.replace(/[^\w-]+/g, "-")}`;
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

async function openAndScroll(key: string) {
  if (!isOpen(key)) toggle(key);
  await nextTick();
  document.getElementById(anchorId(key))?.scrollIntoView({ behavior: "smooth", block: "start" });
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
</script>
