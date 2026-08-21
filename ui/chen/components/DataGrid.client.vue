<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type {
  CellClassParams,
  CellClickedEvent,
  CellContextMenuEvent,
  CellMouseDownEvent,
  CellMouseOverEvent,
  CellValueChangedEvent,
  ColDef,
  ColumnHeaderClickedEvent,
  GridReadyEvent,
  SelectionChangedEvent,
  ValueFormatterParams
} from "ag-grid-community";
import type {
  ChenDataViewDataset,
  ChenDataViewEditMode,
  ChenDataViewEditState,
  ChenDataViewField,
  ChenDataViewMeta
} from "~/chen/types";

import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { AgGridVue } from "ag-grid-vue3";
import { formatChenGridValue, useChenGridPreferences } from "~/chen/composables/useChenGridPreferences";
import { writeChenClipboardText } from "~/chen/runtime/clipboard";
import {
  canUseChenCopy,
  createChenInsertSql,
  createChenUpdateSql,
  formatChenTsv,
  hasChenPrimaryKey
} from "~/chen/utils/dataGridCopy";
import {
  emptyChenGridSelection,
  extendChenGridSelection,
  finishChenGridSelection,
  getChenGridSelectionBounds,
  isChenGridCellSelected,
  startChenGridSelection
} from "~/chen/utils/dataGridSelection";
import {
  applyChenDataViewCellChange,
  canEditChenDataViewCell,
  chenDataViewRows,
  isChenDeletedRow,
  isChenDirtyCell,
  isChenInsertRow,
  normalizeChenDataViewValue
} from "~/chen/utils/dataViewEditing";

import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-balham.css";

const props = withDefaults(
  defineProps<{
    dataset: ChenDataViewDataset | null;
    meta?: ChenDataViewMeta | null;
    dbType?: string;
    canCopy?: boolean;
    editMode?: ChenDataViewEditMode;
    editState?: ChenDataViewEditState | null;
    gridPreferenceKey?: string;
  }>(),
  {
    meta: null,
    dbType: "",
    canCopy: false,
    editMode: "none",
    editState: null,
    gridPreferenceKey: "default"
  }
);

const emit = defineEmits<{
  selectionChange: [rows: Array<Record<string, any>>];
}>();

ModuleRegistry.registerModules([AllCommunityModule]);

const toast = useToast();
const { addErrorToast } = useErrorToast();
const gridApi = shallowRef<GridReadyEvent["api"] | null>(null);
const gridPreferences = useChenGridPreferences();
const container = ref<HTMLElement | null>(null);
const selection = ref(emptyChenGridSelection());
const contextMenuOpen = ref(false);
const contextMenuPosition = reactive({ x: 0, y: 0 });
const currentRow = ref<Record<string, any> | null>(null);
let resizeObserver: ResizeObserver | null = null;
let rowSelectionAnchor: number | null = null;
let rowSelectionDragging = false;

const ROW_NUMBER_COLUMN_ID = "__chenRowNumber";

function displayedColIds() {
  const fieldNames = new Set(props.dataset?.fields.map((field) => field.name) || []);
  return (
    gridApi.value
      ?.getAllDisplayedColumns()
      .map((column) => column.getColId())
      .filter((id) => fieldNames.has(id)) || []
  );
}

function refreshSelectionCells() {
  gridApi.value?.refreshCells({ force: true });
}

function isSelectedCell(params: CellClassParams) {
  const rowIndex = params.node.rowIndex;
  if (rowIndex == null) return false;
  return isChenGridCellSelected(selection.value, displayedColIds(), {
    rowIndex,
    colId: params.column.getColId()
  });
}

