<script setup lang="ts">
import type { ChenGoApi, GoEditColumn, GoEditPlan, GoSession } from "./api";
import type { QueryWorkspaceTab } from "./workspace";
import type { ChenDataViewField } from "~/chen/types";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import DataViewBatchUpdateDialog from "~/chen/components/DataViewBatchUpdateDialog.vue";
import DataViewImportDialog from "~/chen/components/DataViewImportDialog.vue";
import { chenErrorText } from "~/chen/utils/errorMessages";
import { executionActive } from "./api";
import {
  clearEditDraft,
  editChanges,
  editDirty,
  editDraftRows,
  editPayloadBytes,
  editRowRef,
  GO_EDIT_LIMIT,
  GO_EDIT_MAX_BYTES,
  stageDeleteRows,
  stageEditCell
} from "./dataEditing";
import GoResultGrid from "./GoResultGrid.client.vue";
import { newChenRequestId } from "./requestId";

const props = defineProps<{ query: QueryWorkspaceTab; session: GoSession; api: ChenGoApi }>();
const emit = defineEmits<{ apply: [plan: GoEditPlan]; refresh: [] }>();
const { t } = useI18n();
const error = ref("");
const selected = ref<number[]>([]);
const metadataBusy = ref(false);
const previewOpen = ref(false);
const csvOpen = ref(false);
const batchOpen = ref(false);
const draft = computed(() => props.query.edit);
const dirty = computed(() => editDirty(draft.value));
const count = computed(() => editChanges(draft.value).length);
const policyPending = computed(
  () =>
    props.query.executionEditPlan === draft.value.plan?.plan_id &&
    ["command_review_required", "command_warning_confirmation_required"].includes(
      props.query.execution?.error?.code || ""
    )
);
const cannotDiscard = computed(
  () => props.query.busy || !!props.query.pending || draft.value.busy || executionActive(props.query.execution)
);
const locked = computed(
  () =>
    props.session.state !== "ready" ||
    props.query.console?.state !== "ready" ||
    props.query.busy ||
    props.query.loadingRows ||
    !!props.query.pending ||
    executionActive(props.query.execution) ||
    draft.value.busy ||
    previewOpen.value ||
    draft.value.refreshRequired ||
    policyPending.value
);
const supported = computed(() => draft.value.metadata?.supported === true);
const canChange = computed(() => supported.value && !locked.value);
const canInsert = computed(
  () =>
    canChange.value &&
    draft.value.metadata?.mode === "table" &&
    draft.value.metadata.columns.some((column) => column.insertable)
);
const rows = computed(() => editDraftRows(draft.value, props.query.rows!));
const changedCells = computed(() =>
  props.query.rows!.rows.flatMap((_, index) => {
    const ref = editRowRef(draft.value, props.query.rows!, index);
    return Object.keys((ref && draft.value.changes[ref]?.values) || {}).map((column) => `${index}:${column}`);
  })
);
const defaultCells = computed(() =>
  draft.value.inserts.flatMap((row, index) =>
    props.query.rows!.columns.flatMap((_, column) =>
      Object.hasOwn(row.values, column) ? [] : [`${index + props.query.rows!.rows.length}:${column}`]
    )
  )
);
const deletedRows = computed(() =>
  props.query.rows!.rows.flatMap((_, index) => {
    const ref = editRowRef(draft.value, props.query.rows!, index);
    return ref && draft.value.changes[ref]?.op === "delete" ? [index] : [];
  })
);
const asField = (column: GoEditColumn): ChenDataViewField => ({
  name: column.name,
  sourceColumn: column.name,
  type: column.data_type,
  nullable: column.nullable,
  insertable: column.insertable,
  editable: column.editable
});
const insertFields = computed(() => (draft.value.metadata?.columns || []).map(asField));
const updateFields = computed(() =>
  (draft.value.metadata?.columns || []).filter((column) => column.editable).map(asField)
);
let controller: AbortController | undefined;
async function loadMetadata() {
  if (!props.query.console || !props.query.rows || dirty.value || props.session.state !== "ready") return;
  controller?.abort();
  controller = new AbortController();
  const current = controller;
  const rowSet = props.query.rows;
  metadataBusy.value = true;
  draft.value.metadata = null;
  try {
    const metadata = await props.api.editMetadata(
      props.query.console.id,
      rowSet.id,
      rowSet.offset,
      Math.max(1, rowSet.rows.length),
      current.signal
    );
    if (!current.signal.aborted && props.query.rows === rowSet) draft.value.metadata = metadata;
  } catch (cause) {
    if (!current.signal.aborted) error.value = chenErrorText(cause, t);
  } finally {
    if (!current.signal.aborted) metadataBusy.value = false;
  }
}
watch(
  () => [props.query.rows?.id, props.query.rows?.offset, props.query.console?.id],
  () => void loadMetadata(),
  { immediate: true }
);
onBeforeUnmount(() => controller?.abort());
function addRow() {
  if (!canInsert.value || count.value >= GO_EDIT_LIMIT) return;
  draft.value.inserts.push({ id: newChenRequestId(), values: {} });
  draft.value.plan = null;
}
function deleteRows() {
  if (!canChange.value || !props.query.rows) return;
  if (!stageDeleteRows(draft.value, props.query.rows, selected.value)) error.value = t("Chen.GoWriteLimit");
  selected.value = [];
}
const cell = ref<{ row: number; column: GoEditColumn } | null>(null);
const cellValue = ref("");
const cellMode = ref("value");
const cellModes = computed(() => [
  { value: "value", label: t("Chen.Value") },
  ...(cell.value?.column.nullable ? [{ value: "null", label: "NULL" }] : []),
  ...(cell.value && cell.value.row >= props.query.rows!.rows.length ? [{ value: "default", label: "DEFAULT" }] : [])
]);
function editCell(row: number, columnIndex: number) {
  if (!canChange.value) return;
  const column = draft.value.metadata?.columns.find((item) => item.index === columnIndex);
  if (!column) return;
  cell.value = { row, column };
  const value = rows.value.rows[row]?.[columnIndex];
  cellValue.value = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  cellMode.value = value === undefined ? "default" : value === null ? "null" : "value";
}
function saveCell() {
  if (!cell.value || !canChange.value) return;
  const { row, column } = cell.value;
  if (cellMode.value === "default") {
    const insertion = draft.value.inserts[row - props.query.rows!.rows.length];
    if (insertion) {
      delete insertion.values[column.index];
      draft.value.plan = null;
    }
  } else if (
    !stageEditCell(
      draft.value,
      props.query.rows!,
      row,
      column.index,
      cellMode.value === "null" ? null : cellValue.value
    )
  ) {
    error.value = t("Chen.GoWriteLimit");
    return;
  }
  cell.value = null;
}
function batch(field: ChenDataViewField, value: unknown) {
  if (!canChange.value) return;
  const column = draft.value.metadata?.columns.find((item) => item.name === field.name);
  if (!column) return;
  for (const row of selected.value) {
    if (!stageEditCell(draft.value, props.query.rows!, row, column.index, value === null ? null : String(value))) {
      error.value = t("Chen.GoWriteLimit");
      break;
    }
  }
}
function importRows(values: Record<string, string | null>[]) {
  if (!canInsert.value || !props.session.permissions.can_upload || Object.keys(draft.value.changes).length) return;
  if (count.value + values.length > GO_EDIT_LIMIT) {
    error.value = t("Chen.GoWriteLimit");
    return;
  }
  const columns = draft.value.metadata!.columns;
  draft.value.inserts.push(
    ...values.map((row) => ({
      id: newChenRequestId(),
      values: Object.fromEntries(
        Object.entries(row).map(([name, value]) => [columns.find((column) => column.name === name)!.index, value])
      )
    }))
  );
  draft.value.source = "csv";
  draft.value.plan = null;
}
async function preview() {
  if (!canChange.value || !dirty.value || !props.query.console || !props.query.rows) return;
  if (editPayloadBytes(editChanges(draft.value), draft.value.source) > GO_EDIT_MAX_BYTES) {
    error.value = t("Chen.GoWritePayloadLimit");
    return;
  }
  draft.value.busy = true;
  error.value = "";
  try {
    draft.value.plan = await props.api.previewEdits(
      props.query.console.id,
      props.query.rows.id,
      editChanges(draft.value),
      draft.value.source
    );
    previewOpen.value = true;
  } catch (cause) {
    error.value = chenErrorText(cause, t);
  } finally {
    draft.value.busy = false;
  }
}
function apply() {
  if (
    !draft.value.plan ||
    props.session.state !== "ready" ||
    draft.value.busy ||
    props.query.busy ||
    props.query.pending ||
    executionActive(props.query.execution)
  )
    return;
  previewOpen.value = false;
  emit("apply", draft.value.plan);
}
function discard() {
  if (cannotDiscard.value) return;
  clearEditDraft(draft.value);
  error.value = "";
}
</script>

