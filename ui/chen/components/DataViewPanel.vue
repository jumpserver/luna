<script setup lang="ts">
import type {
  ChenDataViewColumnPreview,
  ChenDataViewIndexPreview
} from "~/chen/composables/useChenDataViewDerivedMeta";
import type {
  ChenDataViewAction,
  ChenDataViewActionData,
  ChenDataViewConsoleTab,
  ChenDataViewExportOptions,
  ChenDataViewPropertyTab
} from "~/chen/types";

import ChenDataGrid from "~/chen/components/DataGrid.client.vue";
import DataViewBatchUpdateDialog from "~/chen/components/DataViewBatchUpdateDialog.vue";
import DataViewCreateIndexDialog from "~/chen/components/DataViewCreateIndexDialog.vue";
import DataViewDiagram from "~/chen/components/DataViewDiagram.vue";
import DataViewExportDialog from "~/chen/components/DataViewExportDialog.vue";
import DataViewFilter from "~/chen/components/DataViewFilter.client.vue";
import DataViewSavePreviewDialog from "~/chen/components/DataViewSavePreviewDialog.vue";
import DataViewToolbar from "~/chen/components/DataViewToolbar.vue";
import SqlPreviewDialog from "~/chen/components/SqlPreviewDialog.vue";
import ChenWorkspaceModal from "~/chen/components/WorkspaceModal.vue";
import { useChenDataViewDerivedMeta } from "~/chen/composables/useChenDataViewDerivedMeta";
import { useChenDataViewEditing } from "~/chen/composables/useChenDataViewEditing";
import { chenGridPreferenceKey } from "~/chen/composables/useChenGridPreferences";
import { buildChenDropIndexSql, chenSupportsIndexDdl } from "~/chen/utils/indexSql";

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
  updateWhereCondition: [tab: ChenDataViewConsoleTab, condition: string];
  editStructure: [tab: ChenDataViewConsoleTab, columns: ChenDataViewColumnPreview[]];
  executeIndexSql: [
    tab: ChenDataViewConsoleTab,
    sql: string,
    operation: "create" | "drop",
    indexName: string
  ];
}>();

const exportDialogOpen = ref(false);
const batchUpdateDialogOpen = ref(false);
const createIndexDialogOpen = ref(false);
const indexDetailsOpen = ref(false);
const dropIndexPreviewOpen = ref(false);
const selectedIndex = ref<ChenDataViewIndexPreview | null>(null);
const exportTarget = ref<ChenDataViewConsoleTab | null>(null);
const dataGrid = ref<{ stopEditing: () => void } | null>(null);
const selectedRows = ref<Array<Record<string, any>>>([]);
const editing = useChenDataViewEditing(() => props.tab);
const editState = computed(() => props.tab.editState);
const previewDialogOpen = computed(() => editState.value.previewResult?.success === true);
const gridPreferenceKey = computed(() => chenGridPreferenceKey(props.tab.meta, props.tab.id, props.dbType));
const editableFields = computed(() => (props.tab.data?.fields || []).filter((field) => field.editable === true));
const tableName = computed(() => String(props.tab.meta?.table || props.tab.meta?.title || props.tab.title).trim());
const schemaName = computed(() => String(props.tab.meta?.schema || "").trim());
const indexDdlSupported = computed(() => chenSupportsIndexDdl(props.dbType));
const dropIndexSql = computed(() =>
  selectedIndex.value
    ? buildChenDropIndexSql(schemaName.value, tableName.value, selectedIndex.value.name, props.dbType)
    : ""
);

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
const tableColumns = computed(() => dataViewColumns(props.tab).map((column) => column.name).filter((name) => name !== "-"));

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

