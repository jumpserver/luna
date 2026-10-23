<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type {
  CellClassParams,
  CellContextMenuEvent,
  CellFocusedEvent,
  CellMouseDownEvent,
  CellMouseOverEvent,
  ColDef,
  GridApi,
  GridReadyEvent,
  IHeaderParams
} from "ag-grid-community";
import type { PropType } from "vue";
import type { GoRows } from "./api";
import type { ChenGridCell } from "~/chen/utils/dataGridSelection";
import { AllCommunityModule, isColumn, ModuleRegistry } from "ag-grid-community";
import { AgGridVue } from "ag-grid-vue3";
import { gridLocales } from "~/chen/locales";
import {
  emptyChenGridSelection,
  extendChenGridSelection,
  finishChenGridSelection,
  getChenGridSelectionBounds,
  isChenGridCellSelected,
  startChenGridSelection
} from "~/chen/utils/dataGridSelection";
import { writeClipboardText } from "~/utils/clipboard";
import GoResultValue from "./GoResultValue.client.vue";
import {
  compareResultValues,
  resultColumnId,
  resultContextSelection,
  resultFocusSelection,
  resultGridRows,
  resultSelectionTsv,
  resultTypeBadge,
  resultValuePreview,
  resultValueText
} from "./resultGrid";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-balham.css";

const props = defineProps<{ rows: GoRows; canCopy: boolean }>();
ModuleRegistry.registerModules([AllCommunityModule]);
const { t, locale } = useI18n();
const toast = useToast();
const gridApi = shallowRef<GridApi | null>(null);
const selection = ref(emptyChenGridSelection());
const filter = ref("");
const shownRows = ref(props.rows.rows.length);
const valueOpen = ref(false);
const valueCell = ref<{ name: string; type: string; row: number; value: unknown } | null>(null);
const pinVersion = ref(0);
const expectedFocus = new Set<string>();
const contextMenuOpen = ref(false);
const contextMenuPosition = reactive({ x: 0, y: 0 });
const contextCell = ref<ChenGridCell | null>(null);
const data = computed(() => resultGridRows(props.rows));
const columnNames = computed(() => {
  let unnamed = 0;
  return props.rows.columns.map((column) =>
    column.name === "?column?" ? t("Chen.GoV1GridUnnamedColumn", { index: ++unnamed }) : column.name
  );
});
const bounds = computed(() => {
  void pinVersion.value;
  return getChenGridSelectionBounds(selection.value, columnIds());
});
const selectionLabel = computed(() =>
  bounds.value
    ? t("Chen.GoV1GridSelection", {
        rows: bounds.value.maxRow - bounds.value.minRow + 1,
        columns: bounds.value.maxCol - bounds.value.minCol + 1
      })
    : t("Chen.GoV1GridSelectionHint")
);
const positionLabel = computed(() => {
  const cell = selection.value.current;
  if (!cell) return "";
  const row = gridApi.value?.getDisplayedRowAtIndex(cell.rowIndex)?.data;
  const name = gridApi.value?.getColumn(cell.colId)?.getColDef().headerName;
  return row && name ? t("Chen.GoV1GridPosition", { row: row.__row, column: name }) : "";
});
const focusedColumn = computed(() => {
  void pinVersion.value;
  const id = selection.value.current?.colId;
  return id ? gridApi.value?.getColumn(id) : null;
});
const menuItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: t("Chen.GoV1GridFitColumns"),
      icon: "i-lucide-columns-3",
      onSelect: () => gridApi.value?.autoSizeAllColumns()
    },
    {
      label: t(focusedColumn.value?.isPinned() ? "Chen.GoV1GridUnpin" : "Chen.GoV1GridPin"),
      icon: "i-lucide-pin",
      disabled: !focusedColumn.value,
      onSelect: () => togglePinned(selection.value.current?.colId)
    },
    {
      label: t("Chen.GoV1GridResetView"),
      icon: "i-lucide-rotate-ccw",
      onSelect: () => {
        filter.value = "";
        gridApi.value?.resetColumnState();
        resetSelection();
      }
    }
  ]
]);
const contextMenuItems = computed<DropdownMenuItem[][]>(() => {
  void pinVersion.value;
  const column = contextCell.value ? gridApi.value?.getColumn(contextCell.value.colId) : null;
  return [
    [
      {
        label: t("Chen.GoV1GridCopy"),
        icon: "i-lucide-copy",
        disabled: !props.canCopy || !bounds.value,
        onSelect: () => copySelection()
      },
      {
        label: t("Chen.GoV1GridCopyHeaders"),
        icon: "i-lucide-table-2",
        disabled: !props.canCopy || !bounds.value,
        onSelect: () => copySelection(true)
      }
    ],
    [
      {
        label: t("Chen.GoV1GridViewValue"),
        icon: "i-lucide-expand",
        disabled: !contextCell.value,
        onSelect: () => openValue(contextCell.value)
      },
      {
        label: t(column?.isPinned() ? "Chen.GoV1GridUnpin" : "Chen.GoV1GridPin"),
        icon: "i-lucide-pin",
        disabled: !column,
        onSelect: () => togglePinned(contextCell.value?.colId)
      }
    ]
  ];
});
const ResultColumnHeader = defineComponent({
  props: { params: { type: Object as PropType<IHeaderParams & { dataType: string }>, required: true } },
  setup: (header) => () =>
    h("span", { class: "result-column-heading" }, [
      h("span", { class: "result-column-name" }, header.params.displayName),
      h("span", { class: "result-column-type", "aria-hidden": "true" }, resultTypeBadge(header.params.dataType))
    ])
});