const columnDefs = computed<ColDef[]>(() => {
  const preferences = {
    nullDisplay: gridPreferences.value.nullDisplay,
    showEmptyStrings: gridPreferences.value.showEmptyStrings
  };
  const hiddenFields = new Set(gridPreferences.value.hiddenFieldsByGrid[props.gridPreferenceKey] || []);
  const dataColumns: ColDef[] = (props.dataset?.fields || []).map((field) => ({
    field: field.name,
    headerName: field.name,
    hide: hiddenFields.has(field.name),
    minWidth: 140,
    resizable: true,
    sortable: true,
    filter: true,
    editable: (params) => {
      return Boolean(
        props.dataset &&
        props.editState &&
        params.data &&
        canEditChenDataViewCell(props.dataset, props.editState, props.editMode, params.data, field)
      );
    },
    valueParser: (params) => normalizeChenDataViewValue(params.newValue, field),
    cellClassRules: {
      "chen-range-cell": isSelectedCell,
      "chen-dirty-cell": (params) =>
        Boolean(
          props.dataset &&
          props.editState &&
          params.data &&
          isChenDirtyCell(props.editState, props.dataset, params.data, field)
        ),
      "chen-insert-row": (params) => isChenInsertRow(params.data),
      "chen-delete-row": (params) =>
        Boolean(
          props.dataset &&
          props.editState &&
          params.data &&
          isChenDeletedRow(props.editState, props.dataset, params.data)
        )
    },
    valueFormatter: (params: ValueFormatterParams) => {
      return formatChenGridValue(params.value, preferences);
    }
  }));
  return [
    {
      colId: ROW_NUMBER_COLUMN_ID,
      headerName: "#",
      headerTooltip: "Row number",
      headerClass: "chen-row-number-header",
      width: 44,
      minWidth: 44,
      maxWidth: 44,
      pinned: "left" as const,
      lockPinned: true,
      lockPosition: true,
      resizable: false,
      sortable: false,
      filter: false,
      suppressAutoSize: true,
      suppressMovable: true,
      cellClass: "chen-row-number-cell",
      valueGetter: (params) => (params.node?.rowIndex == null ? "" : params.node.rowIndex + 1)
    },
    ...dataColumns
  ];
});

const rowData = computed(() => {
  const dirtyVersion = props.editState?.dirtyVersion;
  void dirtyVersion;
  if (!props.dataset) return [];
  if (props.editMode === "none" || !props.editState) return props.dataset.data;
  return chenDataViewRows(props.dataset, props.editState);
});

const defaultColDef: ColDef = {
  flex: 1,
  minWidth: 140,
  resizable: true,
  sortable: true,
  filter: true,
  cellClassRules: {
    "chen-range-cell": isSelectedCell
  }
};

function isDataColumn(event: CellMouseDownEvent | CellMouseOverEvent | CellContextMenuEvent | CellClickedEvent) {
  const colId = event.column.getColId();
  return props.dataset?.fields.some((field) => field.name === colId) === true;
}

function eventCell(event: CellMouseDownEvent | CellMouseOverEvent | CellContextMenuEvent) {
  const rowIndex = event.node.rowIndex;
  if (rowIndex == null) return null;
  return { rowIndex, colId: event.column.getColId() };
}

function handleCellMouseDown(event: CellMouseDownEvent) {
  if (!canUseChenCopy(props.canCopy) && props.editMode !== "full") return;
  const mouseEvent = event.event as MouseEvent | undefined;
  if (mouseEvent && mouseEvent.button !== 0) return;
  if (event.column.getColId() === ROW_NUMBER_COLUMN_ID) {
    handleRowNumberMouseDown(event);
    return;
  }
  if (!isDataColumn(event)) return;
  const cell = eventCell(event);
  if (!cell) return;
  currentRow.value = event.data || null;
  selection.value = startChenGridSelection(cell);
  refreshSelectionCells();
  emit("selectionChange", event.data ? [event.data] : []);
}

function handleCellMouseOver(event: CellMouseOverEvent) {
  if (!canUseChenCopy(props.canCopy) && props.editMode !== "full") return;
  if (event.column.getColId() === ROW_NUMBER_COLUMN_ID) {
    if (rowSelectionDragging) selectRowsBetween(event.node.rowIndex ?? 0);
    return;
  }
  if (!selection.value.dragging) return;
  if (!isDataColumn(event)) return;
  const cell = eventCell(event);
  if (!cell) return;
  selection.value = extendChenGridSelection(selection.value, cell);
  refreshSelectionCells();
  emit("selectionChange", selectedRows());
}

