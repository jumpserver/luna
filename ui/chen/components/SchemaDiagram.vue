<script setup lang="ts">
import type { ChenSchemaDiagramTable } from "~/chen/types/schemaOverview";

const props = withDefaults(
  defineProps<{
    tables: ChenSchemaDiagramTable[];
    relationshipsSupported: boolean;
    title?: string;
    searchable?: boolean;
    openable?: boolean;
    initialTableName?: string;
  }>(),
  {
    title: "Schema Diagram",
    searchable: true,
    openable: true,
    initialTableName: ""
  }
);

const emit = defineEmits<{
  openTable: [tableName: string];
}>();

const viewport = shallowRef<HTMLElement | null>(null);
const scale = ref(1);
const offset = reactive({ x: 0, y: 0 });
const dragging = ref(false);
const searchQuery = ref("");
const searchFocused = ref(false);
const selectedId = ref<string | null>(null);
const showRelated = ref(false);
const focusMode = ref(false);
let dragStart = { x: 0, y: 0, offsetX: 0, offsetY: 0 };
let resizeObserver: ResizeObserver | null = null;

const entityWidth = 270;
const headerHeight = 44;
const rowHeight = 27;
const maxVisibleColumns = 10;
const horizontalGap = 90;
const verticalGap = 70;
const worldPadding = 80;
const cellHeight = headerHeight + maxVisibleColumns * rowHeight + 24;

function tableId(schema: string | null | undefined, table: string) {
  return `${schema || ""}\0${table}`;
}

const allTables = computed(() =>
  props.tables.map((table) => ({
    ...table,
    id: tableId(table.schema, table.name)
  }))
);
const allTablesById = computed(() => new Map(allTables.value.map((table) => [table.id, table])));
const allRelationships = computed(() =>
  allTables.value.flatMap((source) =>
    source.foreignKeys.flatMap((foreignKey) => {
      if (!foreignKey.referencedTable) return [];
      const targetId = tableId(foreignKey.referencedSchema || source.schema, foreignKey.referencedTable);
      if (!allTablesById.value.has(targetId)) return [];
      return [{ id: `${source.id}:${foreignKey.name}:${targetId}`, sourceId: source.id, targetId, foreignKey }];
    })
  )
);

const normalizedSearch = computed(() => searchQuery.value.trim().toLowerCase());
const searchMatches = computed(() => {
  const query = normalizedSearch.value;
  if (!query) return [];
  return allTables.value
    .filter(
      (table) =>
        table.name.toLowerCase().includes(query) || `${table.schema}.${table.name}`.toLowerCase().includes(query)
    )
    .sort((left, right) => {
      const leftName = left.name.toLowerCase();
      const rightName = right.name.toLowerCase();
      const leftRank = leftName === query ? 0 : leftName.startsWith(query) ? 1 : 2;
      const rightRank = rightName === query ? 0 : rightName.startsWith(query) ? 1 : 2;
      return leftRank - rightRank || leftName.localeCompare(rightName);
    })
    .slice(0, 12);
});

watch(normalizedSearch, (query) => {
  focusMode.value = false;
  showRelated.value = false;
  if (!query) {
    selectedId.value = null;
    nextTick(fit);
    return;
  }
  selectedId.value = searchMatches.value[0]?.id || null;
  if (selectedId.value) nextTick(() => centerOnTable(selectedId.value as string));
});

