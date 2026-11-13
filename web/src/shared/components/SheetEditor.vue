<template>
  <!-- Bottom-sheet editor: full width on phones, centred card on wider screens. -->
  <Teleport to="body">
    <Transition name="tx-sheet">
      <div v-if="open" class="tx-sheet-backdrop sheet-editor-backdrop" @click.self="onCancel">
        <form
          class="tx-sheet sheet-editor"
          role="dialog"
          aria-modal="true"
          :aria-label="tr(title)"
          novalidate
          @submit.prevent="onSave"
        >
          <div class="tx-sheet-grabber" aria-hidden="true" />
          <header class="sheet-editor__head">
            <button type="button" class="sheet-editor__cancel" :disabled="busy" @click="onCancel">{{ t("Cancel") }}</button>
            <h3 class="sheet-editor__title">{{ tr(title) }}</h3>
            <span class="sheet-editor__head-spacer" aria-hidden="true" />
          </header>
          <p v-if="subtitle" class="sheet-editor__subtitle">{{ tr(subtitle) }}</p>

          <div class="sheet-editor__body">
            <slot />
          </div>

          <p v-if="error" class="sheet-editor__error" role="alert">{{ error }}</p>

          <footer class="sheet-editor__foot">
            <button type="submit" class="btn btn-primary sheet-editor__save" :disabled="busy">
              {{ busy ? t("Saving…") : t(saveLabel) }}
            </button>
            <button
              v-if="deletable"
              type="button"
              class="sheet-editor__delete"
              :disabled="busy"
              @click="$emit('delete')"
            >
              {{ t(deleteLabel) }}
            </button>
          </footer>
        </form>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { t, tr } from "@/shared/i18n";
import { onUnmounted, watch } from "vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    subtitle?: string;
    saveLabel?: string;
    deleteLabel?: string;
    deletable?: boolean;
    busy?: boolean;
    error?: string;
  }>(),
  {
    subtitle: "",
    saveLabel: "Save",
    deleteLabel: "Delete",
    deletable: false,
    busy: false,
    error: "",
  },
);

const emit = defineEmits<{
  save: [];
  cancel: [];
  delete: [];
}>();

function onSave() {
  if (!props.busy) emit("save");
}

function onCancel() {
  if (!props.busy) emit("cancel");
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") onCancel();
}

// Keep the page behind the sheet from scrolling while it is open.
watch(
  () => props.open,
  (open) => {
    document.documentElement.classList.toggle("sheet-editor-open", open);
    if (open) window.addEventListener("keydown", onKeydown);
    else window.removeEventListener("keydown", onKeydown);
  },
  { immediate: true },
);

onUnmounted(() => {
  document.documentElement.classList.remove("sheet-editor-open");
  window.removeEventListener("keydown", onKeydown);
});
</script>