function finishSelection() {
  rowSelectionDragging = false;
  if (!selection.value.dragging) return;
  selection.value = finishChenGridSelection(selection.value);
  emit("selectionChange", selectedRows());
}

function resetSelection() {
  selection.value = emptyChenGridSelection();
  rowSelectionAnchor = null;
  rowSelectionDragging = false;
  gridApi.value?.deselectAll();
  refreshSelectionCells();
  emit("selectionChange", []);
}

function selectedData() {
  const bounds = getChenGridSelectionBounds(selection.value, displayedColIds());
  if (!bounds || !gridApi.value || !props.dataset) return null;
  const colIds = bounds.displayedColIds.slice(bounds.minCol, bounds.maxCol + 1);
  const fields = colIds
    .map((colId) => props.dataset?.fields.find((field) => field.name === colId))
    .filter((field): field is ChenDataViewField => Boolean(field));
  const rows: Record<string, any>[] = [];
  for (let rowIndex = bounds.minRow; rowIndex <= bounds.maxRow; rowIndex += 1) {
    const row = gridApi.value.getDisplayedRowAtIndex(rowIndex)?.data;
    if (row) rows.push(row);
  }
  return fields.length && rows.length ? { fields, rows } : null;
}

function copyError(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

async function copyText(text: string, successTitle: string) {
  if (!canUseChenCopy(props.canCopy)) return;
  try {
    await writeChenClipboardText(text);
    toast.add({ title: successTitle, color: "success" });
  } catch (cause) {
    addErrorToast({ title: "Copy failed", description: copyError(cause) });
  }
}

function copySelection() {
  const selected = selectedData();
  if (!selected) return;
  void copyText(formatChenTsv(selected.rows, selected.fields), "Selection copied");
}

function copyInsertSql() {
  if (!currentRow.value || !props.meta) return;
  try {
    const sql = createChenInsertSql(props.dbType, props.meta, props.dataset?.fields || [], currentRow.value);
    void copyText(sql, "INSERT SQL copied");
  } catch (cause) {
    addErrorToast({ title: "Copy failed", description: copyError(cause) });
  }
}

function copyUpdateSql() {
  if (!currentRow.value || !props.meta) return;
  try {
    const sql = createChenUpdateSql(props.dbType, props.meta, props.dataset?.fields || [], currentRow.value);
    void copyText(sql, "UPDATE SQL copied");
  } catch (cause) {
    addErrorToast({ title: "Copy failed", description: copyError(cause) });
  }
}

const canCopyInsert = computed(() =>
  Boolean(props.dbType && props.meta?.schema && props.meta.table && props.dataset?.fields.length && currentRow.value)
);
const canCopyUpdate = computed(() => canCopyInsert.value && hasChenPrimaryKey(props.dataset?.fields || []));
const contextMenuItems = computed<DropdownMenuItem[]>(() => {
  if (!canUseChenCopy(props.canCopy)) return [];
  return [
    { label: "Copy selection", icon: "i-lucide-copy", onSelect: copySelection },
    {
      label: canCopyInsert.value ? "Copy INSERT SQL" : "Copy INSERT SQL (table metadata unavailable)",
      icon: "i-lucide-copy",
      disabled: !canCopyInsert.value,
      onSelect: copyInsertSql
    },
    {
      label: canCopyUpdate.value ? "Copy UPDATE SQL" : "Copy UPDATE SQL (primary key unavailable)",
      icon: "i-lucide-copy",
      disabled: !canCopyUpdate.value,
      onSelect: copyUpdateSql
    }
  ];
});

function captureContextMenu(event: MouseEvent) {
  if (!canUseChenCopy(props.canCopy)) return;
  if (!(event.target instanceof Element) || !event.target.closest(".ag-cell")) return;
  event.preventDefault();
  contextMenuPosition.x = event.clientX;
  contextMenuPosition.y = event.clientY;
}

function handleCellContextMenu(event: CellContextMenuEvent) {
  if (!event.data || !isDataColumn(event)) return;
  const cell = eventCell(event);
  if (
    (canUseChenCopy(props.canCopy) || props.editMode === "full") &&
    cell &&
    !isChenGridCellSelected(selection.value, displayedColIds(), cell)
  ) {
    selection.value = finishChenGridSelection(startChenGridSelection(cell));
    refreshSelectionCells();
  }
  currentRow.value = event.data;
  emit("selectionChange", selectedRows());
  if (canUseChenCopy(props.canCopy)) contextMenuOpen.value = true;
}

function handleCellClicked(event: CellClickedEvent) {
  if (event.column.getColId() === ROW_NUMBER_COLUMN_ID) {
    return;
  }
  if (!isDataColumn(event)) return;
  currentRow.value = event.data || null;
  emit("selectionChange", selectedRows());
}

function selectRowsBetween(rowIndex: number) {
  if (rowSelectionAnchor == null || !gridApi.value) return;
  const first = Math.min(rowSelectionAnchor, rowIndex);
  const last = Math.max(rowSelectionAnchor, rowIndex);
  const nodes = [];
  for (let index = first; index <= last; index += 1) {
    const node = gridApi.value.getDisplayedRowAtIndex(index);
    if (node) nodes.push(node);
  }
  gridApi.value.deselectAll();
  gridApi.value.setNodesSelected({ nodes, newValue: true });
}

function handleRowNumberMouseDown(event: CellMouseDownEvent) {
  const rowIndex = event.node.rowIndex;
  if (rowIndex == null) return;
  const mouseEvent = event.event as MouseEvent | undefined;
  const additive = Boolean(mouseEvent?.ctrlKey || mouseEvent?.metaKey);

  currentRow.value = event.data || null;
  selection.value = emptyChenGridSelection();
  refreshSelectionCells();

  if (mouseEvent?.shiftKey && rowSelectionAnchor != null && gridApi.value) {
    selectRowsBetween(rowIndex);
    rowSelectionDragging = true;
    return;
  }

  if (!additive) gridApi.value?.deselectAll();
  event.node.setSelected(additive ? !event.node.isSelected() : true, false);
  rowSelectionAnchor = rowIndex;
  rowSelectionDragging = true;
}

function handleColumnHeaderClicked(event: ColumnHeaderClickedEvent) {
  if (event.column?.getColId() !== ROW_NUMBER_COLUMN_ID || !gridApi.value) return;
  const nodes = [];
  for (let index = 0; index < gridApi.value.getDisplayedRowCount(); index += 1) {
    const node = gridApi.value.getDisplayedRowAtIndex(index);
    if (node) nodes.push(node);
  }
  const allSelected = nodes.length > 0 && nodes.every((node) => node.isSelected());
  if (allSelected) gridApi.value.deselectAll();
  else gridApi.value.setNodesSelected({ nodes, newValue: true });
  rowSelectionAnchor = null;
  rowSelectionDragging = false;
}

function handleSelectionChanged(event: SelectionChangedEvent) {
  emit("selectionChange", event.api.getSelectedRows());
}

function handleCellValueChanged(event: CellValueChangedEvent) {
  if (!props.dataset || !props.editState || !event.data) return;
  const fieldName = typeof event.colDef.field === "string" ? event.colDef.field : event.column.getColId();
  const field = props.dataset.fields.find((item) => item.name === fieldName);
  if (!field || !canEditChenDataViewCell(props.dataset, props.editState, props.editMode, event.data, field)) return;
  applyChenDataViewCellChange(props.editState, props.dataset, event.data, field, event.oldValue, event.newValue);
}

function handleKeyDown(event: KeyboardEvent) {
  if (!canUseChenCopy(props.canCopy)) return;
  if ((!event.ctrlKey && !event.metaKey) || event.key.toLowerCase() !== "c") return;
  if (!selectedData()) return;
  event.preventDefault();
  copySelection();
}

function queueGridRefresh() {
  requestAnimationFrame(() => {
    if (!gridApi.value) return;
    if (columnDefs.value.length) {
      gridApi.value.autoSizeAllColumns(false);
    }
    gridApi.value.refreshCells({ force: true });
  });
}

function syncGridData() {
  if (!gridApi.value) return;
  gridApi.value.setGridOption("columnDefs", columnDefs.value);
  gridApi.value.setGridOption("rowData", rowData.value);
  if (rowData.value.length) {
    gridApi.value.hideOverlay();
  } else {
    gridApi.value.showNoRowsOverlay();
  }
}

function handleGridReady(event: GridReadyEvent) {
  gridApi.value = event.api;
  syncGridData();
  queueGridRefresh();
}

function selectedRows() {
  const rowSelection = gridApi.value?.getSelectedRows() || [];
  return rowSelection.length ? rowSelection : selectedData()?.rows || (currentRow.value ? [currentRow.value] : []);
}

function stopEditing() {
  gridApi.value?.stopEditing();
}

defineExpose({ selectedRows, stopEditing });

watch([columnDefs, rowData], async () => {
  resetSelection();
  await nextTick();
  syncGridData();
  queueGridRefresh();
});

onMounted(() => {
  if (!container.value) return;
  resizeObserver = new ResizeObserver(() => {
    queueGridRefresh();
  });
  resizeObserver.observe(container.value);
  window.addEventListener("pointerup", finishSelection);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  window.removeEventListener("pointerup", finishSelection);
});
</script>

<template>
  <div
    ref="container"
    class="ag-theme-balham chen-grid h-full w-full"
    :class="{
      'chen-grid-striped': gridPreferences.stripedRows,
      'chen-grid-cell-borders': gridPreferences.showCellBorders
    }"
    @contextmenu.capture="captureContextMenu"
    @keydown.capture="handleKeyDown"
  >
    <AgGridVue
      class="h-full w-full"
      theme="legacy"
      :column-defs="columnDefs"
      :row-data="rowData"
      :default-col-def="defaultColDef"
      :row-height="gridPreferences.compactRows ? 24 : 28"
      :animate-rows="false"
      :suppress-cell-focus="false"
      :ensure-dom-order="true"
      :row-selection="{
        mode: 'multiRow',
        checkboxes: false,
        headerCheckbox: false,
        enableClickSelection: false,
        ctrlASelectsRows: true
      }"
      @grid-ready="handleGridReady"
      @column-header-clicked="handleColumnHeaderClicked"
      @selection-changed="handleSelectionChanged"
      @cell-clicked="handleCellClicked"
      @cell-mouse-down="handleCellMouseDown"
      @cell-mouse-over="handleCellMouseOver"
      @cell-context-menu="handleCellContextMenu"
      @cell-value-changed="handleCellValueChanged"
    />

    <UDropdownMenu
      v-model:open="contextMenuOpen"
      :items="contextMenuItems"
      :content="{ align: 'start', side: 'bottom' }"
    >
      <div
        class="pointer-events-none fixed"
        :style="{
          left: `${contextMenuPosition.x}px`,
          top: `${contextMenuPosition.y}px`,
          width: '1px',
          height: '1px'
        }"
      />
    </UDropdownMenu>
  </div>
