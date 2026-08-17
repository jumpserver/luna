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
const emptyValueItems = [
  { label: "Empty string", value: "empty-string" },
  { label: "NULL", value: "null" }
];
const mapped = computed(() => {
  if (!parsed.value) return { rows: [] as Array<Record<string, string | null>>, error: "" };
  try {
    return { rows: mapChenCsvRows(parsed.value, props.fields, emptyValue.value), error: "" };
  } catch (cause) {
    return { rows: [], error: cause instanceof Error ? cause.message : "Unable to map CSV columns" };
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
    error.value = "CSV files larger than 10 MB are not supported";
    return;
  }

  try {
    const result = parseChenCsv(await file.text());
    if (result.rows.length > MAX_CSV_ROWS) {
      throw new Error(`CSV contains ${result.rows.length} rows; the current limit is ${MAX_CSV_ROWS}`);
    }
    parsed.value = result;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "Unable to read CSV file";
  }
}

function submit() {
  if (!mapped.value.rows.length) return;
  emit("confirm", mapped.value.rows);
  visible.value = false;
}
</script>

<template>
  <ChenWorkspaceModal v-model:open="visible" title="Import CSV" :ui="{ content: 'sm:max-w-2xl' }">
    <template #body>
      <div class="space-y-4">
        <input ref="fileInput" type="file" accept=".csv,text/csv" class="hidden" @change="selectFile" />
        <div class="rounded-lg border border-dashed border-default p-4 text-center">
          <UIcon name="i-lucide-file-spreadsheet" class="mx-auto mb-2 size-7 text-muted" />
          <p class="text-sm text-highlighted">{{ fileName || "Choose a CSV file" }}</p>
          <p class="mt-1 text-xs text-muted">
            The first row must contain table column names. Maximum 10 MB / 10,000 rows.
          </p>
          <UButton class="mt-3" size="sm" color="neutral" variant="soft" @click="fileInput?.click()">
            Choose file
          </UButton>
        </div>

        <UAlert
          v-if="error || mapped.error"
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          title="CSV cannot be imported"
          :description="error || mapped.error"
        />

        <template v-if="parsed && !error">
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Empty CSV values become">
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
                <span class="text-muted">Rows:</span>
                {{ parsed.rows.length }}
              </div>
              <div class="mt-1 truncate" :title="parsed.headers.join(', ')">
                <span class="text-muted">Columns:</span>
                {{ parsed.headers.join(", ") }}
              </div>
            </div>
          </div>
          <p class="text-xs text-muted">
            Imported rows are staged in the grid. Review them, then click Save to preview and commit the database
            changes.
          </p>
        </template>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="soft" @click="visible = false">Cancel</UButton>
        <UButton icon="i-lucide-upload" :disabled="!mapped.rows.length" @click="submit">
          {{ mapped.rows.length ? `Import ${mapped.rows.length} rows` : "Import rows" }}
        </UButton>
      </div>
    </template>
  </ChenWorkspaceModal>
</template>
