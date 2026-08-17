<script setup lang="ts">
import type { ChenDataViewField } from "~/chen/types";
import type { ChenDataViewFilterOperator } from "~/chen/utils/dataViewFilter";

import ChenWorkspaceModal from "~/chen/components/WorkspaceModal.vue";
import {
  buildChenDataViewFilter,
  chenDataViewFilterNeedsValue,
  chenDataViewFilterOperators
} from "~/chen/utils/dataViewFilter";

const props = defineProps<{
  open: boolean;
  fields: ChenDataViewField[];
  dbType: string;
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
  apply: [condition: string];
}>();

const selectedFieldName = ref("");
const selectedOperator = ref<ChenDataViewFilterOperator>("equals");
const value = ref("");
const visible = computed({
  get: () => props.open,
  set: (open: boolean) => emit("update:open", open)
});
const fieldItems = computed(() =>
  props.fields.map((field) => ({
    label: field.type ? `${field.label || field.name} · ${field.type}` : field.label || field.name,
    value: field.name
  }))
);
const selectedField = computed(() => props.fields.find((field) => field.name === selectedFieldName.value) || null);
const needsValue = computed(() => chenDataViewFilterNeedsValue(selectedOperator.value));
const result = computed(() => {
  if (!selectedField.value) return { condition: "", error: "Select a column" };
  try {
    return {
      condition: buildChenDataViewFilter(props.dbType, selectedField.value, selectedOperator.value, value.value),
      error: ""
    };
  } catch (error) {
    return { condition: "", error: error instanceof Error ? error.message : "Invalid filter" };
  }
});

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    selectedFieldName.value = props.fields[0]?.name || "";
    selectedOperator.value = "equals";
    value.value = "";
  },
  { immediate: true }
);

function submit() {
  if (!result.value.condition) return;
  emit("apply", result.value.condition);
  visible.value = false;
}
</script>

<template>
  <ChenWorkspaceModal v-model:open="visible" title="Filter rows" :ui="{ content: 'sm:max-w-2xl' }">
    <template #body>
      <div class="space-y-4">
        <div class="grid gap-3 sm:grid-cols-3">
          <UFormField label="Column" required>
            <USelectMenu
              v-model="selectedFieldName"
              class="w-full"
              :items="fieldItems"
              value-key="value"
              label-key="label"
              placeholder="Select a column"
            />
          </UFormField>

          <UFormField label="Operator" required>
            <USelectMenu
              v-model="selectedOperator"
              class="w-full"
              :items="chenDataViewFilterOperators"
              value-key="value"
              label-key="label"
            />
          </UFormField>

          <UFormField label="Value" :error="result.error || undefined">
            <UInput
              v-model="value"
              class="w-full"
              :disabled="!needsValue"
              :placeholder="needsValue ? 'Enter a value' : 'Not required'"
              @keydown.enter="submit"
            />
          </UFormField>
        </div>

        <div v-if="result.condition" class="rounded-md border border-default bg-elevated px-3 py-2">
          <div class="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">WHERE preview</div>
          <code class="break-all text-xs text-highlighted">{{ result.condition }}</code>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="soft" @click="visible = false">Cancel</UButton>
        <UButton icon="i-lucide-list-filter" :disabled="!result.condition" @click="submit">Apply filter</UButton>
      </div>
    </template>
  </ChenWorkspaceModal>
</template>