</template>

<style scoped>
.chen-grid,
.chen-grid :deep(.ag-theme-balham) {
  --ag-font-family: var(--font-sans);
  --ag-font-size: 12px;
  --ag-background-color: var(--data-grid-row-background);
  --ag-data-background-color: var(--data-grid-row-background);
  background: var(--data-grid-row-background);
  --ag-foreground-color: var(--data-grid-text);
  --ag-header-background-color: var(--data-grid-header-background);
  --ag-header-foreground-color: var(--data-grid-text);
  --ag-odd-row-background-color: var(--data-grid-row-background);
  --ag-row-hover-color: var(--data-grid-row-hover);
  --ag-selected-row-background-color: var(--data-grid-row-selected);
  --ag-range-selection-background-color: color-mix(in srgb, var(--theme-accent) 14%, transparent);
  --ag-range-selection-border-color: color-mix(in srgb, var(--theme-accent) 40%, transparent);
  --ag-border-color: var(--data-grid-border);
  --ag-secondary-border-color: color-mix(in srgb, var(--data-grid-border) 86%, transparent);
  --ag-row-border-color: color-mix(in srgb, var(--data-grid-border) 72%, transparent);
  --ag-header-column-resize-handle-color: color-mix(in srgb, var(--theme-accent) 40%, transparent);
  --ag-checkbox-unchecked-color: var(--data-grid-text-muted);
  --ag-checkbox-checked-color: var(--theme-accent);
  --ag-checkbox-indeterminate-color: var(--theme-accent);
  --ag-input-border-color: var(--data-grid-border);
  --ag-input-focus-border-color: color-mix(in srgb, var(--theme-accent) 52%, transparent);
  --ag-input-focus-box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-accent) 14%, transparent);
  --ag-control-panel-background-color: var(--app-surface-panel);
  --ag-subheader-background-color: var(--app-surface-panel);
  --ag-tooltip-background-color: var(--app-surface-overlay);
  --ag-tooltip-text-color: var(--app-text-primary);
  --ag-modal-overlay-background-color: color-mix(in srgb, var(--app-surface-overlay) 72%, transparent);
  --ag-cell-horizontal-border: none;
  --ag-header-column-border: solid color-mix(in srgb, var(--data-grid-border) 54%, transparent);
  --ag-wrapper-border-radius: 0;
  --ag-border-radius: 0;
}

