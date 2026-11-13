<template>
  <label class="sheet-field">
    <span class="sheet-field__label">{{ t(label) }}</span>
    <span class="sheet-amount">
      <span class="sheet-amount__currency" aria-hidden="true">₪</span>
      <input
        class="sheet-amount__input"
        type="text"
        inputmode="decimal"
        enterkeyhint="done"
        autocomplete="off"
        :placeholder="placeholder"
        :value="display"
        :disabled="disabled"
        :aria-label="t(label)"
        @input="onInput"
        @focus="onFocus"
      />
    </span>
    <span v-if="hint" class="sheet-field__hint">{{ hint }}</span>
  </label>
</template>

<script setup lang="ts">
import { t } from "@/shared/i18n";
import { ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    label: string;
    hint?: string;
    placeholder?: string;
    disabled?: boolean;
  }>(),
  { hint: "", placeholder: "0", disabled: false },
);

const model = defineModel<number>({ required: true });

function format(n: number): string {
  return Number.isFinite(n) && n !== 0 ? String(n) : "";
}

// Keep the raw text while typing so "12." or "0,5" are not rewritten mid-entry.
const display = ref(format(model.value));

watch(model, (n) => {
  if (parse(display.value) !== n) display.value = format(n);
});

function parse(text: string): number {
  const cleaned = text.replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  return cleaned === "" || !Number.isFinite(n) ? 0 : n;
}

function onInput(e: Event) {
  const input = e.target as HTMLInputElement;
  const text = input.value.replace(/[^\d.,]/g, "");
  if (text !== input.value) input.value = text;
  display.value = text;
  model.value = parse(text);
}

function onFocus(e: FocusEvent) {
  if (!props.disabled) (e.target as HTMLInputElement).select();
}
</script>
