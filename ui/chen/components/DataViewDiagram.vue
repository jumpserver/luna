<script setup lang="ts">
import type {
  ChenDataViewColumnPreview,
  ChenDataViewForeignKeyPreview
} from "~/chen/composables/useChenDataViewDerivedMeta";

interface DiagramEntity {
  id: string;
  name: string;
  schema?: string;
  x: number;
  y: number;
  columns: Array<{ name: string; type: string; key?: string }>;
}

const props = defineProps<{
  table: string;
  schema?: string;
  columns: ChenDataViewColumnPreview[];
  foreignKeys: ChenDataViewForeignKeyPreview[];
}>();

const viewport = shallowRef<HTMLElement | null>(null);
const scale = ref(1);
const offset = reactive({ x: 0, y: 0 });
const dragging = ref(false);
let dragStart = { x: 0, y: 0, offsetX: 0, offsetY: 0 };
const world = { width: 1120, height: 700 };
const entityWidth = 280;
const headerHeight = 44;
const rowHeight = 28;
let resizeObserver: ResizeObserver | null = null;

function parseReference(reference: string) {
  const value = reference.trim();
  const openParenthesis = value.lastIndexOf("(");
  const closeParenthesis = value.endsWith(")") ? value.length - 1 : -1;
  const tableIdentifier = (openParenthesis >= 0 ? value.slice(0, openParenthesis) : value).trim();
  const separator = tableIdentifier.lastIndexOf(".");
  return {
    schema: separator >= 0 ? tableIdentifier.slice(0, separator).trim() : undefined,
    table: (separator >= 0 ? tableIdentifier.slice(separator + 1) : tableIdentifier).trim() || "Related table",
    column:
      openParenthesis >= 0 && closeParenthesis > openParenthesis
        ? value.slice(openParenthesis + 1, closeParenthesis).trim() || "id"
        : "id"
  };
}

const parsedRelations = computed(() => {
  const relations = new Map<
    string,
    { table: string; schema?: string; columns: Set<string>; localColumns: Set<string> }
  >();
  for (const foreignKey of props.foreignKeys) {
    const { column, schema, table } = parseReference(foreignKey.references);
    const id = `${schema || ""}.${table}`;
    const relation = relations.get(id) || {
      table,
      schema,
      columns: new Set<string>(),
      localColumns: new Set<string>()
    };
    relation.columns.add(column);
    relation.localColumns.add(foreignKey.column);
    relations.set(id, relation);
  }
  return [...relations.entries()].map(([id, relation]) => ({
    id,
    ...relation,
    columns: [...relation.columns],
    localColumns: [...relation.localColumns]
  }));
});

const entities = computed<DiagramEntity[]>(() => {
  const related = parsedRelations.value;
  const centerY = Math.max(48, (world.height - entityHeight(props.columns.length)) / 2);
  const result: DiagramEntity[] = [
    {
      id: "current",
      name: props.table,
      schema: props.schema,
      x: related.length ? 170 : (world.width - entityWidth) / 2,
      y: centerY,
      columns: props.columns.map((column) => ({ name: column.name, type: column.type, key: column.key }))
    }
  ];

  related.forEach((relation, index) => {
    const spacing = world.height / (related.length + 1);
    result.push({
      id: relation.id,
      name: relation.table,
      schema: relation.schema,
      x: 670,
      y: Math.max(30, spacing * (index + 1) - entityHeight(relation.columns.length) / 2),
      columns: relation.columns.map((name) => ({ name, type: "-", key: "PK" }))
    });
  });
  return result;
});

const relationLines = computed(() => {
  const current = entities.value[0];
  if (!current) return [];
  return entities.value.slice(1).map((entity) => {
    const relation = parsedRelations.value.find((item) => item.id === entity.id);
    const localColumnIndex = Math.max(
      0,
      current.columns.findIndex((column) => relation?.localColumns.includes(column.name))
    );
    return {
      id: entity.id,
      x1: current.x + entityWidth,
      y1: current.y + headerHeight + Math.min(11, localColumnIndex) * rowHeight + rowHeight / 2,
      x2: entity.x,
      y2: entity.y + headerHeight + rowHeight / 2
    };
  });
});