.chen-grid-cell-borders {
  --ag-cell-horizontal-border: solid color-mix(in srgb, var(--data-grid-border) 42%, transparent);
}

.chen-grid :deep(.ag-root-wrapper) {
  border: none;
  border-radius: 0;
  background: var(--data-grid-row-background);
}

.chen-grid :deep(.ag-root),
.chen-grid :deep(.ag-root-wrapper-body),
.chen-grid :deep(.ag-layout-normal),
.chen-grid :deep(.ag-body),
.chen-grid :deep(.ag-body-horizontal-scroll),
.chen-grid :deep(.ag-body-vertical-scroll),
.chen-grid :deep(.ag-body-viewport-wrapper),
.chen-grid :deep(.ag-center-cols-clipper),
.chen-grid :deep(.ag-body-viewport),
.chen-grid :deep(.ag-center-cols-viewport),
.chen-grid :deep(.ag-center-cols-container),
.chen-grid :deep(.ag-pinned-left-cols-container),
.chen-grid :deep(.ag-pinned-right-cols-container),
.chen-grid :deep(.ag-floating-top),
.chen-grid :deep(.ag-floating-bottom) {
  background: var(--data-grid-row-background);
}

.chen-grid :deep(.ag-center-cols-container::after),
.chen-grid :deep(.ag-pinned-left-cols-container::after),
.chen-grid :deep(.ag-pinned-right-cols-container::after),
.chen-grid :deep(.ag-floating-top-container::after),
.chen-grid :deep(.ag-floating-bottom-container::after) {
  background: var(--data-grid-row-background) !important;
}

