<script setup lang="ts">
import type {
  ChenDataViewAction,
  ChenDataViewActionData,
  ChenDataViewConsoleTab,
  ChenDataViewExportOptions,
  ChenDataViewPropertyTab
} from "~/chen/types";

import ChenDataGrid from "~/chen/components/DataGrid.client.vue";
import DataViewExportDialog from "~/chen/components/DataViewExportDialog.vue";
import DataViewSavePreviewDialog from "~/chen/components/DataViewSavePreviewDialog.vue";
import DataViewToolbar from "~/chen/components/DataViewToolbar.vue";
import { useChenDataViewDerivedMeta } from "~/chen/composables/useChenDataViewDerivedMeta";
import { useChenDataViewEditing } from "~/chen/composables/useChenDataViewEditing";

const props = withDefaults(
  defineProps<{
    tab: ChenDataViewConsoleTab;
    dbType?: string;
    protocol?: string;
    canCopy?: boolean;
  }>(),
  {
    dbType: "",
    protocol: "",
    canCopy: false
  }
);

const emit = defineEmits<{
  dataViewAction: [tab: ChenDataViewConsoleTab, action: ChenDataViewAction, data?: ChenDataViewActionData];
  updatePanel: [tab: ChenDataViewConsoleTab, panel: "data" | "properties"];
  updatePropertyTab: [tab: ChenDataViewConsoleTab, propertyTab: ChenDataViewPropertyTab];
}>();

const exportDialogOpen = ref(false);
const exportTarget = ref<ChenDataViewConsoleTab | null>(null);
const dataGrid = ref<{ stopEditing: () => void } | null>(null);
const selectedRows = ref<Array<Record<string, any>>>([]);
const editing = useChenDataViewEditing(() => props.tab);
const editState = computed(() => props.tab.editState);
const previewDialogOpen = computed(() => editState.value.previewResult?.success === true);

const dbTypeRef = computed(() => props.dbType);
const protocolRef = computed(() => props.protocol);
const {
  dataViewBasicInfo,
  dataViewColumns,
  dataViewConstraints,
  dataViewDDL,
  dataViewForeignKeys,
  dataViewIndexes,
  dataViewPropertyTabs
} = useChenDataViewDerivedMeta(dbTypeRef, protocolRef);

function openExportDialog() {
  exportTarget.value = props.tab;
  exportDialogOpen.value = true;
}

function submitExport(options: ChenDataViewExportOptions) {
  if (!exportTarget.value) return;
  emit("dataViewAction", exportTarget.value, "export", options);
  exportTarget.value = null;
}

function addRow() {
  if (editing.busy.value) return;
  editing.addRow();
  selectedRows.value = [];
}

function deleteRows() {
  if (editing.busy.value) return;
  editing.deleteRows(selectedRows.value);
  selectedRows.value = [];
}

function saveChangesPreview() {
  dataGrid.value?.stopEditing();
  const payload = editing.buildPayload();
  if (!payload || !editing.dirty.value || editing.busy.value || editing.refreshRequiredBeforeSave.value) return;
  editState.value.previewResult = null;
  emit("dataViewAction", props.tab, "save_changes_preview", payload);
}

function confirmSaveChanges() {
  if (editState.value.activeRequest?.kind !== "confirm") return;
  editState.value.previewResult = null;
  emit("dataViewAction", props.tab, "save_changes");
}

function handlePreviewDialogOpen(open: boolean) {
  if (open) return;
  if (editState.value.activeRequest?.kind === "confirm") editing.cancelSaveConfirmation();
  editState.value.previewResult = null;
}

function cancelChanges() {
  if (editing.busy.value) return;
  editing.clear();
  selectedRows.value = [];
  emit("dataViewAction", props.tab, "refresh");
}

