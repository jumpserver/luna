<script setup lang="ts">
import type {
  ChenDataViewAction,
  ChenDataViewActionData,
  ChenDataViewExportOptions,
  ChenQueryResultTab
} from "~/chen/types";

import ChenDataGrid from "~/chen/components/DataGrid.client.vue";
import DataViewExportDialog from "~/chen/components/DataViewExportDialog.vue";
import DataViewFooter from "~/chen/components/DataViewFooter.vue";
import DataViewSavePreviewDialog from "~/chen/components/DataViewSavePreviewDialog.vue";
import DataViewToolbar from "~/chen/components/DataViewToolbar.vue";
import { chenGridPreferenceKey } from "~/chen/composables/useChenGridPreferences";
import { chenQueryResultLabel } from "~/chen/composables/useChenQueryConsole";
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
    dbType?: string;
    canCopy?: boolean;
  }>(),
  {
    closable: false,
    dataViewActions: false,
    dataViewEditing: false,
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
const gridPreferenceKey = computed(() =>
  chenGridPreferenceKey(
    activeResult.value?.meta,
    activeResult.value?.meta?.title || activeResult.value?.title || activeResult.value?.id || "empty",
    props.dbType
  )
);

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
        <div
          v-for="(result, index) in resultTabs"
          :key="result.id"
          class="flex max-w-48 items-center rounded-md text-xs transition-colors hover:bg-[var(--app-hover-soft)] hover:text-[var(--app-fg)]"
          :class="activeResultTabId === result.id ? 'bg-accented' : 'text-muted'"
          :title="result.title"
        >
          <button
            class="min-w-0 truncate py-1 pl-2"
            :class="closable ? 'pr-1' : 'pr-2'"
            :disabled="activeResultBusy"
            @click="emit('update:activeResultTabId', result.id)"
          >
            {{ chenQueryResultLabel(result, index) }}
          </button>
          <button
            v-if="closable"
            class="mr-1 shrink-0 rounded p-0.5 text-muted transition-colors hover:bg-elevated hover:text-[var(--app-fg)]"
            :aria-label="`Close ${chenQueryResultLabel(result, index)}`"
            :disabled="activeResultBusy"
            @click.stop="emit('close', result.id)"
          >
            <UIcon name="i-lucide-x" class="size-3" />
          </button>
        </div>
      </div>
    </div>

    <div v-if="!activeResult" class="grid min-h-0 flex-1 place-items-center px-6 text-sm text-muted">
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
              v-if="activeResultDirty"
              icon="i-lucide-save"
              size="xs"
              color="primary"
              :disabled="activeResultBusy || activeResultRefreshRequired"
              :title="activeResultRefreshRequired ? 'Refresh before saving again' : undefined"
              @click="saveActiveResultChanges"
            >
              Save
            </UButton>
            <UButton
              v-if="activeResultDirty"
              icon="i-lucide-rotate-ccw"
              size="xs"
              color="neutral"
              variant="soft"
              :disabled="activeResultBusy"
              @click="cancelActiveResultChanges"
            >
              Cancel
            </UButton>
          </template>
          <DataViewToolbar
            v-if="dataViewActions && activeResult.affectedRows === undefined"
            :state="activeResult.state"
            :fields="activeResult.data?.fields || []"
            :grid-preference-key="gridPreferenceKey"
            :busy="activeResultBusy"
            pinnable
            @action="emitActiveDataViewAction"
            @export="openExportDialog"
          />
        </div>
      </div>
      <div
        v-if="activeResult.affectedRows !== undefined"
        class="grid min-h-0 flex-1 place-items-center px-6 text-sm text-muted"
      >
        <div class="text-center">
          <UIcon name="i-lucide-circle-check" class="mx-auto mb-2 size-6 text-success" />
          <p class="font-medium text-default">Statement executed successfully</p>
        </div>
      </div>
      <div v-else class="min-h-0 flex-1 overflow-auto">
        <ChenDataGrid
          ref="dataGrid"
          :key="`${activeResult.id}:${activeResult.data?.fields?.map((field) => field.name).join(',') || ''}:${activeResult.data?.data?.length || 0}`"
          :dataset="activeResult.data"
          :meta="activeResult.meta"
          :db-type="dbType"
          :can-copy="canCopy"
          :edit-mode="dataViewEditing && !activeResultBusy ? 'update' : 'none'"
          :edit-state="dataViewEditing ? activeResult.editState : null"
          :grid-preference-key="gridPreferenceKey"
        />
      </div>
      <DataViewFooter
        :state="activeResult.state"
        :row-count="activeResult.data?.data?.length || 0"
        :affected-rows="activeResult.affectedRows"
        :busy="activeResultBusy"
        @action="emitActiveDataViewAction"
      />
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