function togglePinned(id?: string) {
  const column = id ? gridApi.value?.getColumn(id) : null;
  if (column) gridApi.value?.setColumnsPinned([column.getColId()], column.isPinned() ? null : "left");
}

function columnIds() {
  return (
    gridApi.value
      ?.getAllDisplayedColumns()
      .map((column) => column.getColId())
      .filter((id) => id !== "__row") || []
  );
}
function selectedClass(params: CellClassParams) {
  return (
    params.node.rowIndex != null &&
    isChenGridCellSelected(selection.value, columnIds(), {
      rowIndex: params.node.rowIndex,
      colId: params.column.getColId()
    })
  );
}
const columns = computed<ColDef[]>(() => [
  {
    colId: "__row",
    field: "__row",
    headerName: "#",
    headerTooltip: t("Chen.RowNumber"),
    width: 54,
    minWidth: 54,
    maxWidth: 82,
    pinned: "left",
    lockPinned: true,
    lockPosition: true,
    suppressMovable: true,
    suppressAutoSize: true,
    sortable: false,
    cellClass: "result-row-number",
    getQuickFilterText: () => ""
  },
  ...props.rows.columns.map(
    (column, ordinal): ColDef => ({
      colId: resultColumnId(ordinal),
      field: resultColumnId(ordinal),
      headerName: columnNames.value[ordinal],
      headerTooltip: `${column.name} · ${column.data_type} · ${t("Chen.GoV1GridPageOnly")}`,
      headerComponentParams: {
        innerHeaderComponent: ResultColumnHeader,
        innerHeaderComponentParams: { dataType: column.data_type }
      },
      initialWidth: Math.min(300, Math.max(130, (columnNames.value[ordinal]?.length || 0) * 8 + 72)),
      minWidth: 80,
      maxWidth: 1000,
      valueFormatter: ({ value }) => resultValuePreview(value),
      tooltipValueGetter: ({ value }) => `${resultValuePreview(value, 1024)}\n\n${t("Chen.GoV1GridPreviewHint")}`,
      comparator: (a, b) => compareResultValues(a, b, resultTypeBadge(column.data_type) === "123"),
      getQuickFilterText: ({ value }) => resultValueText(value),
      cellClassRules: {
        "result-selected-cell": selectedClass,
        "result-null-cell": ({ value }) => value == null,
        "result-empty-cell": ({ value }) => value === ""
      }
    })
  )
]);
const defaults: ColDef = {
  resizable: true,
  sortable: true,
  editable: false,
  cellDataType: false,
  suppressMovable: true
};

