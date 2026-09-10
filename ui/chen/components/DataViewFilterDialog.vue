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

const { t } = useI18n();

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
const operatorItems = computed(() =>
  chenDataViewFilterOperators.map((operator) => ({
    ...operator,
    label: t(`Chen.FilterOperator.${operator.value}`)
  }))
);
const needsValue = computed(() => chenDataViewFilterNeedsValue(selectedOperator.value));
const result = computed(() => {
  if (!selectedField.value) return { condition: "", error: t("Chen.SelectColumn") };
  try {
    return {
      condition: buildChenDataViewFilter(props.dbType, selectedField.value, selectedOperator.value, value.value),
      error: ""
    };
  } catch {
    return { condition: "", error: t("Chen.InvalidFilter") };
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
  <ChenWorkspaceModal v-model:open="visible" :title="t('Chen.FilterRows')" :ui="{ content: 'sm:max-w-2xl' }">
    <template #body>
      <div class="space-y-4">
        <div class="grid gap-3 sm:grid-cols-3">
          <UFormField :label="t('Chen.Column')" required>
            <USelectMenu
              v-model="selectedFieldName"
              class="w-full"
              :items="fieldItems"
              value-key="value"
              label-key="label"
              :placeholder="t('Chen.SelectColumn')"
            />
          </UFormField>

          <UFormField :label="t('Chen.Operator')" required>
            <USelectMenu
              v-model="selectedOperator"
              class="w-full"
              :items="operatorItems"
              value-key="value"
              label-key="label"
            />
          </UFormField>

          <UFormField :label="t('Chen.Value')" :error="result.error || undefined">
            <UInput
              v-model="value"
              class="w-full"
              :disabled="!needsValue"
              :placeholder="needsValue ? t('Chen.EnterValue') : t('Chen.NotRequired')"
              @keydown.enter="submit"
            />
          </UFormField>
        </div>

        <div v-if="result.condition" class="rounded-md border border-default bg-elevated px-3 py-2">
          <div class="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
            {{ t("Chen.WherePreview") }}
          </div>
          <code class="break-all text-xs text-highlighted">{{ result.condition }}</code>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="soft" @click="visible = false">{{ t("Common.Cancel") }}</UButton>
        <UButton icon="i-lucide-list-filter" :disabled="!result.condition" @click="submit">
          {{ t("Chen.ApplyFilter") }}
        </UButton>
      </div>
    </template>
  </ChenWorkspaceModal>
</template>
