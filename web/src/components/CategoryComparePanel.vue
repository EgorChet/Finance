<template>
  <div class="category-compare-panel">
    <p class="category-compare-panel-hint">
      Day {{ result.dayIndex }} of {{ result.cycleLength }} —
      compared with your last {{ result.cyclesUsed || 3 }}-cycle average at this point.
    </p>
    <div v-if="result.usual != null" class="pace-simple-table-wrap">
      <table class="pace-simple-table">
        <tbody>
          <tr class="pace-simple-table-group">
            <td colspan="2">So far this cycle</td>
          </tr>
          <tr>
            <td>This cycle</td>
            <td>{{ formatIls(result.current) }}</td>
          </tr>
          <tr>
            <td>Usual at day {{ result.dayIndex }}</td>
            <td>{{ formatIls(result.usual) }}</td>
          </tr>
          <tr class="pace-simple-table-gap" :class="deltaClass">
            <td>Difference</td>
            <td>{{ formatGap(result.delta ?? 0) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="category-compare-empty">
      Upload more past statements to see how this category usually looks by day
      {{ result.dayIndex }}.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CategoryCompareResult } from "../utils/categoryCompare";
import { formatIls } from "../utils/format";

const props = defineProps<{
  result: CategoryCompareResult;
}>();

const deltaClass = computed(() => {
  const delta = props.result.delta ?? 0;
  if (delta > 0) return "pace-delta-bad";
  if (delta < 0) return "pace-delta-good";
  return "";
});

function formatGap(delta: number): string {
  if (Math.abs(delta) < 1) return "Same";
  const abs = formatIls(Math.abs(delta));
  return delta > 0 ? `+${abs}` : `−${abs}`;
}
</script>
