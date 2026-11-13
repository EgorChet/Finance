<template>
  <!-- Form field: shows the chosen category; tap opens the picker in a sheet. -->
  <button type="button" class="cf input" :disabled="disabled" @click="open = true">
    <CategoryIcon v-if="modelValue" :category="modelValue" size="sm" />
    <span class="cf-name" :class="{ 'cf-name--empty': !modelValue }">{{ modelValue ? catName(modelValue) : t(emptyLabel || "Choose category") }}</span>
    <span class="cf-chevron" aria-hidden="true">›</span>
  </button>
  <BottomSheet :open="open" :title="t('Category')" @close="open = false">
    <CategoryPicker
      :model-value="modelValue"
      :options="options"
      :suggestions="suggestions"
      :empty-label="allowEmpty ? emptyLabel || 'Uncategorized' : ''"
      @pick="choose"
    />
  </BottomSheet>
</template>

<script setup lang="ts">
import { ref } from "vue";
import BottomSheet from "@/shared/components/BottomSheet.vue";
import CategoryIcon from "@/shared/components/CategoryIcon.vue";
import CategoryPicker from "@/shared/components/CategoryPicker.vue";
import { catName, t } from "@/shared/i18n";

withDefaults(
  defineProps<{
    modelValue: string;
    options: readonly string[];
    suggestions?: readonly string[];
    allowEmpty?: boolean;
    emptyLabel?: string;
    disabled?: boolean;
  }>(),
  { suggestions: () => [], allowEmpty: false, emptyLabel: "", disabled: false },
);

const emit = defineEmits<{ "update:modelValue": [string] }>();
const open = ref(false);

function choose(c: string) {
  emit("update:modelValue", c);
  open.value = false;
}
</script>