function updateRows(field: (typeof editableFields.value)[number], value: unknown) {
  if (editing.busy.value || selectedRows.value.length === 0) return;
  editing.updateRows(selectedRows.value, field, value);
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

function showIndexDetails(index: ChenDataViewIndexPreview) {
  selectedIndex.value = index;
  indexDetailsOpen.value = true;
}

function previewDropIndex(index: ChenDataViewIndexPreview) {
  if (index.protected || index.inferred) return;
  selectedIndex.value = index;
  dropIndexPreviewOpen.value = true;
}

function createIndex(sql: string, indexName: string) {
  emit("executeIndexSql", props.tab, sql, "create", indexName);
}

function dropIndex() {
  if (!selectedIndex.value || selectedIndex.value.protected || selectedIndex.value.inferred) return;
  dropIndexPreviewOpen.value = false;
  emit("executeIndexSql", props.tab, dropIndexSql.value, "drop", selectedIndex.value.name);
}

function applyWhereCondition() {
  if (editing.busy.value || props.tab.state.loading) return;
  emit("dataViewAction", props.tab, "change_filter", props.tab.whereCondition.trim());
}

function clearWhereCondition() {
  if (editing.busy.value || props.tab.state.loading) return;
  emit("updateWhereCondition", props.tab, "");
  emit("dataViewAction", props.tab, "change_filter", "");
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex flex-wrap items-center gap-1 border-b border-default px-2 py-1">
      <div class="flex flex-wrap items-center gap-1">
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
      <div class="flex shrink-0 items-center gap-1.5 border-b border-default px-2 py-1">
        <UIcon name="i-lucide-list-filter" class="size-4 shrink-0 text-muted" />
        <span class="shrink-0 font-mono text-xs font-medium text-muted">WHERE</span>
        <DataViewFilter
          :model-value="tab.whereCondition"
          :fields="tab.data?.fields || []"
          :table="tab.meta?.table || tab.meta?.title || ''"
          :db-type="dbType"
          :disabled="editing.busy.value || tab.state.loading"
          @update:model-value="emit('updateWhereCondition', tab, $event)"
          @apply="applyWhereCondition"
          @clear="clearWhereCondition"
        />
        <UButton
          size="xs"
          icon="i-lucide-play"
          color="neutral"
          variant="soft"
          aria-label="Apply WHERE condition"
          title="Apply WHERE condition (Enter)"
          :disabled="editing.busy.value || tab.state.loading"
          @click="applyWhereCondition"
        >
          Apply
        </UButton>
      </div>
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
            v-if="editableFields.length"
            icon="i-lucide-list-restart"
            size="xs"
            color="neutral"
            variant="soft"
            :disabled="editing.busy.value || selectedRows.length === 0"
            @click="batchUpdateDialogOpen = true"
          >
            Update rows
          </UButton>
          <UButton
            v-if="editing.dirty.value"
            icon="i-lucide-save"
            size="xs"
            color="primary"
            :disabled="editing.busy.value || editing.refreshRequiredBeforeSave.value"
            :title="editing.refreshRequiredBeforeSave.value ? 'Refresh before saving again' : undefined"
            @click="saveChangesPreview"
          >
            Save
          </UButton>
          <UButton
            v-if="editing.dirty.value"
            icon="i-lucide-rotate-ccw"
            size="xs"
            color="neutral"
            variant="soft"
            :disabled="editing.busy.value"
            @click="cancelChanges"
          >
            Cancel
          </UButton>
        </div>
        <DataViewToolbar
          class="ml-auto shrink-0"
          :state="tab.state"
          :fields="tab.data?.fields || []"
          :grid-preference-key="gridPreferenceKey"
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
          :grid-preference-key="gridPreferenceKey"
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
        <div class="mb-2 flex justify-end">
          <UButton
            icon="i-lucide-table-properties"
            size="xs"
            color="neutral"
            variant="soft"
            @click="emit('editStructure', tab, dataViewColumns(tab))"
          >
            Edit structure
          </UButton>
        </div>
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
        <div class="mb-2 flex items-center justify-between gap-3">
          <p class="text-xs text-muted">
            Primary-key and constraint-backed indexes cannot be deleted here.
          </p>
          <UButton
            icon="i-lucide-plus"
            size="xs"
            :disabled="!indexDdlSupported"
            :title="indexDdlSupported ? 'Create index' : 'Index changes are not supported for this database type'"
            @click="createIndexDialogOpen = true"
          >
            New index
          </UButton>
        </div>
        <div v-if="dataViewIndexes(tab).length" class="overflow-hidden rounded-lg border border-default">
          <table class="w-full text-left text-sm">
            <thead class="bg-[var(--workspace-surface-sub-panel)] text-muted">
              <tr>
                <th class="px-3 py-2 font-medium">Name</th>
                <th class="px-3 py-2 font-medium">Columns</th>
                <th class="px-3 py-2 font-medium">Unique</th>
                <th class="px-3 py-2 font-medium">Method</th>
                <th class="w-24 px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="index in dataViewIndexes(tab)" :key="index.name" class="border-t border-default">
                <td class="px-3 py-2">
                  <button type="button" class="text-left text-primary hover:underline" @click="showIndexDetails(index)">
                    {{ index.name }}
                  </button>
                  <UBadge v-if="index.inferred" class="ml-2" color="neutral" variant="subtle" size="xs">
                    Inferred
                  </UBadge>
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
                <td class="px-3 py-2 text-right">
                  <UButton
                    color="error"
                    variant="ghost"
                    icon="i-lucide-trash-2"
                    size="xs"
                    :disabled="!indexDdlSupported || index.protected || index.inferred"
                    :title="!indexDdlSupported ? 'Index changes are not supported for this database type' : index.protected || index.inferred ? 'Primary, constraint-backed, or inferred indexes cannot be deleted here' : `Drop ${index.name}`"
                    :aria-label="`Drop index ${index.name}`"
                    @click="previewDropIndex(index)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="grid h-full place-items-center text-sm text-muted">No index metadata available.</div>
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

      <DataViewDiagram
        v-else-if="tab.activePropertyTab === 'diagram'"
        :table="tab.meta?.table || tab.meta?.title || tab.title"
        :schema="tab.meta?.schema"
        :columns="dataViewColumns(tab)"
        :foreign-keys="dataViewForeignKeys(tab)"
      />

      <div v-else class="min-h-0 flex-1 overflow-auto p-3">
        <pre
          class="rounded-lg border border-default bg-[var(--workspace-surface-sub-panel)] p-3 font-ui-mono text-xs text-[var(--app-fg)]"
          >{{ dataViewDDL(tab) }}</pre>
      </div>
    </div>

    <DataViewExportDialog v-if="exportDialogOpen" v-model:open="exportDialogOpen" @confirm="submitExport" />

    <DataViewBatchUpdateDialog
      v-if="batchUpdateDialogOpen"
      v-model:open="batchUpdateDialogOpen"
      :fields="editableFields"
      :row-count="selectedRows.length"
      @confirm="updateRows"
    />

    <DataViewSavePreviewDialog
      v-if="previewDialogOpen"
      :open="previewDialogOpen"
      :result="tab.editState.previewResult"
      @update:open="handlePreviewDialogOpen"
      @confirm="confirmSaveChanges"
    />

    <DataViewCreateIndexDialog
      v-if="createIndexDialogOpen"
      v-model:open="createIndexDialogOpen"
      :schema="schemaName"
      :table="tableName"
      :columns="tableColumns"
      :db-type="dbType"
      @confirm="createIndex"
    />

    <SqlPreviewDialog
      :open="dropIndexPreviewOpen"
      :title="`Drop index · ${selectedIndex?.name || ''}`"
      :description="`Review the SQL that will remove this index from ${schemaName ? `${schemaName}.` : ''}${tableName}.`"
      :sql="dropIndexSql"
      confirm-label="Drop index"
      danger
      danger-message="Dropping an index can slow queries and may briefly lock database metadata. This action cannot be undone here."
      @confirm="dropIndex"
      @update:open="dropIndexPreviewOpen = $event"
    />

    <ChenWorkspaceModal
      :open="indexDetailsOpen"
      :title="`Index · ${selectedIndex?.name || ''}`"
      @update:open="indexDetailsOpen = $event"
    >
      <template #body>
        <dl v-if="selectedIndex" class="grid gap-3 p-4 text-sm sm:grid-cols-2">
          <div>
            <dt class="text-xs text-muted">Columns</dt>
            <dd class="mt-1">{{ selectedIndex.columns }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted">Unique</dt>
            <dd class="mt-1">{{ selectedIndex.unique }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted">Method</dt>
            <dd class="mt-1">{{ selectedIndex.method }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted">Managed by constraint</dt>
            <dd class="mt-1">{{ selectedIndex.protected ? "Yes" : "No" }}</dd>
          </div>
          <div class="sm:col-span-2">
            <dt class="text-xs text-muted">Definition</dt>
            <dd class="mt-1">
              <pre class="overflow-auto rounded-md bg-elevated p-3 text-xs text-muted">{{
                selectedIndex.definition || "Definition is not available from the server."
              }}</pre>
            </dd>
          </div>
        </dl>
      </template>
    </ChenWorkspaceModal>
  </div>
</template>