const selectedTable = computed(() => (selectedId.value ? allTablesById.value.get(selectedId.value) || null : null));
const relatedIds = computed(() => {
  const ids = new Set<string>();
  if (!selectedId.value) return ids;
  for (const relationship of allRelationships.value) {
    if (relationship.sourceId === selectedId.value) ids.add(relationship.targetId);
    if (relationship.targetId === selectedId.value) ids.add(relationship.sourceId);
  }
  return ids;
});
const relatedTables = computed(() => {
  if (!selectedId.value) return [];
  const details = new Map<string, { id: string; name: string; schema: string; outgoing: boolean; incoming: boolean }>();
  for (const relationship of allRelationships.value) {
    let relatedId: string | null = null;
    let outgoing = false;
    if (relationship.sourceId === selectedId.value) {
      relatedId = relationship.targetId;
      outgoing = true;
    } else if (relationship.targetId === selectedId.value) {
      relatedId = relationship.sourceId;
    }
    if (!relatedId) continue;
    const table = allTablesById.value.get(relatedId);
    if (!table) continue;
    const current = details.get(relatedId) || {
      id: relatedId,
      name: table.name,
      schema: table.schema,
      outgoing: false,
      incoming: false
    };
    if (outgoing) current.outgoing = true;
    else current.incoming = true;
    details.set(relatedId, current);
  }
  return [...details.values()].sort((left, right) => left.name.localeCompare(right.name));
});

const visibleTables = computed(() => {
  if (!focusMode.value || !selectedId.value) return allTables.value;
  return allTables.value.filter((table) => table.id === selectedId.value || relatedIds.value.has(table.id));
});
const columnCount = computed(() => Math.max(1, Math.ceil(Math.sqrt(visibleTables.value.length * 1.5))));
const rowCount = computed(() => Math.max(1, Math.ceil(visibleTables.value.length / columnCount.value)));
const world = computed(() => ({
  width: worldPadding * 2 + columnCount.value * entityWidth + (columnCount.value - 1) * horizontalGap,
  height: worldPadding * 2 + rowCount.value * cellHeight + (rowCount.value - 1) * verticalGap
}));

const entities = computed(() =>
  visibleTables.value.map((table, index) => ({
    ...table,
    x: worldPadding + (index % columnCount.value) * (entityWidth + horizontalGap),
    y: worldPadding + Math.floor(index / columnCount.value) * (cellHeight + verticalGap),
    primaryColumns: new Set(table.primaryKey)
  }))
);

const relationLines = computed(() => {
  const byId = new Map(entities.value.map((entity) => [entity.id, entity]));
  return allRelationships.value.flatMap((relationship) => {
    const source = byId.get(relationship.sourceId);
    const target = byId.get(relationship.targetId);
    if (!source || !target) return [];
    const sourceColumn = relationship.foreignKey.columns[0];
    const targetColumn = relationship.foreignKey.referencedColumns[0];
    const sourceIndex = Math.max(
      0,
      Math.min(
        maxVisibleColumns - 1,
        source.columns.findIndex((column) => column.name === sourceColumn)
      )
    );
    const targetIndex = Math.max(
      0,
      Math.min(
        maxVisibleColumns - 1,
        target.columns.findIndex((column) => column.name === targetColumn)
      )
    );
    const targetIsRight = target.x >= source.x;
    return [
      {
        ...relationship,
        x1: targetIsRight ? source.x + entityWidth : source.x,
        y1: source.y + headerHeight + sourceIndex * rowHeight + rowHeight / 2,
        x2: targetIsRight ? target.x : target.x + entityWidth,
        y2: target.y + headerHeight + targetIndex * rowHeight + rowHeight / 2
      }
    ];
  });
});

function chooseTable(id: string, syncSearch = false) {
  selectedId.value = id;
  focusMode.value = false;
  showRelated.value = false;
  if (syncSearch) searchQuery.value = allTablesById.value.get(id)?.name || "";
}

function clearSelection() {
  searchQuery.value = "";
  selectedId.value = null;
  showRelated.value = false;
  focusMode.value = false;
  nextTick(fit);
}

function toggleRelated() {
  if (!selectedId.value) return;
  showRelated.value = !showRelated.value;
}

function toggleFocus() {
  if (!selectedId.value) return;
  focusMode.value = !focusMode.value;
  showRelated.value = true;
  nextTick(fit);
}

function entityOpacity(id: string) {
  if (!selectedId.value || focusMode.value || id === selectedId.value) return 1;
  return showRelated.value && relatedIds.value.has(id) ? 1 : 0.16;
}

