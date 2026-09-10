<script setup lang="ts">
import type { ChenDataViewField } from "~/chen/types";
import type { ChenCsvEmptyValue, ChenParsedCsv } from "~/chen/utils/csvImport";

import ChenWorkspaceModal from "~/chen/components/WorkspaceModal.vue";
import { mapChenCsvRows, parseChenCsv } from "~/chen/utils/csvImport";

const props = defineProps<{
  open: boolean;
  fields: ChenDataViewField[];
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
  confirm: [rows: Array<Record<string, string | null>>];
}>();

const { t } = useI18n();

// ponytail: CSV is staged in the browser for the existing Save preview flow; move large imports to a streamed Chen API.
const MAX_CSV_BYTES = 10 * 1024 * 1024;
const MAX_CSV_ROWS = 10_000;

const fileInput = ref<HTMLInputElement | null>(null);
const fileName = ref("");
const parsed = ref<ChenParsedCsv | null>(null);
const error = ref("");
const emptyValue = ref<ChenCsvEmptyValue>("empty-string");
const visible = computed({
  get: () => props.open,
  set: (open: boolean) => emit("update:open", open)
});
const emptyValueItems = computed(() => [
  { label: t("Chen.EmptyString"), value: "empty-string" },
  { label: "NULL", value: "null" }
]);
const mapped = computed(() => {
  if (!parsed.value) return { rows: [] as Array<Record<string, string | null>>, error: "" };
  try {
    return { rows: mapChenCsvRows(parsed.value, props.fields, emptyValue.value), error: "" };
  } catch {
    return { rows: [], error: t("Chen.MapCsvColumnsFailed") };
  }
});

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    fileName.value = "";
    parsed.value = null;
    error.value = "";
    emptyValue.value = "empty-string";
  },
  { immediate: true }
);

async function selectFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  fileName.value = file.name;
  parsed.value = null;
  error.value = "";
  if (file.size > MAX_CSV_BYTES) {
    error.value = t("Chen.CsvTooLarge");
    return;
  }

  try {
    const result = parseChenCsv(await file.text());
    if (result.rows.length > MAX_CSV_ROWS) {
      throw new Error(t("Chen.CsvRowLimit", { count: result.rows.length, limit: MAX_CSV_ROWS }));
    }
    parsed.value = result;
  } catch {
    error.value = t("Chen.InvalidCsvFile");
  }
}

function submit() {
  if (!mapped.value.rows.length) return;
  emit("confirm", mapped.value.rows);
  visible.value = false;
}
</script>

<template>
  <ChenWorkspaceModal v-model:open="visible" :title="t('Chen.ImportCsv')" :ui="{ content: 'sm:max-w-2xl' }">
    <template #body>
      <div class="space-y-4">
        <input ref="fileInput" type="file" accept=".csv,text/csv" class="hidden" @change="selectFile" />
        <div class="rounded-lg border border-dashed border-default p-4 text-center">
          <UIcon name="i-lucide-file-spreadsheet" class="mx-auto mb-2 size-7 text-muted" />
          <p class="text-sm text-highlighted">{{ fileName || t("Chen.ChooseCsvFile") }}</p>
          <p class="mt-1 text-xs text-muted">
            {{ t("Chen.CsvImportHint") }}
          </p>
          <UButton class="mt-3" size="sm" color="neutral" variant="soft" @click="fileInput?.click()">
            {{ t("Chen.ChooseFile") }}
          </UButton>
        </div>

        <UAlert
          v-if="error || mapped.error"
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          :title="t('Chen.CsvCannotImport')"
          :description="error || mapped.error"
        />

        <template v-if="parsed && !error">
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField :label="t('Chen.EmptyCsvValuesBecome')">
              <USelect
                v-model="emptyValue"
                class="w-full"
                :items="emptyValueItems"
                value-key="value"
                label-key="label"
              />
            </UFormField>
            <div class="rounded-md border border-default bg-elevated px-3 py-2 text-xs">
              <div>
                <span class="text-muted">{{ t("Chen.Rows") }}:</span>
                {{ parsed.rows.length }}
              </div>
              <div class="mt-1 truncate" :title="parsed.headers.join(', ')">
                <span class="text-muted">{{ t("Chen.Columns") }}:</span>
                {{ parsed.headers.join(", ") }}
              </div>
            </div>
          </div>
          <p class="text-xs text-muted">
            {{ t("Chen.ImportRowsStagedHint") }}
          </p>
        </template>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="soft" @click="visible = false">{{ t("Common.Cancel") }}</UButton>
        <UButton icon="i-lucide-upload" :disabled="!mapped.rows.length" @click="submit">
          {{ mapped.rows.length ? t("Chen.ImportRowCount", { count: mapped.rows.length }) : t("Chen.ImportRows") }}
        </UButton>
      </div>
    </template>
  </ChenWorkspaceModal>
</template>
