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
  <div v-if="tabs.length" class="flex h-9 min-w-0 shrink-0 items-center bg-[var(--workspace-surface-main)] px-2">
    <div class="flex h-full min-w-0 flex-1 items-center overflow-hidden">
      <div
        ref="strip"
        role="tablist"
        class="workspace-sub-tab-strip flex h-full w-fit min-w-0 max-w-full items-center gap-1 overflow-x-auto"
        @wheel="scrollTabs"
      >
        <div
          v-for="tab in tabs"
          :key="tab.id"
          class="group relative flex h-7 min-w-0 shrink-0 items-center gap-1.5 self-center rounded-md px-2.5 text-left text-[11px] leading-none transition-colors"
          :class="[
            activeId === tab.id
              ? 'max-w-36 bg-accented text-highlighted'
              : 'max-w-36 text-muted hover:bg-accented hover:text-highlighted',
            reorderable ? 'active:cursor-grabbing' : '',
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
          <UIcon :name="tab.icon" class="size-3.5 shrink-0" />
          <span class="min-w-0 truncate">{{ tab.label }}</span>
          <span v-if="tab.dirty" class="size-1.5 shrink-0 rounded-full bg-primary" title="未保存" />
          <button
            type="button"
            class="flex size-4 shrink-0 items-center justify-center rounded text-muted hover:bg-elevated hover:text-foreground"
            :aria-label="`${closeLabel} ${tab.label}`"
            :title="`${closeLabel} ${tab.label}`"
            @click.stop="$emit('close', tab.id)"
          >
            <UIcon name="i-lucide-x" class="size-3" />
          </button>
          <span
            v-if="dropTargetId === tab.id && dropPlacement === 'after'"
            class="absolute -right-0.5 inset-y-1 w-0.5 rounded-full bg-primary"
          />
        </div>
      </div>
    </div>
    <div v-if="$slots.trailing" class="ml-2 flex h-full shrink-0 items-center gap-1 pl-2">
      <slot name="trailing" />
    </div>
  </div>
</template>

<style scoped>
.workspace-sub-tab-strip {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.workspace-sub-tab-strip::-webkit-scrollbar {
  display: none;
}
</style>