function relationOpacity(sourceId: string, targetId: string) {
  if (!selectedId.value) return 0.55;
  const connected = sourceId === selectedId.value || targetId === selectedId.value;
  return connected && (showRelated.value || focusMode.value) ? 1 : 0.06;
}

function selectInitialTable() {
  if (!props.initialTableName || selectedId.value) return;
  const table = allTables.value.find((item) => item.name === props.initialTableName);
  if (!table) return;
  selectedId.value = table.id;
  showRelated.value = !props.searchable;
}

function centerOnTable(id: string) {
  if (!viewport.value) return;
  const entity = entities.value.find((item) => item.id === id);
  if (!entity) return;
  const rect = viewport.value.getBoundingClientRect();
  const nextScale = Math.max(0.72, scale.value);
  const entityHeight = headerHeight + Math.max(1, Math.min(entity.columns.length, maxVisibleColumns)) * rowHeight;
  scale.value = nextScale;
  offset.x = rect.width / 2 - (entity.x + entityWidth / 2) * nextScale;
  offset.y = rect.height / 2 - (entity.y + entityHeight / 2) * nextScale;
}

function fit() {
  if (!viewport.value) return;
  const rect = viewport.value.getBoundingClientRect();
  scale.value = Math.min(
    1,
    Math.max(0.08, Math.min((rect.width - 48) / world.value.width, (rect.height - 48) / world.value.height))
  );
  offset.x = (rect.width - world.value.width * scale.value) / 2;
  offset.y = (rect.height - world.value.height * scale.value) / 2;
}

function setScale(next: number, originX?: number, originY?: number) {
  if (!viewport.value) return;
  const rect = viewport.value.getBoundingClientRect();
  const x = originX ?? rect.width / 2;
  const y = originY ?? rect.height / 2;
  const oldScale = scale.value;
  const clamped = Math.min(1.8, Math.max(0.08, next));
  offset.x = x - ((x - offset.x) / oldScale) * clamped;
  offset.y = y - ((y - offset.y) / oldScale) * clamped;
  scale.value = clamped;
}

function handleWheel(event: WheelEvent) {
  const rect = viewport.value?.getBoundingClientRect();
  if (!rect) return;
  setScale(scale.value * (event.deltaY > 0 ? 0.9 : 1.1), event.clientX - rect.left, event.clientY - rect.top);
}

function startDrag(event: PointerEvent) {
  if (event.button !== 0) return;
  dragging.value = true;
  dragStart = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function drag(event: PointerEvent) {
  if (!dragging.value) return;
  offset.x = dragStart.offsetX + event.clientX - dragStart.x;
  offset.y = dragStart.offsetY + event.clientY - dragStart.y;
}

onMounted(() => {
  selectInitialTable();
  fit();
  if (viewport.value && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => fit());
    resizeObserver.observe(viewport.value);
  }
});

watch(
  () => props.tables,
  () => {
    selectInitialTable();
    nextTick(fit);
  }
);

onBeforeUnmount(() => resizeObserver?.disconnect());
</script>

