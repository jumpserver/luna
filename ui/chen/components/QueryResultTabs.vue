<script setup lang="ts">
import type {
  ChenDataViewAction,
  ChenDataViewActionData,
  ChenDataViewExportOptions,
  ChenQueryResultTab
} from "~/chen/types";

import ChenDataGrid from "~/chen/components/DataGrid.client.vue";
import DataViewExportDialog from "~/chen/components/DataViewExportDialog.vue";
import DataViewSavePreviewDialog from "~/chen/components/DataViewSavePreviewDialog.vue";
import DataViewToolbar from "~/chen/components/DataViewToolbar.vue";
import {
  buildChenSaveChangesPayload,
  cancelChenSaveChangesConfirmation,
  chenDataViewHasDirty,
  clearChenDataViewEdits,
  isChenDataViewEditable
} from "~/chen/utils/dataViewEditing";

const props = withDefaults(
  defineProps<{
    resultTabs: ChenQueryResultTab[];
    activeResultTabId: string;
    emptyMessage: string;
    closable?: boolean;
    dataViewActions?: boolean;
    dataViewEditing?: boolean;
    logs?: string[];
    showLogs?: boolean;
    dbType?: string;
    canCopy?: boolean;
  }>(),
  {
    closable: false,
    dataViewActions: false,
    dataViewEditing: false,
    logs: () => [],
    showLogs: false,
    dbType: "",
    canCopy: false
  }
);

const emit = defineEmits<{
  "update:activeResultTabId": [id: string];
  close: [id: string];
  dataViewAction: [result: ChenQueryResultTab, action: ChenDataViewAction, data?: ChenDataViewActionData];
}>();

const exportDialogOpen = ref(false);
const exportTarget = ref<ChenQueryResultTab | null>(null);
const dataGrid = ref<{ stopEditing: () => void } | null>(null);

const activeResult = computed(() => {
  return props.resultTabs.find((item) => item.id === props.activeResultTabId) || null;
});
const activeResultEditable = computed(() => isChenDataViewEditable(activeResult.value?.data));
const activeResultDirty = computed(() =>
  Boolean(activeResult.value && chenDataViewHasDirty(activeResult.value.editState))
);
const activeResultBusy = computed(() => Boolean(activeResult.value?.editState.activeRequest));
const activeResultRefreshRequired = computed(() => activeResult.value?.editState.refreshRequiredBeforeSave === true);
const previewDialogOpen = computed(() => activeResult.value?.editState.previewResult?.success === true);

function emitActiveDataViewAction(action: ChenDataViewAction, data?: number) {
  if (!activeResult.value) return;
  emit("dataViewAction", activeResult.value, action, data);
}

function openExportDialog() {
  if (!activeResult.value) return;
  exportTarget.value = activeResult.value;
  exportDialogOpen.value = true;
}

function submitExport(options: ChenDataViewExportOptions) {
  if (!exportTarget.value) return;
  emit("dataViewAction", exportTarget.value, "export", options);
  exportTarget.value = null;
}

function saveActiveResultChanges() {
  const result = activeResult.value;
  dataGrid.value?.stopEditing();
  if (!result?.data || !activeResultDirty.value || activeResultBusy.value || activeResultRefreshRequired.value) return;
  const payload = buildChenSaveChangesPayload(result.meta, result.data, result.editState);
  result.editState.previewResult = null;
  emit("dataViewAction", result, "save_changes_preview", payload);
}

function confirmSaveChanges() {
  const result = activeResult.value;
  if (!result || result.editState.activeRequest?.kind !== "confirm") return;
  result.editState.previewResult = null;
  emit("dataViewAction", result, "save_changes");
}

function handlePreviewDialogOpen(open: boolean) {
  if (open) return;
  const result = activeResult.value;
  if (!result) return;
  if (result.editState.activeRequest?.kind === "confirm") {
    cancelChenSaveChangesConfirmation(result.editState);
  }
  result.editState.previewResult = null;
}