<template>
  <div
    class="flex min-h-0 flex-1 flex-col"
    data-chen-write-panel
    @copy.capture="
      (event) => {
        if (!session.permissions.can_copy) event.preventDefault();
      }
    "
    @paste.capture="
      (event) => {
        if (!session.permissions.can_paste) event.preventDefault();
      }
    "
  >
    <div class="flex shrink-0 flex-wrap items-center gap-1 border-b border-default px-2 py-1">
      <template v-if="supported">
        <UButton
          v-if="draft.metadata?.mode === 'table'"
          icon="i-lucide-plus"
          size="xs"
          color="neutral"
          variant="ghost"
          :label="t('Chen.AddRow')"
          :disabled="!canInsert || count >= GO_EDIT_LIMIT"
          @click="addRow"
        />
        <UButton
          v-if="draft.metadata?.mode === 'table'"
          icon="i-lucide-trash-2"
          size="xs"
          color="neutral"
          variant="ghost"
          :label="t('Chen.DeleteRow')"
          :disabled="
            !canChange ||
            !selected.length ||
            (draft.source === 'csv' && selected.some((row) => row < query.rows!.rows.length))
          "
          @click="deleteRows"
        />
        <UButton
          icon="i-lucide-list-restart"
          size="xs"
          color="neutral"
          variant="ghost"
          :label="t('Chen.UpdateRows')"
          :disabled="
            !canChange ||
            !selected.length ||
            !updateFields.length ||
            (draft.source === 'csv' && selected.some((row) => row < query.rows!.rows.length))
          "
          @click="batchOpen = true"
        />
        <UButton
          v-if="draft.metadata?.mode === 'table' && session.permissions.can_upload"
          icon="i-lucide-upload"
          size="xs"
          color="neutral"
          variant="ghost"
          :label="t('Chen.ImportCsv')"
          :disabled="!canInsert || count >= GO_EDIT_LIMIT || Object.keys(draft.changes).length > 0"
          :title="t('Chen.GoWriteCsvBatchHint')"
          @click="csvOpen = true"
        />
        <UButton
          v-if="dirty"
          icon="i-lucide-eye"
          size="xs"
          :label="t('Chen.PreviewAndSave')"
          :loading="draft.busy"
          :disabled="!canChange"
          @click="preview"
        />
        <UButton
          v-if="dirty"
          icon="i-lucide-undo-2"
          size="xs"
          color="neutral"
          variant="ghost"
          :label="t('Common.Cancel')"
          :disabled="cannotDiscard"
          @click="discard"
        />
        <span class="text-xs text-muted">
          {{ dirty ? t("Chen.GoWritePending", { count, limit: GO_EDIT_LIMIT }) : t("Chen.GoWriteGridHint") }}
        </span>
      </template>
      <span v-else class="text-xs text-muted">
        {{ metadataBusy ? t("Chen.LoadingTableMetadata") : t("Chen.GoWriteReadonly") }}
        <template v-if="draft.metadata?.reason">
          · {{ chenErrorText(draft.metadata.reason, t, "edit_unavailable") }}
        </template>
      </span>
      <UButton
        class="ml-auto"
        icon="i-lucide-refresh-cw"
        size="xs"
        color="neutral"
        variant="ghost"
        :label="t('Chen.RefreshData')"
        :disabled="
          query.loadingRows ||
          dirty ||
          query.busy ||
          !!query.pending ||
          executionActive(query.execution) ||
          session.state !== 'ready'
        "
        @click="emit('refresh')"
      />
    </div>
    <p v-if="draft.source === 'csv'" class="px-3 py-1 text-xs text-muted">{{ t("Chen.GoWriteCsvBatchHint") }}</p>
    <p v-if="error" role="alert" class="px-3 py-2 text-xs text-error">{{ error }}</p>
    <p v-if="draft.status" role="status" class="px-3 py-2 text-xs text-warning">
      {{ t(`Chen.GoWriteOutcome_${draft.status}`) }}
    </p>
    <p v-if="draft.refreshRequired" class="px-3 pb-2 text-xs text-warning">{{ t("Chen.GoWriteRefreshRequired") }}</p>
    <GoResultGrid
      :rows="rows"
      :can-copy="session.permissions.can_copy"
      :editable-columns="
        canChange && draft.source !== 'csv'
          ? draft.metadata?.columns.filter((column) => column.editable).map((column) => column.index)
          : []
      "
      :insertable-columns="
        canInsert ? draft.metadata?.columns.filter((column) => column.insertable).map((column) => column.index) : []
      "
      :original-row-count="query.rows!.rows.length"
      :changed-cells="changedCells"
      :default-cells="defaultCells"
      :deleted-rows="deletedRows"
      class="min-h-0 flex-1"
      @selection="selected = $event"
      @edit="editCell"
    />
    <DataViewImportDialog
      v-if="csvOpen"
      v-model:open="csvOpen"
      :fields="insertFields"
      :max-rows="GO_EDIT_LIMIT - count"
      @confirm="importRows"
    />
    <DataViewBatchUpdateDialog
      v-if="batchOpen"
      v-model:open="batchOpen"
      :fields="updateFields"
      :row-count="selected.length"
      @confirm="batch"
    />
    <UModal
      :open="!!cell"
      :title="t('Chen.GoWriteEditCell')"
      @update:open="
        (value) => {
          if (!value) cell = null;
        }
      "
    >
      <template #body>
        <div
          class="space-y-3"
          @copy.capture="
            (event) => {
              if (!session.permissions.can_copy) event.preventDefault();
            }
          "
          @paste.capture="
            (event) => {
              if (!session.permissions.can_paste) event.preventDefault();
            }
          "
        >
          <p class="text-sm">{{ cell?.column.name }} · {{ cell?.column.data_type }}</p>
          <USelect v-model="cellMode" :items="cellModes" class="w-full" />
          <UTextarea
            v-model="cellValue"
            class="w-full font-ui-mono"
            :rows="8"
            :disabled="cellMode !== 'value'"
            :aria-label="t('Chen.Value')"
          />
          <p class="text-xs text-muted">{{ t("Chen.GoWriteCellHint") }}</p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('Common.Cancel')" @click="cell = null" />
          <UButton :label="t('Chen.GoWriteStage')" :disabled="!canChange" @click="saveCell" />
        </div>
      </template>
    </UModal>
    <UModal v-model:open="previewOpen" :title="t('Chen.SaveChanges')" :ui="{ content: 'sm:max-w-4xl' }">
      <template #body>
        <div
          class="space-y-3"
          @copy.capture="
            (event) => {
              if (!session.permissions.can_copy) event.preventDefault();
            }
          "
          @paste.capture="
            (event) => {
              if (!session.permissions.can_paste) event.preventDefault();
            }
          "
        >
          <p class="text-sm">{{ t("Chen.GoWritePreviewHint") }}</p>
          <p class="text-xs">
            {{ t("Chen.Updates") }}: {{ draft.plan?.update_count }} · {{ t("Chen.Inserts") }}:
            {{ draft.plan?.insert_count }} · {{ t("Chen.Deletes") }}: {{ draft.plan?.delete_count }}
          </p>
          <pre class="max-h-[50vh] overflow-auto rounded bg-elevated p-3 font-ui-mono text-xs">{{
            draft.plan?.sql
          }}</pre>
          <p class="text-xs text-warning">{{ t("Chen.GoWriteTransactionHint") }}</p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('Common.Cancel')" @click="previewOpen = false" />
          <UButton
            icon="i-lucide-save"
            :label="t('Chen.SaveChanges')"
            :disabled="session.state !== 'ready' || query.console?.state !== 'ready' || query.busy || !!query.pending"
            @click="apply"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
