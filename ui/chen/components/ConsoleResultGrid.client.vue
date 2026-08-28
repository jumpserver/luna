<script setup lang="ts">
import type { ColDef, GridApi, GridReadyEvent, ValueFormatterParams } from "ag-grid-community";
import type { ChenDataViewDataset } from "~/chen/types";

import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { AgGridVue } from "ag-grid-vue3";
import { formatChenGridValue, useChenGridPreferences } from "~/chen/composables/useChenGridPreferences";

import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-balham.css";

const props = withDefaults(
  defineProps<{
    dataset: ChenDataViewDataset;
    canCopy?: boolean;
  }>(),
  {
    canCopy: false
  }
);

ModuleRegistry.registerModules([AllCommunityModule]);

const gridApi = shallowRef<GridApi | null>(null);
const gridPreferences = useChenGridPreferences();
const columnDefs = computed<ColDef[]>(() => {
  const preferences = {
    nullDisplay: gridPreferences.value.nullDisplay,
    showEmptyStrings: gridPreferences.value.showEmptyStrings
  };
  return props.dataset.fields.map((field) => ({
    field: field.name,
    headerName: field.label || field.name,
    minWidth: 120,
    resizable: true,
    sortable: true,
    valueFormatter: (params: ValueFormatterParams) => formatChenGridValue(params.value, preferences)
  }));
});

const defaultColDef: ColDef = {
  minWidth: 120,
  resizable: true,
  sortable: true
};

function fitColumns(api: GridApi) {
  if (columnDefs.value.length) api.autoSizeAllColumns(false);
}

function handleGridReady(event: GridReadyEvent) {
  gridApi.value = event.api;
  fitColumns(event.api);
}

function handleCopy(event: ClipboardEvent) {
  if (!props.canCopy) event.preventDefault();
}

watch([columnDefs, () => props.dataset.data], async () => {
  const api = gridApi.value;
  if (!api) return;
  api.setGridOption("columnDefs", columnDefs.value);
  api.setGridOption("rowData", props.dataset.data);
  await nextTick();
  fitColumns(api);
});
</script>

<template>
  <div
    class="ag-theme-balham chen-console-grid min-h-0 w-full"
    :class="{
      'chen-console-grid-striped': gridPreferences.stripedRows,
      'chen-console-grid-cell-borders': gridPreferences.showCellBorders
    }"
    @copy="handleCopy"
  >
    <AgGridVue
      class="h-full w-full"
      theme="legacy"
      :column-defs="columnDefs"
      :row-data="dataset.data"
      :default-col-def="defaultColDef"
      :row-height="gridPreferences.compactRows ? 24 : 28"
      :header-height="32"
      :animate-rows="false"
      :enable-cell-text-selection="canCopy"
      :suppress-cell-focus="false"
      :ensure-dom-order="true"
      @grid-ready="handleGridReady"
    />
  </div>
</template>

<style scoped>
.chen-console-grid,
.chen-console-grid :deep(.ag-theme-balham) {
  --ag-font-family: var(--font-mono);
  --ag-font-size: 12px;
  --ag-background-color: var(--data-grid-row-background);
  --ag-data-background-color: var(--data-grid-row-background);
  --ag-foreground-color: var(--data-grid-text);
  --ag-header-background-color: var(--data-grid-header-background);
  --ag-header-foreground-color: var(--data-grid-text);
  --ag-odd-row-background-color: var(--data-grid-row-background);
  --ag-row-hover-color: var(--data-grid-row-hover);
  --ag-border-color: var(--data-grid-border);
  --ag-row-border-color: color-mix(in srgb, var(--data-grid-border) 72%, transparent);
  --ag-cell-horizontal-border: none;
  --ag-wrapper-border-radius: 0;
  --ag-border-radius: 0;
  background: var(--data-grid-row-background);
}

.chen-console-grid-cell-borders {
  --ag-cell-horizontal-border: solid color-mix(in srgb, var(--data-grid-border) 42%, transparent);
}

.chen-console-grid-striped :deep(.ag-row-odd) {
  background: var(--data-grid-row-striped);
}

.chen-console-grid :deep(.ag-root-wrapper) {
  border: none;
  border-radius: 0;
}

.chen-console-grid :deep(.ag-body-vertical-scroll-start-spacer) {
  opacity: 1;
  background: var(--data-grid-header-background);
  border-bottom-color: var(--data-grid-border);
}

.chen-console-grid :deep(.ag-cell) {
  display: flex;
  align-items: center;
}

.chen-console-grid :deep(.ag-row-hover:not(.ag-full-width-row)::after),
.chen-console-grid :deep(.ag-row-selected:not(.ag-full-width-row)::after) {
  background-color: var(--ag-internal-row-overlay-color);
  background-image: var(--ag-internal-row-overlay-image);
}

.chen-console-grid :deep(.ag-cell-value),
.chen-console-grid :deep(.ag-header-cell-text) {
  color: var(--data-grid-text);
}
</style>