function selectPropertyTab(propertyTab: ChenDataViewPropertyTab) {
  emit("updatePanel", props.tab, "properties");
  emit("updatePropertyTab", props.tab, propertyTab);
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex items-center gap-1 overflow-x-auto border-b border-default px-2 py-1">
      <div class="flex shrink-0 items-center gap-1">
        <button
          class="rounded-md px-2 py-1 text-xs"
          :class="tab.activePanel === 'data' ? 'bg-accented' : 'text-muted'"
          @click="emit('updatePanel', tab, 'data')"
        >
          Data
        </button>
        <button
          v-for="propertyTab in dataViewPropertyTabs"
          :key="propertyTab.id"
          class="rounded-md px-2 py-1 text-xs"
          :class="
            tab.activePanel === 'properties' && tab.activePropertyTab === propertyTab.id ? 'bg-accented' : 'text-muted'
          "
          @click="selectPropertyTab(propertyTab.id)"
        >
          {{ propertyTab.label }}
        </button>
      </div>
    </div>

    <div v-if="tab.activePanel === 'data'" class="flex min-h-0 flex-1 flex-col">
      <div class="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-default px-2 py-1">
        <div v-if="editing.editable.value" class="flex shrink-0 items-center gap-1">
          <UButton
            v-if="editing.insertable.value"
            icon="i-lucide-plus"
            size="xs"
            color="neutral"
            variant="soft"
            :disabled="editing.busy.value"
            @click="addRow"
          >
            Add row
          </UButton>
          <UButton
            icon="i-lucide-trash-2"
            size="xs"
            color="neutral"
            variant="soft"
            :disabled="editing.busy.value || selectedRows.length === 0"
            @click="deleteRows"
          >
            Delete row
          </UButton>
          <UButton
            icon="i-lucide-save"
            size="xs"
            :disabled="editing.busy.value || editing.refreshRequiredBeforeSave.value || !editing.dirty.value"
            :title="editing.refreshRequiredBeforeSave.value ? 'Refresh before saving again' : undefined"
            @click="saveChangesPreview"
          >
            Save
          </UButton>
          <UButton
            icon="i-lucide-rotate-ccw"
            size="xs"
            color="neutral"
            variant="soft"
            :disabled="editing.busy.value || !editing.dirty.value"
            @click="cancelChanges"
          >
            Cancel
          </UButton>
        </div>
        <DataViewToolbar
          class="ml-auto shrink-0"
          :state="tab.state"
          :busy="editing.busy.value"
          @action="(action, data) => emit('dataViewAction', tab, action, data)"
          @export="openExportDialog"
        />
      </div>

      <div class="min-h-0 flex-1 overflow-auto">
        <ChenDataGrid
          ref="dataGrid"
          :key="`${tab.id}:${tab.data?.fields?.map((field) => field.name).join(',') || ''}:${tab.data?.data?.length || 0}`"
          :dataset="tab.data"
          :meta="tab.meta"
          :db-type="dbType"
          :can-copy="canCopy"
          :edit-mode="editing.busy.value ? 'none' : 'full'"
          :edit-state="tab.editState"
          @selection-change="selectedRows = $event"
        />
      </div>
    </div>

    <div v-else class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div v-if="tab.activePropertyTab === 'basic'" class="grid min-h-0 flex-1 gap-3 overflow-auto p-4 md:grid-cols-2">
        <div
          v-for="item in dataViewBasicInfo(tab)"
          :key="item.label"
          class="rounded-lg border border-default bg-[var(--workspace-surface-sub-panel)] px-3 py-2"
        >
          <div class="mb-1 text-[11px] uppercase tracking-wide text-muted">
            {{ item.label }}
          </div>
          <div class="text-sm">
            {{ item.value }}
          </div>
        </div>
      </div>

      <div v-else-if="tab.activePropertyTab === 'columns'" class="min-h-0 flex-1 overflow-auto p-3">
        <div class="overflow-hidden rounded-lg border border-default">
          <table class="w-full text-left text-sm">
            <thead class="bg-[var(--workspace-surface-sub-panel)] text-muted">
              <tr>
                <th class="px-3 py-2 font-medium">Name</th>
                <th class="px-3 py-2 font-medium">Type</th>
                <th class="px-3 py-2 font-medium">Nullable</th>
                <th class="px-3 py-2 font-medium">Key</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="column in dataViewColumns(tab)" :key="column.name" class="border-t border-default">
                <td class="px-3 py-2">
                  {{ column.name }}
                </td>
                <td class="px-3 py-2 text-muted">
                  {{ column.type }}
                </td>
                <td class="px-3 py-2 text-muted">
                  {{ column.nullable }}
                </td>
                <td class="px-3 py-2 text-muted">
                  {{ column.key }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else-if="tab.activePropertyTab === 'indexes'" class="min-h-0 flex-1 overflow-auto p-3">
        <div class="overflow-hidden rounded-lg border border-default">
          <table class="w-full text-left text-sm">
            <thead class="bg-[var(--workspace-surface-sub-panel)] text-muted">
              <tr>
                <th class="px-3 py-2 font-medium">Name</th>
                <th class="px-3 py-2 font-medium">Columns</th>
                <th class="px-3 py-2 font-medium">Unique</th>
                <th class="px-3 py-2 font-medium">Method</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="index in dataViewIndexes(tab)" :key="index.name" class="border-t border-default">
                <td class="px-3 py-2">
                  {{ index.name }}
                </td>
                <td class="px-3 py-2 text-muted">
                  {{ index.columns }}
                </td>
                <td class="px-3 py-2 text-muted">
                  {{ index.unique }}
                </td>
                <td class="px-3 py-2 text-muted">
                  {{ index.method }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else-if="tab.activePropertyTab === 'foreignKeys'" class="min-h-0 flex-1 overflow-auto p-3">
        <div v-if="dataViewForeignKeys(tab).length" class="overflow-hidden rounded-lg border border-default">
          <table class="w-full text-left text-sm">
            <thead class="bg-[var(--workspace-surface-sub-panel)] text-muted">
              <tr>
                <th class="px-3 py-2 font-medium">Name</th>
                <th class="px-3 py-2 font-medium">Column</th>
                <th class="px-3 py-2 font-medium">References</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="foreignKey in dataViewForeignKeys(tab)" :key="foreignKey.name" class="border-t border-default">
                <td class="px-3 py-2">
                  {{ foreignKey.name }}
                </td>
                <td class="px-3 py-2 text-muted">
                  {{ foreignKey.column }}
                </td>
                <td class="px-3 py-2 text-muted">
                  {{ foreignKey.references }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="grid h-full place-items-center text-sm text-muted">No foreign keys in preview.</div>
      </div>

      <div v-else-if="tab.activePropertyTab === 'constraints'" class="min-h-0 flex-1 overflow-auto p-3">
        <div class="overflow-hidden rounded-lg border border-default">
          <table class="w-full text-left text-sm">
            <thead class="bg-[var(--workspace-surface-sub-panel)] text-muted">
              <tr>
                <th class="px-3 py-2 font-medium">Name</th>
                <th class="px-3 py-2 font-medium">Type</th>
                <th class="px-3 py-2 font-medium">Definition</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="constraint in dataViewConstraints(tab)" :key="constraint.name" class="border-t border-default">
                <td class="px-3 py-2">
                  {{ constraint.name }}
                </td>
                <td class="px-3 py-2 text-muted">
                  {{ constraint.type }}
                </td>
                <td class="px-3 py-2 font-ui-mono text-xs text-muted">
                  {{ constraint.definition }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else class="min-h-0 flex-1 overflow-auto p-3">
        <pre
          class="rounded-lg border border-default bg-[var(--workspace-surface-sub-panel)] p-3 font-ui-mono text-xs text-[var(--app-fg)]"
          >{{ dataViewDDL(tab) }}</pre>
      </div>
    </div>

    <DataViewExportDialog v-if="exportDialogOpen" v-model:open="exportDialogOpen" @confirm="submitExport" />

    <DataViewSavePreviewDialog
      v-if="previewDialogOpen"
      :open="previewDialogOpen"
      :result="tab.editState.previewResult"
      @update:open="handlePreviewDialogOpen"
      @confirm="confirmSaveChanges"
    />
  </div>
</template>