function cancelActiveResultChanges() {
  const result = activeResult.value;
  if (!result || activeResultBusy.value) return;
  clearChenDataViewEdits(result.editState);
  emit("dataViewAction", result, "refresh");
}
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <div class="shrink-0 border-b border-default px-2 py-1">
      <div class="flex items-center gap-1">
        <button
          v-if="showLogs"
          :disabled="activeResultBusy"
          class="rounded-md px-2 py-1 text-xs"
          :class="!activeResult ? 'bg-accented' : 'text-muted'"
          @click="emit('update:activeResultTabId', '')"
        >
          Log
        </button>
        <div
          v-for="result in resultTabs"
          :key="result.id"
          class="flex items-center rounded-md text-xs"
          :class="activeResultTabId === result.id ? 'bg-accented' : 'text-muted'"
        >
          <button class="px-2 py-1" :disabled="activeResultBusy" @click="emit('update:activeResultTabId', result.id)">
            {{ result.title }}
          </button>
          <button
            v-if="closable"
            class="mr-1 rounded p-0.5 hover:bg-elevated"
            :aria-label="`Close ${result.title}`"
            :disabled="activeResultBusy"
            @click="emit('close', result.id)"
          >
            <UIcon name="i-lucide-x" class="size-3" />
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="showLogs && !activeResult && logs.length"
      class="min-h-0 flex-1 overflow-auto bg-[var(--workspace-surface-sub-panel)] p-3 text-xs text-muted"
    >
      <pre class="whitespace-pre-wrap">{{ logs.join("\n") }}</pre>
    </div>

    <div v-else-if="!activeResult" class="grid min-h-0 flex-1 place-items-center px-6 text-sm text-muted">
      <div class="text-center">
        <UIcon name="i-lucide-table-properties" class="mx-auto mb-2 size-5" />
        <p>{{ emptyMessage }}</p>
      </div>
    </div>

    <div v-else-if="activeResult" :key="activeResult.id" class="flex min-h-0 flex-1 flex-col">
      <div class="flex shrink-0 items-center justify-between border-b border-default px-3 py-2 text-sm">
        <div class="min-w-0 truncate">
          {{ activeResult.title }}
        </div>
        <div class="flex items-center gap-1">
          <template v-if="dataViewEditing && activeResultEditable">
            <UButton
              icon="i-lucide-save"
              size="xs"
              :disabled="activeResultBusy || activeResultRefreshRequired || !activeResultDirty"
              :title="activeResultRefreshRequired ? 'Refresh before saving again' : undefined"
              @click="saveActiveResultChanges"
            >
              Save
            </UButton>
            <UButton
              icon="i-lucide-rotate-ccw"
              size="xs"
              color="neutral"
              variant="soft"
              :disabled="activeResultBusy || !activeResultDirty"
              @click="cancelActiveResultChanges"
            >
              Cancel
            </UButton>
          </template>
          <DataViewToolbar
            v-if="dataViewActions"
            :state="activeResult.state"
            :busy="activeResultBusy"
            pinnable
            @action="emitActiveDataViewAction"
            @export="openExportDialog"
          />
        </div>
      </div>
      <div class="min-h-0 flex-1 overflow-auto">
        <ChenDataGrid
          ref="dataGrid"
          :key="`${activeResult.id}:${activeResult.data?.fields?.map((field) => field.name).join(',') || ''}:${activeResult.data?.data?.length || 0}`"
          :dataset="activeResult.data"
          :meta="activeResult.meta"
          :db-type="dbType"
          :can-copy="canCopy"
          :edit-mode="dataViewEditing && !activeResultBusy ? 'update' : 'none'"
          :edit-state="dataViewEditing ? activeResult.editState : null"
        />
      </div>
    </div>

    <DataViewExportDialog v-if="exportDialogOpen" v-model:open="exportDialogOpen" @confirm="submitExport" />

    <DataViewSavePreviewDialog
      v-if="dataViewEditing && previewDialogOpen && activeResult"
      :open="previewDialogOpen"
      :result="activeResult.editState.previewResult"
      @update:open="handlePreviewDialogOpen"
      @confirm="confirmSaveChanges"
    />
  </div>
</template>