function entityHeight(columnCount: number) {
  return headerHeight + Math.max(1, Math.min(columnCount, 12)) * rowHeight;
}

function fit() {
  if (!viewport.value) return;
  const rect = viewport.value.getBoundingClientRect();
  scale.value = Math.min(
    1,
    Math.max(0.35, Math.min((rect.width - 48) / world.width, (rect.height - 48) / world.height))
  );
  offset.x = (rect.width - world.width * scale.value) / 2;
  offset.y = (rect.height - world.height * scale.value) / 2;
}

function setScale(next: number, originX?: number, originY?: number) {
  if (!viewport.value) return;
  const rect = viewport.value.getBoundingClientRect();
  const x = originX ?? rect.width / 2;
  const y = originY ?? rect.height / 2;
  const oldScale = scale.value;
  const clamped = Math.min(1.8, Math.max(0.35, next));
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
  fit();
  if (viewport.value && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => fit());
    resizeObserver.observe(viewport.value);
  }
});

onBeforeUnmount(() => resizeObserver?.disconnect());
</script>

<template>
  <div class="relative h-full min-h-0 overflow-hidden bg-[var(--workspace-surface-background)]">
    <div
      class="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-lg border border-default bg-[var(--app-surface-overlay)] p-1 shadow-sm"
    >
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
              id="diagram-relation-end"
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
            :d="`M ${line.x1} ${line.y1} C ${line.x1 + 90} ${line.y1}, ${line.x2 - 90} ${line.y2}, ${line.x2} ${line.y2}`"
            fill="none"
            stroke="var(--app-text-muted)"
            stroke-width="1.5"
            marker-end="url(#diagram-relation-end)"
          />
        </svg>

        <section
          v-for="entity in entities"
          :key="entity.id"
          class="absolute overflow-hidden rounded-lg border bg-[var(--app-surface-card)] shadow-md"
          :class="entity.id === 'current' ? 'border-primary/60' : 'border-default'"
          :style="{ left: `${entity.x}px`, top: `${entity.y}px`, width: `${entityWidth}px` }"
          @pointerdown.stop
        >
          <header
            class="flex h-11 items-center gap-2 border-b border-default bg-[var(--workspace-surface-sub-header)] px-3"
          >
            <UIcon name="i-lucide-table-2" class="size-4 shrink-0 text-primary" />
            <div class="min-w-0 flex-1">
              <div class="truncate text-xs font-semibold">{{ entity.name }}</div>
              <div v-if="entity.schema" class="truncate text-[10px] text-muted">{{ entity.schema }}</div>
            </div>
            <UBadge v-if="entity.id === 'current'" size="sm" color="primary" variant="subtle">Current</UBadge>
          </header>
          <div v-if="entity.columns.length">
            <div
              v-for="column in entity.columns.slice(0, 12)"
              :key="column.name"
              class="flex h-7 items-center gap-2 border-b border-default/60 px-3 text-[11px] last:border-b-0"
            >
              <UIcon
                :name="column.key === 'PK' ? 'i-lucide-key-round' : 'i-lucide-minus'"
                class="size-3 shrink-0"
                :class="column.key === 'PK' ? 'text-warning' : 'text-muted'"
              />
              <span class="min-w-0 flex-1 truncate font-ui-mono">{{ column.name }}</span>
              <span class="max-w-24 truncate text-muted">{{ column.type }}</span>
            </div>
          </div>
          <div v-else class="flex h-7 items-center px-3 text-[11px] text-muted">No columns</div>
        </section>

        <div
          v-if="!foreignKeys.length"
          class="absolute bottom-12 left-1/2 -translate-x-1/2 text-center text-xs text-muted"
        >
          No relationships found for this table.
        </div>
      </div>
    </div>

    <div
      v-if="foreignKeys.some((foreignKey) => foreignKey.inferred)"
      class="absolute bottom-3 left-3 z-20 flex items-center gap-1.5 rounded-md border border-default bg-[var(--app-surface-overlay)] px-2 py-1 text-[11px] text-muted"
    >
      <UIcon name="i-lucide-info" class="size-3.5" />
      Relationships inferred from column names
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
