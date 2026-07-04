<template>
  <article class="edit-panel">
    <header class="edit-panel__head">
      <h4 class="edit-panel__title">{{ title }}</h4>
      <IconButton icon="close" label="Cancel" :disabled="disabled" @click="$emit('cancel')" />
    </header>
    <div class="edit-panel__body">
      <slot />
    </div>
    <footer class="edit-panel__foot">
      <IconButton
        v-if="deletable"
        icon="trash"
        variant="danger"
        :label="deleteLabel"
        :disabled="disabled"
        @click="$emit('delete')"
      />
      <button type="button" class="btn btn-primary edit-panel__done" :disabled="disabled" @click="$emit('done')">
        {{ doneLabel }}
      </button>
    </footer>
  </article>
</template>

<script setup lang="ts">
import IconButton from "@/shared/components/IconButton.vue";

withDefaults(
  defineProps<{
    title: string;
    doneLabel?: string;
    deleteLabel?: string;
    deletable?: boolean;
    disabled?: boolean;
  }>(),
  {
    doneLabel: "Done",
    deleteLabel: "Delete",
    deletable: false,
    disabled: false,
  },
);

defineEmits<{
  done: [];
  cancel: [];
  delete: [];
}>();
</script>
