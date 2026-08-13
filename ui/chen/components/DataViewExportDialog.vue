<script setup lang="ts">
import type { ChenDataViewExportFormat, ChenDataViewExportOptions, ChenDataViewExportScope } from "~/chen/types";

import ChenWorkspaceModal from "~/chen/components/WorkspaceModal.vue";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
  confirm: [options: ChenDataViewExportOptions];
}>();

const scope = ref<ChenDataViewExportScope>("current");
const format = ref<ChenDataViewExportFormat>("csv");
const visible = computed({
  get: () => props.open,
  set: (open: boolean) => emit("update:open", open)
});
const scopeItems = [
  { label: "Current page", value: "current" },
  { label: "All rows", value: "all" }
];
const formatItems = [
  { label: "CSV", value: "csv" },
  { label: "Excel", value: "excel" }
];

function close() {
  visible.value = false;
}

function submit() {
  emit("confirm", { scope: scope.value, format: format.value });
  close();
}
</script>

<template>
  <ChenWorkspaceModal v-model:open="visible" title="Export data">
    <template #body>
      <div class="space-y-5">
        <UFormField label="Scope">
          <URadioGroup
            v-model="scope"
            :items="scopeItems"
            orientation="horizontal"
            value-key="value"
            label-key="label"
          />
        </UFormField>
        <UFormField label="Format">
          <URadioGroup
            v-model="format"
            :items="formatItems"
            orientation="horizontal"
            value-key="value"
            label-key="label"
          />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="soft" @click="close">Cancel</UButton>
        <UButton @click="submit">Export</UButton>
      </div>
    </template>
  </ChenWorkspaceModal>
</template>
