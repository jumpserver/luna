<script setup lang="ts">
import type { ColDef, GridReadyEvent, ValueFormatterParams } from "ag-grid-community";
import type { ChenDataViewDataset } from "~/chen/types";

import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { AgGridVue } from "ag-grid-vue3";

import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-balham.css";

const props = defineProps<{
  dataset: ChenDataViewDataset | null
}>();

ModuleRegistry.registerModules([AllCommunityModule]);

const gridApi = shallowRef<GridReadyEvent["api"] | null>(null);
const container = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | null = null;

const columnDefs = computed<ColDef[]>(() => {
  return (props.dataset?.fields || []).map((field) => ({
    field: field.name,
    headerName: field.name,
    minWidth: 140,
    resizable: true,
    sortable: true,
    filter: true,
    valueFormatter: (params: ValueFormatterParams) => {
      return params.value == null ? "NULL" : String(params.value);
    }
  }));
});

const rowData = computed(() => props.dataset?.data || []);

const defaultColDef: ColDef = {
  flex: 1,
  minWidth: 140,
  resizable: true,
  sortable: true,
  filter: true
};

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

watch([columnDefs, rowData], async () => {
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
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});
</script>

<template>
  <div ref="container" class="ag-theme-balham chen-grid h-full w-full">
    <AgGridVue
      class="h-full w-full"
      theme="legacy"
      :column-defs="columnDefs"
      :row-data="rowData"
      :default-col-def="defaultColDef"
      :animate-rows="false"
      :suppress-cell-focus="false"
      :ensure-dom-order="true"
      :row-selection="{ mode: 'multiRow', checkboxes: false, headerCheckbox: false }"
      @grid-ready="handleGridReady"
    />
  </div>
</template>

<style scoped>
.chen-grid {
  --ag-font-family: var(--font-sans);
  --ag-font-size: 12px;
  --ag-background-color: var(--data-grid-row-background);
  background: var(--data-grid-row-background);
  --ag-foreground-color: var(--data-grid-text);
  --ag-header-background-color: var(--data-grid-header-background);
  --ag-header-foreground-color: var(--data-grid-text);
  --ag-odd-row-background-color: color-mix(in srgb, var(--data-grid-row-background) 92%, var(--data-grid-header-background) 8%);
  --ag-row-hover-color: var(--data-grid-row-hover);
  --ag-selected-row-background-color: var(--data-grid-row-selected);
  --ag-range-selection-background-color: color-mix(in srgb, var(--theme-accent) 14%, transparent);
  --ag-range-selection-border-color: color-mix(in srgb, var(--theme-accent) 40%, transparent);
  --ag-border-color: var(--data-grid-border);
  --ag-secondary-border-color: color-mix(in srgb, var(--data-grid-border) 86%, transparent);
  --ag-row-border-color: color-mix(in srgb, var(--data-grid-border) 72%, transparent);
  --ag-header-column-resize-handle-color: color-mix(in srgb, var(--theme-accent) 40%, transparent);
  --ag-checkbox-unchecked-color: var(--data-grid-text-muted);
  --ag-input-border-color: var(--data-grid-border);
  --ag-input-focus-border-color: color-mix(in srgb, var(--theme-accent) 52%, transparent);
  --ag-input-focus-box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-accent) 14%, transparent);
  --ag-control-panel-background-color: var(--app-surface-panel);
  --ag-subheader-background-color: var(--app-surface-panel);
  --ag-tooltip-background-color: var(--app-surface-overlay);
  --ag-tooltip-text-color: var(--app-text-primary);
  --ag-modal-overlay-background-color: color-mix(in srgb, var(--app-surface-overlay) 72%, transparent);
  --ag-cell-horizontal-border: solid color-mix(in srgb, var(--data-grid-border) 42%, transparent);
  --ag-header-column-border: solid color-mix(in srgb, var(--data-grid-border) 54%, transparent);
  --ag-wrapper-border-radius: 0;
  --ag-border-radius: 0;
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

.chen-grid :deep(.ag-row) {
  background: var(--data-grid-row-background);
  color: var(--data-grid-text);
  border-bottom-color: color-mix(in srgb, var(--ui-border) 70%, transparent);
}

.chen-grid :deep(.ag-row) {
  border-bottom-color: color-mix(in srgb, var(--ui-border) 70%, transparent);
}

.chen-grid :deep(.ag-row-hover) {
  background: var(--data-grid-row-hover);
}

.chen-grid :deep(.ag-row-selected::before) {
  background: var(--data-grid-row-selected);
}

.chen-grid :deep(.ag-cell) {
  display: flex;
  align-items: center;
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
