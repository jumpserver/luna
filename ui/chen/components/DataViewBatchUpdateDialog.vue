<script setup lang="ts">
import type { ChenDataViewField } from "~/chen/types";

import ChenWorkspaceModal from "~/chen/components/WorkspaceModal.vue";

const props = defineProps<{
  open: boolean;
  fields: ChenDataViewField[];
  rowCount: number;
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
  confirm: [field: ChenDataViewField, value: unknown];
}>();

const selectedFieldName = ref("");
const value = ref("");
const setNull = ref(false);
const visible = computed({
  get: () => props.open,
  set: (open: boolean) => emit("update:open", open)
});
const fieldItems = computed(() =>
  props.fields.map((field) => ({
    label: field.type ? `${field.name} · ${field.type}` : field.name,
    value: field.name
  }))
);
const selectedField = computed(() => props.fields.find((field) => field.name === selectedFieldName.value) || null);
const canSetNull = computed(() => selectedField.value?.nullable !== false);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    selectedFieldName.value = props.fields[0]?.name || "";
    value.value = "";
    setNull.value = false;
  }
);

watch(canSetNull, (allowed) => {
  if (!allowed) setNull.value = false;
});

function close() {
  visible.value = false;
}

function submit() {
  if (!selectedField.value) return;
  emit("confirm", selectedField.value, setNull.value ? null : value.value);
  close();
}
</script>

<template>
  <ChenWorkspaceModal v-model:open="visible" title="Update selected rows">
    <template #body>
      <div class="space-y-4">
        <div class="flex items-start gap-2 rounded-md border border-warning/25 bg-warning/8 px-3 py-2 text-xs">
          <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0 text-warning" />
          <p>
            The selected field will be set to the same value in
            <strong class="text-highlighted">{{ rowCount }} rows</strong>
            . Changes remain pending until you click Save.
          </p>
        </div>

        <UFormField label="Field" required>
          <USelectMenu
            v-model="selectedFieldName"
            class="w-full"
            :items="fieldItems"
            value-key="value"
            label-key="label"
            placeholder="Select a field"
          />
        </UFormField>

        <UFormField label="Value" :hint="selectedField?.type">
          <UInput
            v-model="value"
            class="w-full"
            :disabled="setNull"
            :placeholder="setNull ? 'NULL' : 'Enter the new value'"
            @keydown.enter="submit"
          />
        </UFormField>

        <label v-if="canSetNull" class="flex items-center gap-2 text-sm">
          <UCheckbox v-model="setNull" />
          <span>Set value to NULL</span>
        </label>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="soft" @click="close">Cancel</UButton>
        <UButton icon="i-lucide-list-restart" :disabled="!selectedField" @click="submit">
          Update {{ rowCount }} rows
        </UButton>
      </div>
    </template>
  </ChenWorkspaceModal>
</template>
