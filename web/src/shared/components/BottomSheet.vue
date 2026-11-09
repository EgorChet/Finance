<template>
  <Teleport to="body">
    <Transition name="tx-sheet">
      <div v-if="open" class="tx-sheet-backdrop" @click.self="emit('close')">
        <div class="tx-sheet bs" role="dialog" aria-modal="true" :aria-label="title">
          <div class="tx-sheet-grabber" aria-hidden="true" />
          <header v-if="title || $slots.head" class="bs-head">
            <slot name="head">
              <h3 class="bs-title">{{ title }}</h3>
            </slot>
            <button type="button" class="bs-close" aria-label="Close" @click="emit('close')">✕</button>
          </header>
          <div class="bs-body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="bs-footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { onUnmounted, watch } from "vue";

const props = defineProps<{ open: boolean; title?: string }>();
const emit = defineEmits<{ close: [] }>();

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}

watch(
  () => props.open,
  (open) => {
    document.body.style.overflow = open ? "hidden" : "";
    if (open) document.addEventListener("keydown", onKeydown);
    else document.removeEventListener("keydown", onKeydown);
  },
  { immediate: true },
);

onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
  if (props.open) document.body.style.overflow = "";
});
</script>