function refreshSelection() {
  gridApi.value?.refreshCells({ force: true });
}
function finishSelection() {
  selection.value = finishChenGridSelection(selection.value);
}
function resetSelection() {
  expectedFocus.clear();
  contextMenuOpen.value = false;
  contextCell.value = null;
  selection.value = emptyChenGridSelection();
  refreshSelection();
}
function captureRightMouseDown(event: MouseEvent) {
  if (event.button !== 2 || !(event.target instanceof Element)) return;
  const cell = event.target.closest(".ag-cell[col-id]");
  const colId = cell?.getAttribute("col-id");
  const rowIndex = Number(cell?.closest("[row-index]")?.getAttribute("row-index"));
  if (colId && colId !== "__row" && Number.isInteger(rowIndex)) {
    // AG Grid focuses a right-clicked cell before emitting its context-menu event.
    // Preserve our range until that event decides whether the cell is inside it.
    expectedFocus.add(`${rowIndex}:${colId}`);
  }
}
function preventGridContextMenu(event: MouseEvent) {
  if (event.target instanceof Element && event.target.closest('.ag-cell:not([col-id="__row"])')) {
    event.preventDefault();
  }
}
function contextMenu(event: CellContextMenuEvent) {
  const mouse = event.event as MouseEvent | undefined;
  const rowIndex = event.node.rowIndex;
  const colId = event.column.getColId();
  if (!mouse || rowIndex == null || colId === "__row") return;
  mouse.preventDefault();
  const cell = { rowIndex, colId };
  contextCell.value = cell;
  selection.value = resultContextSelection(selection.value, columnIds(), cell);
  refreshSelection();
  contextMenuPosition.x = mouse.clientX;
  contextMenuPosition.y = mouse.clientY;
  contextMenuOpen.value = true;
}
function selectedData() {
  const area = getChenGridSelectionBounds(selection.value, columnIds());
  if (!area || !gridApi.value) return null;
  const ids = area.displayedColIds.slice(area.minCol, area.maxCol + 1);
  const selectedRows: Record<string, unknown>[] = [];
  for (let index = area.minRow; index <= area.maxRow; index++) {
    const row = gridApi.value.getDisplayedRowAtIndex(index)?.data;
    if (row) selectedRows.push(row);
  }
  const selectedColumns = ids.map((id) => ({ id, name: gridApi.value?.getColumn(id)?.getColDef().headerName || id }));
  return selectedRows.length ? { rows: selectedRows, columns: selectedColumns } : null;
}
async function copyText(text: string) {
  if (!props.canCopy) return;
  try {
    await writeClipboardText(text);
    toast.add({ title: t("Chen.SelectionCopied"), color: "success" });
  } catch {
    toast.add({ title: t("Common.CopyFailed"), color: "error" });
  }
}
function copySelection(headers = false) {
  if (!props.canCopy) return;
  const selected = selectedData();
  if (selected) void copyText(resultSelectionTsv(selected.rows, selected.columns, headers));
}
function preventCopy(event: ClipboardEvent) {
  if (!props.canCopy) {
    event.preventDefault();
    event.stopPropagation();
  }
}
function mouseDown(event: CellMouseDownEvent) {
  const mouse = event.event as MouseEvent | undefined;
  if (mouse && mouse.button !== 0) return;
  expectedFocus.clear();
  const rowIndex = event.node.rowIndex;
  if (rowIndex == null) return;
  const ids = columnIds();
  const id = event.column.getColId();
  if (id === "__row") {
    if (!ids.length) return;
    const row = mouse?.shiftKey ? (selection.value.anchor?.rowIndex ?? rowIndex) : rowIndex;
    selection.value = extendChenGridSelection(startChenGridSelection({ rowIndex: row, colId: ids[0]! }), {
      rowIndex,
      colId: ids.at(-1)!
    });
  } else {
    const cell = { rowIndex, colId: id };
    selection.value =
      mouse?.shiftKey && selection.value.anchor
        ? { ...extendChenGridSelection(selection.value, cell), dragging: true }
        : startChenGridSelection(cell);
  }
  refreshSelection();
}
function mouseOver(event: CellMouseOverEvent) {
  if (!selection.value.dragging || event.node.rowIndex == null) return;
  const mouse = event.event as MouseEvent | undefined;
  if (mouse && !(mouse.buttons & 1)) {
    finishSelection();
    return;
  }
  const colId = event.column.getColId();
  if (colId === "__row") return;
  selection.value = extendChenGridSelection(selection.value, { rowIndex: event.node.rowIndex, colId });
  refreshSelection();
}
function focused(event: CellFocusedEvent) {
  if (
    selection.value.dragging ||
    event.rowIndex == null ||
    !event.column ||
    typeof event.column === "string" ||
    !isColumn(event.column)
  )
    return;
  const colId = event.column.getColId();
  if (colId === "__row") return;
  selection.value = resultFocusSelection(selection.value, { rowIndex: event.rowIndex, colId }, expectedFocus);
  refreshSelection();
}
function openValue(cell: ChenGridCell | null = selection.value.current) {
  if (!cell || !gridApi.value) return;
  const row = gridApi.value.getDisplayedRowAtIndex(cell.rowIndex)?.data;
  const ordinal = Number(cell.colId.replace("column_", ""));
  const column = props.rows.columns[ordinal];
  if (!row || !column) return;
  valueCell.value = {
    name: columnNames.value[ordinal] || column.name,
    type: column.data_type,
    row: row.__row,
    value: row[cell.colId]
  };
  valueOpen.value = true;
}
function keydown(event: KeyboardEvent) {
  if (!(event.target instanceof HTMLElement) || !event.target.closest(".ag-cell")) return;
  if (
    !event.shiftKey &&
    ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab", "Home", "End", "PageUp", "PageDown"].includes(event.key)
  ) {
    expectedFocus.clear();
  }
  const modifier = event.metaKey || event.ctrlKey;
  if (modifier && event.key.toLowerCase() === "c") {
    event.preventDefault();
    event.stopPropagation();
    copySelection(event.shiftKey);
    return;
  }
  const api = gridApi.value;
  const ids = columnIds();
  if (!api || !ids.length) return;
  if (modifier && event.key.toLowerCase() === "a") {
    event.preventDefault();
    event.stopPropagation();
    if (!api.getDisplayedRowCount()) return;
    selection.value = finishChenGridSelection(
      extendChenGridSelection(startChenGridSelection({ rowIndex: 0, colId: ids[0]! }), {
        rowIndex: api.getDisplayedRowCount() - 1,
        colId: ids.at(-1)!
      })
    );
    refreshSelection();
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    openValue();
    return;
  }
  if (!event.shiftKey || !event.key.startsWith("Arrow")) return;
  const cell = selection.value.current;
  if (!cell) return;
  event.preventDefault();
  event.stopPropagation();
  const row = Math.min(
    api.getDisplayedRowCount() - 1,
    Math.max(0, cell.rowIndex + (event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0))
  );
  const index = Math.min(
    ids.length - 1,
    Math.max(0, ids.indexOf(cell.colId) + (event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0))
  );
  const next = { rowIndex: row, colId: ids[index]! };
  selection.value = finishChenGridSelection(extendChenGridSelection(selection.value, next));
  expectedFocus.add(`${row}:${next.colId}`);
  api.ensureIndexVisible(row);
  api.ensureColumnVisible(next.colId);
  api.setFocusedCell(row, next.colId);
  refreshSelection();
}
function ready(event: GridReadyEvent) {
  gridApi.value = event.api;
}
function modelUpdated() {
  shownRows.value = gridApi.value?.getDisplayedRowCount() || 0;
}
function pinChanged() {
  pinVersion.value++;
  refreshSelection();
}
watch(
  () => props.rows,
  () => {
    resetSelection();
    valueOpen.value = false;
  }
);
watch(
  () => props.rows.id,
  () => {
    filter.value = "";
  }
);
watch(filter, () => {
  resetSelection();
  gridApi.value?.setGridOption("quickFilterText", filter.value);
});
onMounted(() => {
  window.addEventListener("pointerup", finishSelection);
  window.addEventListener("blur", finishSelection);
});
onBeforeUnmount(() => {
  window.removeEventListener("pointerup", finishSelection);
  window.removeEventListener("blur", finishSelection);
  gridApi.value = null;
});
</script>

