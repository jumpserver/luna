<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

export interface WorkspaceSubTab {
  id: string;
  label: string;
  icon: string;
  title?: string;
  dirty?: boolean;
  preview?: boolean;
}

const props = withDefaults(
  defineProps<{
    tabs: WorkspaceSubTab[];
    activeId: string;
    reorderable?: boolean;
    contextMenu?: boolean;
    draggedId?: string;
    closeLabel?: string;
  }>(),
  {
    reorderable: false,
    contextMenu: false,
    draggedId: "",
    closeLabel: "Close"
  }
);

const emit = defineEmits<{
  select: [id: string];
  close: [id: string];
  reorder: [sourceId: string, targetId: string, placement: "before" | "after"];
  contextmenu: [id: string, event: MouseEvent];
  dragstart: [id: string];
  dragend: [];
  pin: [id: string];
}>();

const strip = ref<HTMLElement | null>(null);
const localDraggedId = ref("");
const dropTargetId = ref("");
const dropPlacement = ref<"before" | "after">("before");
const editorTabMime = "application/x-jumpserver-editor-tab";

function clearDragState() {
  localDraggedId.value = "";
  dropTargetId.value = "";
  dropPlacement.value = "before";
}

function draggedTabId(event: DragEvent) {
  return localDraggedId.value || props.draggedId || event.dataTransfer?.getData(editorTabMime) || "";
}

function beginDrag(id: string, event: DragEvent) {
  if (!props.reorderable || !event.dataTransfer) {
    event.preventDefault();
    return;
  }
  localDraggedId.value = id;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(editorTabMime, id);
  event.dataTransfer.setData("text/plain", id);
  emit("dragstart", id);
}

function dragOver(id: string, event: DragEvent) {
  const sourceId = draggedTabId(event);
  if (!props.reorderable || !sourceId) return;
  event.preventDefault();
  event.stopPropagation();
  if (sourceId === id) {
    dropTargetId.value = "";
    return;
  }
  const element = event.currentTarget as HTMLElement;
  dropTargetId.value = id;
  dropPlacement.value =
    event.clientX < element.getBoundingClientRect().left + element.offsetWidth / 2 ? "before" : "after";
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

function dropTab(id: string, event: DragEvent) {
  const sourceId = draggedTabId(event);
  if (!props.reorderable || !sourceId || sourceId === id) {
    clearDragState();
    emit("dragend");
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  emit("reorder", sourceId, id, dropPlacement.value);
  clearDragState();
  emit("dragend");
}

function endDrag() {
  clearDragState();
  emit("dragend");
}

function openContextMenu(id: string, event: MouseEvent) {
  if (!props.contextMenu) return;
  event.preventDefault();
  emit("contextmenu", id, event);
}

function closeWithMiddleClick(id: string, event: MouseEvent) {
  if (event.button !== 1) return;
  event.preventDefault();
  emit("close", id);
}

function scrollTabs(event: WheelEvent) {
  const element = strip.value;
  if (!element || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
  if (element.scrollWidth <= element.clientWidth) return;
  element.scrollLeft += event.deltaY;
  event.preventDefault();
}

watch(
  () => props.activeId,
  async () => {
    await nextTick();
    strip.value?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest"
    });
  },
  { flush: "post" }
);
</script>

<template>
  <div
    v-if="tabs.length"
    class="workspace-sub-tab-bar flex min-w-0 shrink-0 items-center gap-1 bg-transparent px-2 py-1.5"
  >
    <div class="min-w-0 flex-1 overflow-hidden">
      <div class="workspace-sub-tab-capsule flex w-fit min-w-0 max-w-full items-center rounded-lg p-px">
        <div
          ref="strip"
          role="tablist"
          class="workspace-sub-tab-strip flex w-fit min-w-0 max-w-full items-center gap-0.5 overflow-x-auto"
          @wheel="scrollTabs"
        >
          <div
            v-for="tab in tabs"
            :key="tab.id"
            class="workspace-sub-tab-button group relative flex h-7 min-w-0 shrink-0 items-center gap-1.5 rounded-lg px-2 text-left transition-all duration-150"
            :class="[
              activeId === tab.id ? 'max-w-72 px-2.5' : 'max-w-44',
              activeId === tab.id
                ? 'workspace-sub-tab-button-active text-[var(--app-fg)]'
                : 'text-[var(--app-muted)] hover:bg-[var(--app-hover-soft)] hover:text-[var(--app-fg)]',
              reorderable ? 'cursor-grab active:cursor-grabbing' : '',
              localDraggedId === tab.id || draggedId === tab.id ? 'opacity-45' : '',
              tab.preview ? 'italic' : ''
            ]"
            role="tab"
            :aria-label="tab.label"
            :aria-selected="activeId === tab.id"
            :tabindex="activeId === tab.id ? 0 : -1"
            :draggable="reorderable"
            :title="tab.title || tab.label"
            @click="$emit('select', tab.id)"
            @dblclick="$emit('pin', tab.id)"
            @keydown.enter.prevent="$emit('select', tab.id)"
            @keydown.space.prevent="$emit('select', tab.id)"
            @auxclick="closeWithMiddleClick(tab.id, $event)"
            @contextmenu="openContextMenu(tab.id, $event)"
            @dragstart="beginDrag(tab.id, $event)"
            @dragover="dragOver(tab.id, $event)"
            @drop="dropTab(tab.id, $event)"
            @dragend="endDrag"
          >
            <span
              v-if="dropTargetId === tab.id && dropPlacement === 'before'"
              class="absolute -left-0.5 inset-y-1 w-0.5 rounded-full bg-primary"
            />
            <UIcon
              :name="tab.icon"
              class="size-3.5 shrink-0"
              :class="activeId === tab.id ? 'text-primary' : 'text-[var(--app-muted)] group-hover:text-[var(--app-fg)]'"
            />
            <span class="min-w-0 truncate font-ui-mono text-[11px] tracking-[0.01em]">{{ tab.label }}</span>
            <span v-if="tab.dirty" class="size-1.5 shrink-0 rounded-full bg-primary" title="未保存" />
            <button
              type="button"
              class="flex size-3.5 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity hover:bg-[var(--app-hover-strong)] group-hover:opacity-100"
              :class="activeId === tab.id ? 'opacity-60' : ''"
              :aria-label="`${closeLabel} ${tab.label}`"
              :title="`${closeLabel} ${tab.label}`"
              @click.stop="$emit('close', tab.id)"
            >
              <UIcon name="i-lucide-x" class="size-2.5" />
            </button>
            <span
              v-if="dropTargetId === tab.id && dropPlacement === 'after'"
              class="absolute -right-0.5 inset-y-1 w-0.5 rounded-full bg-primary"
            />
          </div>
        </div>
      </div>
    </div>
    <div v-if="$slots.trailing" class="flex shrink-0 items-center gap-1">
      <slot name="trailing" />
    </div>
  </div>
</template>

<style scoped>
.workspace-sub-tab-capsule {
  background-color: color-mix(in srgb, var(--workspace-surface-sub-panel) 38%, transparent);
  backdrop-filter: blur(8px);
}

.workspace-sub-tab-button-active {
  background-color: color-mix(in srgb, var(--workspace-surface-sub-tab-active) 72%, transparent);
  box-shadow: 0 8px 18px color-mix(in srgb, var(--app-fg) 8%, transparent);
}

.workspace-sub-tab-strip {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.workspace-sub-tab-strip::-webkit-scrollbar {
  display: none;
}
</style>