.chen-grid :deep(.ag-header),
.chen-grid :deep(.ag-header-viewport),
.chen-grid :deep(.ag-pinned-left-header),
.chen-grid :deep(.ag-pinned-right-header),
.chen-grid :deep(.ag-header-container),
.chen-grid :deep(.ag-header-row),
.chen-grid :deep(.ag-header-cell),
.chen-grid :deep(.ag-header-group-cell),
.chen-grid :deep(.ag-header-cell-comp-wrapper),
.chen-grid :deep(.ag-header-cell-comp-wrapper::before),
.chen-grid :deep(.ag-header-container::after) {
  background: var(--data-grid-header-background);
  border-bottom-color: color-mix(in srgb, var(--ui-border) 86%, transparent);
}

.chen-grid :deep(.ag-header-cell),
.chen-grid :deep(.ag-pinned-left-header),
.chen-grid :deep(.ag-pinned-right-header) {
  color: var(--data-grid-text);
}

.chen-grid :deep(.ag-body-vertical-scroll-start-spacer) {
  opacity: 1;
  background: var(--data-grid-header-background);
  border-bottom-color: color-mix(in srgb, var(--ui-border) 86%, transparent);
}

.chen-grid :deep(.ag-row) {
  background: var(--data-grid-row-background);
  color: var(--data-grid-text);
  border-bottom-color: color-mix(in srgb, var(--ui-border) 70%, transparent);
}