<template>
  <div class="flex h-full min-h-0 min-w-0 flex-col" data-chen-result-grid @copy.capture="preventCopy">
    <div class="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-default px-2 py-1.5">
      <UInput
        v-model="filter"
        icon="i-lucide-search"
        size="xs"
        class="w-40"
        :placeholder="t('Chen.GoV1GridFilter')"
        :aria-label="t('Chen.GoV1GridFilter')"
      >
        <template v-if="filter" #trailing>
          <UButton
            icon="i-lucide-x"
            size="xs"
            color="neutral"
            variant="link"
            :aria-label="t('Chen.GoV1GridClearFilter')"
            @click="filter = ''"
          />
        </template>
      </UInput>
      <span class="text-[11px] text-muted" :title="t('Chen.GoV1GridPageOnlyHint')">
        {{ t("Chen.GoV1GridPageOnly") }}
        <template v-if="filter">· {{ shownRows }}/{{ rows.rows.length }}</template>
      </span>
      <div class="ml-auto flex items-center gap-1">
        <UButton
          icon="i-lucide-copy"
          size="xs"
          color="neutral"
          variant="ghost"
          :disabled="!canCopy || !bounds"
          :title="t('Chen.GoV1GridCopy')"
          :aria-label="t('Chen.GoV1GridCopy')"
          @click="copySelection()"
        />
        <UButton
          icon="i-lucide-table-2"
          size="xs"
          color="neutral"
          variant="ghost"
          :disabled="!canCopy || !bounds"
          :title="t('Chen.GoV1GridCopyHeaders')"
          :aria-label="t('Chen.GoV1GridCopyHeaders')"
          @click="copySelection(true)"
        />
        <UButton
          icon="i-lucide-expand"
          size="xs"
          color="neutral"
          variant="ghost"
          :disabled="!bounds"
          :title="t('Chen.GoV1GridViewValue')"
          :aria-label="t('Chen.GoV1GridViewValue')"
          @click="openValue()"
        />
        <UDropdownMenu :items="menuItems">
          <UButton
            icon="i-lucide-columns-3"
            size="xs"
            color="neutral"
            variant="ghost"
            :title="t('Chen.GoV1GridColumns')"
            :aria-label="t('Chen.GoV1GridColumns')"
          />
        </UDropdownMenu>
      </div>
    </div>
    <div
      class="ag-theme-balham go-result-grid relative min-h-0 min-w-0 flex-1"
      @keydown.capture="keydown"
      @mousedown.capture="captureRightMouseDown"
      @contextmenu.capture="preventGridContextMenu"
    >
      <AgGridVue
        class="h-full w-full"
        theme="legacy"
        :locale-text="gridLocales[locale] || gridLocales.en"
        :column-defs="columns"
        :row-data="data"
        :default-col-def="defaults"
        :row-height="28"
        :header-height="30"
        :animate-rows="false"
        :ensure-dom-order="true"
        :enable-browser-tooltips="true"
        :suppress-cell-focus="false"
        :suppress-overlays="['noRows', 'noMatchingRows']"
        @grid-ready="ready"
        @cell-mouse-down="mouseDown"
        @cell-mouse-over="mouseOver"
        @cell-focused="focused"
        @cell-double-clicked="openValue()"
        @cell-context-menu="contextMenu"
        @sort-changed="resetSelection"
        @model-updated="modelUpdated"
        @column-pinned="pinChanged"
      />
      <div
        v-if="shownRows === 0"
        class="pointer-events-none absolute inset-x-0 top-[30px] bottom-0 flex flex-col items-center justify-center gap-2 px-4 text-xs text-muted"
        role="status"
      >
        <span>{{ t(filter ? "Chen.GoV1GridNoMatches" : "Chen.GoV1EmptyRows") }}</span>
        <UButton
          v-if="filter"
          class="pointer-events-auto"
          color="neutral"
          variant="soft"
          size="xs"
          :label="t('Chen.GoV1GridClearFilter')"
          @click="filter = ''"
        />
      </div>
    </div>
    <UDropdownMenu
      v-model:open="contextMenuOpen"
      :items="contextMenuItems"
      :content="{ align: 'start', side: 'bottom' }"
    >
      <div
        class="pointer-events-none fixed h-px w-px"
        :style="{ left: `${contextMenuPosition.x}px`, top: `${contextMenuPosition.y}px` }"
      />
    </UDropdownMenu>
    <div
      class="flex shrink-0 items-center justify-between gap-2 border-t border-default px-2 py-1 text-[11px] text-muted"
    >
      <span class="truncate" :title="[positionLabel, selectionLabel].filter(Boolean).join(' · ')">
        <template v-if="positionLabel">{{ positionLabel }} ·</template>
        {{ selectionLabel }}
      </span>
      <span class="shrink-0">{{ t("Chen.GoV1GridReadOnly") }}</span>
    </div>
    <GoResultValue v-if="valueOpen && valueCell" v-model:open="valueOpen" :cell="valueCell" :can-copy="canCopy" />
  </div>