<template>
  <div class="relative h-full min-h-0 overflow-hidden bg-[var(--workspace-surface-background)]">
    <div
      class="absolute inset-x-3 top-3 z-30 flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-default bg-[var(--app-surface-overlay)] p-2 shadow-sm"
    >
      <div class="mr-1 shrink-0">
        <div class="text-xs font-semibold">{{ title }}</div>
        <div class="text-[10px] text-muted">
          <template v-if="focusMode">{{ visibleTables.length }} of</template>
          {{ tables.length }} tables ·
          <template v-if="focusMode">{{ relationLines.length }} of</template>
          {{ allRelationships.length }} relationships
          <span v-if="!relationshipsSupported">· FK metadata unsupported</span>
        </div>
      </div>

      <div v-if="searchable" class="relative min-w-48 flex-1 sm:max-w-72">
        <UInput
          v-model="searchQuery"
          icon="i-lucide-search"
          size="sm"
          placeholder="Search tables..."
          class="w-full"
          @focus="searchFocused = true"
          @blur="searchFocused = false"
          @keydown.esc="clearSelection"
        />
        <div
          v-if="searchFocused && normalizedSearch"
          class="absolute left-0 right-0 top-full z-40 mt-1 max-h-64 overflow-auto rounded-lg border border-default bg-[var(--app-surface-overlay)] p-1 shadow-lg"
        >
          <button
            v-for="match in searchMatches"
            :key="match.id"
            type="button"
            class="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accented"
            :class="match.id === selectedId ? 'bg-accented text-primary' : ''"
            @mousedown.prevent="chooseTable(match.id, true)"
          >
            <span class="truncate">{{ match.name }}</span>
            <span class="shrink-0 text-[10px] text-muted">{{ match.schema }}</span>
          </button>
          <div v-if="!searchMatches.length" class="px-2 py-2 text-xs text-muted">No matching tables.</div>
        </div>
      </div>

      <UButton
        v-if="searchable"
        size="xs"
        color="neutral"
        :variant="showRelated ? 'solid' : 'soft'"
        icon="i-lucide-git-fork"
        :disabled="!selectedTable || !relatedTables.length"
        @click="toggleRelated"
      >
        View related
      </UButton>
      <UButton
        v-if="searchable"
        size="xs"
        :color="focusMode ? 'primary' : 'neutral'"
        :variant="focusMode ? 'solid' : 'soft'"
        icon="i-lucide-focus"
        :disabled="!selectedTable"
        @click="toggleFocus"
      >
        Focus
      </UButton>
      <UButton
        v-if="searchable && selectedTable"
        icon="i-lucide-x"
        size="xs"
        color="neutral"
        variant="ghost"
        aria-label="Clear diagram selection"
        @click="clearSelection"
      />

      <div class="ml-auto flex shrink-0 items-center gap-1">
        <UButton
          icon="i-lucide-minus"
          size="xs"
          color="neutral"
          variant="ghost"
          aria-label="Zoom out"
          @click="setScale(scale / 1.15)"
        />
        <span class="w-11 text-center text-[11px] tabular-nums text-muted">{{ Math.round(scale * 100) }}%</span>
        <UButton
          icon="i-lucide-plus"
          size="xs"
          color="neutral"
          variant="ghost"
          aria-label="Zoom in"
          @click="setScale(scale * 1.15)"
        />
        <UButton icon="i-lucide-scan" size="xs" color="neutral" variant="ghost" aria-label="Fit diagram" @click="fit" />
      </div>
    </div>

    <div
      v-if="searchable && showRelated && selectedTable"
      class="absolute bottom-3 left-3 z-30 w-64 overflow-hidden rounded-lg border border-default bg-[var(--app-surface-overlay)] shadow-lg"
    >
      <div class="border-b border-default px-3 py-2">
        <div class="truncate text-xs font-semibold">{{ selectedTable.name }}</div>
        <div class="text-[10px] text-muted">{{ relatedTables.length }} directly related tables</div>
      </div>
      <div class="max-h-56 overflow-auto p-1">
        <button
          v-for="related in relatedTables"
          :key="related.id"
          type="button"
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accented"
          @click="chooseTable(related.id, true)"
        >
          <span class="w-4 shrink-0 text-center text-muted">
            {{ related.outgoing && related.incoming ? "↔" : related.outgoing ? "→" : "←" }}
          </span>
          <span class="min-w-0 flex-1 truncate">{{ related.name }}</span>
          <span class="shrink-0 text-[10px] text-muted">{{ related.schema }}</span>
        </button>
        <div v-if="!relatedTables.length" class="px-2 py-3 text-center text-xs text-muted">No related tables.</div>
      </div>
    </div>

    <div
      ref="viewport"
      class="diagram-grid h-full touch-none overflow-hidden"
      :class="dragging ? 'cursor-grabbing' : 'cursor-grab'"
      @wheel.prevent="handleWheel"
      @pointerdown="startDrag"
      @pointermove="drag"
      @pointerup="dragging = false"
      @pointercancel="dragging = false"
    >
      <div
        class="absolute left-0 top-0 origin-top-left"
        :style="{
          width: `${world.width}px`,
          height: `${world.height}px`,
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`
        }"
      >
        <svg class="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden="true">
          <defs>
            <marker
              id="schema-diagram-relation-end"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--app-text-muted)" />
            </marker>
          </defs>
          <path
            v-for="line in relationLines"
            :key="line.id"
            :d="`M ${line.x1} ${line.y1} C ${(line.x1 + line.x2) / 2} ${line.y1}, ${(line.x1 + line.x2) / 2} ${line.y2}, ${line.x2} ${line.y2}`"
            fill="none"
            stroke="var(--app-text-muted)"
            stroke-width="1.5"
            marker-end="url(#schema-diagram-relation-end)"
            class="transition-opacity duration-200"
            :style="{ opacity: relationOpacity(line.sourceId, line.targetId) }"
          />
        </svg>

        <section
          v-for="entity in entities"
          :key="entity.id"
          class="absolute overflow-hidden rounded-lg border bg-[var(--app-surface-card)] shadow-md transition-all duration-200"
          :class="
            entity.id === selectedId
              ? 'border-primary ring-2 ring-primary/35'
              : relatedIds.has(entity.id) && showRelated
                ? 'border-primary/50'
                : 'border-default'
          "
          :style="{
            left: `${entity.x}px`,
            top: `${entity.y}px`,
            width: `${entityWidth}px`,
            opacity: entityOpacity(entity.id)
          }"
          @pointerdown.stop
        >
          <header
            class="flex h-11 items-center gap-1 border-b border-default bg-[var(--workspace-surface-sub-header)] pr-1"
          >
            <button
              type="button"
              class="flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-left hover:bg-accented"
              :title="`Select ${entity.schema}.${entity.name}`"
              @click="chooseTable(entity.id)"
              @dblclick="openable && emit('openTable', entity.name)"
            >
              <UIcon name="i-lucide-table-2" class="size-4 shrink-0 text-primary" />
              <div class="min-w-0 flex-1">
                <div class="truncate text-xs font-semibold">{{ entity.name }}</div>
                <div class="truncate text-[10px] text-muted">{{ entity.schema }}</div>
              </div>
            </button>
            <UButton
              v-if="openable"
              icon="i-lucide-external-link"
              size="xs"
              color="neutral"
              variant="ghost"
              :aria-label="`Open table ${entity.name}`"
              @click.stop="emit('openTable', entity.name)"
            />
          </header>
          <div v-if="entity.columns.length">
            <div
              v-for="column in entity.columns.slice(0, maxVisibleColumns)"
              :key="column.name"
              class="flex h-[27px] items-center gap-2 border-b border-default/60 px-3 text-[11px] last:border-b-0"
            >
              <UIcon
                :name="entity.primaryColumns.has(column.name) ? 'i-lucide-key-round' : 'i-lucide-minus'"
                class="size-3 shrink-0"
                :class="entity.primaryColumns.has(column.name) ? 'text-warning' : 'text-muted'"
              />
              <span class="min-w-0 flex-1 truncate font-ui-mono">{{ column.name }}</span>
              <span class="max-w-24 truncate text-muted">{{ column.nativeType }}</span>
            </div>
            <div v-if="entity.columns.length > maxVisibleColumns" class="h-6 px-3 py-1 text-[10px] text-muted">
              +{{ entity.columns.length - maxVisibleColumns }} more columns
            </div>
          </div>
          <div v-else class="flex h-7 items-center px-3 text-[11px] text-muted">No columns</div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diagram-grid {
  background-image: radial-gradient(
    circle,
    color-mix(in srgb, var(--app-text-muted) 24%, transparent) 1px,
    transparent 1px
  );
  background-size: 20px 20px;
}
</style>