.chen-grid :deep(.ag-row) {
  border-bottom-color: color-mix(in srgb, var(--ui-border) 70%, transparent);
}

.chen-grid-striped :deep(.ag-row-odd) {
  background: var(--data-grid-row-striped);
}

.chen-grid :deep(.ag-row-hover) {
  background: var(--data-grid-row-hover);
  color: var(--data-grid-text);
}

.chen-grid :deep(.ag-row-hover:not(.ag-full-width-row)::after),
.chen-grid :deep(.ag-row-selected:not(.ag-full-width-row)::after) {
  background-color: var(--ag-internal-row-overlay-color);
  background-image: var(--ag-internal-row-overlay-image);
}

.chen-grid :deep(.ag-row-selected) {
  color: var(--data-grid-text);
}

.chen-grid :deep(.ag-row-selected::before) {
  background: var(--data-grid-row-selected);
}

.chen-grid :deep(.ag-cell) {
  display: flex;
  align-items: center;
}

.chen-grid :deep(.chen-row-number-cell) {
  justify-content: center;
  color: var(--data-grid-text-muted);
  cursor: pointer;
  font-variant-numeric: tabular-nums;
  user-select: none;
}

.chen-grid :deep(.chen-row-number-header .ag-header-cell-label) {
  justify-content: center;
}

.chen-grid :deep(.ag-row-selected .chen-row-number-cell) {
  color: var(--theme-accent);
  font-weight: 600;
}

.chen-grid :deep(.chen-range-cell) {
  background: color-mix(in srgb, var(--theme-accent) 18%, transparent) !important;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--theme-accent) 42%, transparent);
}

.chen-grid :deep(.chen-dirty-cell) {
  background: color-mix(in srgb, var(--theme-accent) 16%, var(--data-grid-row-background)) !important;
}

.chen-grid :deep(.chen-insert-row) {
  background: color-mix(in srgb, var(--ui-success) 12%, var(--data-grid-row-background)) !important;
}

.chen-grid :deep(.chen-delete-row) {
  color: var(--app-text-muted) !important;
  text-decoration: line-through;
}

.chen-grid :deep(.ag-cell-value),
.chen-grid :deep(.ag-header-cell-text),
.chen-grid :deep(.ag-overlay-no-rows-center) {
  color: var(--data-grid-text);
}

.chen-grid :deep(.ag-overlay-no-rows-wrapper) {
  background: var(--data-grid-row-background);
}

.chen-grid :deep(.ag-overlay),
.chen-grid :deep(.ag-overlay-panel) {
  background: var(--data-grid-row-background);
}

.chen-grid :deep(.ag-checkbox-input-wrapper) {
  color: var(--data-grid-text-muted);
}

.chen-grid :deep(.ag-input-field-input),
.chen-grid :deep(.ag-text-field-input) {
  background: var(--app-surface-input);
  color: var(--app-text-primary);
}

.chen-grid :deep(.ag-menu),
.chen-grid :deep(.ag-popup),
.chen-grid :deep(.ag-filter-toolpanel),
.chen-grid :deep(.ag-tool-panel-wrapper) {
  background: var(--app-surface-panel);
  color: var(--app-text-primary);
}
</style>