</template>

<style scoped>
.go-result-grid,
.go-result-grid :deep(.ag-theme-balham),
.go-result-grid :deep(.ag-root-wrapper) {
  --ag-font-family: var(--font-ui-mono, var(--font-mono));
  --ag-font-size: 12px;
  --ag-background-color: var(--data-grid-row-background);
  --ag-data-background-color: var(--data-grid-row-background);
  --ag-foreground-color: var(--data-grid-text);
  --ag-header-background-color: var(--data-grid-header-background);
  --ag-header-foreground-color: var(--data-grid-text);
  --ag-odd-row-background-color: var(--data-grid-row-striped);
  --ag-row-hover-color: var(--data-grid-row-hover);
  --ag-border-color: var(--data-grid-border);
  --ag-row-border-color: var(--data-grid-border);
  --ag-cell-horizontal-border: solid var(--data-grid-border);
  --ag-header-column-resize-handle-color: var(--theme-accent);
  --ag-range-selection-border-color: var(--theme-accent);
  --ag-wrapper-border-radius: 0;
  --ag-border-radius: 0;
  background: var(--data-grid-row-background);
}
.go-result-grid :deep(.ag-root-wrapper) {
  border: 0;
}
.go-result-grid :deep(.ag-header-cell-text) {
  min-width: 0;
}
.go-result-grid :deep(.result-column-heading) {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
.go-result-grid :deep(.result-column-name) {
  overflow: hidden;
  text-overflow: ellipsis;
}
.go-result-grid :deep(.result-column-type) {
  flex-shrink: 0;
  color: var(--data-grid-text-muted);
  font-size: 9px;
  font-weight: normal;
}
.go-result-grid :deep(.result-row-number) {
  color: var(--data-grid-text-muted);
  text-align: right;
  cursor: pointer;
}
.go-result-grid :deep(.result-selected-cell) {
  background: var(--data-grid-row-selected);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--theme-accent) 35%, transparent);
}
.go-result-grid :deep(.result-null-cell),
.go-result-grid :deep(.result-empty-cell) {
  color: var(--data-grid-text-muted);
  font-style: italic;
}
</style>
