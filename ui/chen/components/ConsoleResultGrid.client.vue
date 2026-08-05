<script setup lang="ts">
import type { ColDef, GridApi, GridReadyEvent, ValueFormatterParams } from "ag-grid-community";
import type { ChenDataViewDataset } from "~/chen/types";

import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { AgGridVue } from "ag-grid-vue3";

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
const columnDefs = computed<ColDef[]>(() =>
  props.dataset.fields.map((field) => ({
    field: field.name,
    headerName: field.label || field.name,
    minWidth: 120,
    maxWidth: 420,
    resizable: true,
    sortable: true,
    valueFormatter: (params: ValueFormatterParams) => (params.value == null ? "NULL" : String(params.value))
  }))
);

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
  <div class="ag-theme-balham chen-console-grid min-h-0 w-full" @copy="handleCopy">
    <AgGridVue
      class="h-full w-full"
      theme="legacy"
      :column-defs="columnDefs"
      :row-data="dataset.data"
      :default-col-def="defaultColDef"
      :row-height="28"
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
.chen-console-grid {
  --ag-font-family: var(--font-mono);
  --ag-font-size: 12px;
  --ag-background-color: var(--data-grid-row-background);
  --ag-foreground-color: var(--data-grid-text);
  --ag-header-background-color: var(--data-grid-header-background);
  --ag-header-foreground-color: var(--data-grid-text);
  --ag-odd-row-background-color: color-mix(
    in srgb,
    var(--data-grid-row-background) 92%,
    var(--data-grid-header-background) 8%
  );
  --ag-row-hover-color: var(--data-grid-row-hover);
  --ag-border-color: var(--data-grid-border);
  --ag-row-border-color: color-mix(in srgb, var(--data-grid-border) 72%, transparent);
  --ag-cell-horizontal-border: solid color-mix(in srgb, var(--data-grid-border) 42%, transparent);
  --ag-wrapper-border-radius: 0;
  --ag-border-radius: 0;
  background: var(--data-grid-row-background);
}

.chen-console-grid :deep(.ag-root-wrapper) {
  border: none;
  border-radius: 0;
}

.chen-console-grid :deep(.ag-cell) {
  display: flex;
  align-items: center;
}

.chen-console-grid :deep(.ag-cell-value),
.chen-console-grid :deep(.ag-header-cell-text) {
  color: var(--data-grid-text);
}
</style>
