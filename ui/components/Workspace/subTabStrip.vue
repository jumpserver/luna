<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
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
const hasOverflow = ref(false);
const hasLeftHidden = ref(false);
const hasRightHidden = ref(false);
const localDraggedId = ref("");
const dropTargetId = ref("");
const dropPlacement = ref<"before" | "after">("before");
const editorTabMime = "application/x-jumpserver-editor-tab";
const tabMenuItems = computed<DropdownMenuItem[]>(() =>
  props.tabs.map((tab) => ({
    label: tab.label,
    icon: tab.icon,
    type: "checkbox" as const,
    checked: props.activeId === tab.id,
    onSelect: () => selectTab(tab.id)
  }))
);

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

function updateOverflow() {
  const element = strip.value;
  if (!element) return;
  hasOverflow.value = element.scrollWidth > element.clientWidth + 1;
  hasLeftHidden.value = hasOverflow.value && element.scrollLeft > 1;
  hasRightHidden.value = hasOverflow.value && element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
}

function scrollActiveTabIntoView(behavior: ScrollBehavior = "smooth") {
  strip.value?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({
    behavior,
    block: "nearest",
    inline: "nearest"
  });
}

function selectTab(id: string) {
  emit("select", id);
  nextTick(scrollActiveTabIntoView);
}

function scrollTabStrip(direction: "left" | "right") {
  const element = strip.value;
  if (!element) return;
  element.scrollBy({
    left: direction === "left" ? -Math.max(120, element.clientWidth * 0.6) : Math.max(120, element.clientWidth * 0.6),
    behavior: "smooth"
  });
}

let resizeObserver: ResizeObserver | null = null;

watch(
  strip,
  (element, previous) => {
    previous?.removeEventListener("scroll", updateOverflow);
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (!element) return;

    updateOverflow();
    scrollActiveTabIntoView("auto");
    resizeObserver = new ResizeObserver(updateOverflow);
    resizeObserver.observe(element);
    element.addEventListener("scroll", updateOverflow, { passive: true });
  },
  { flush: "post" }
);

onBeforeUnmount(() => {
  strip.value?.removeEventListener("scroll", updateOverflow);
  resizeObserver?.disconnect();
});

watch(
  () => [props.tabs, props.activeId],
  async () => {
    await nextTick();
    updateOverflow();
    scrollActiveTabIntoView();
  },
  { deep: true, flush: "post" }
);
</script>

<template>
  <div v-if="tabs.length" class="flex h-9 min-w-0 shrink-0 items-center gap-1 bg-[var(--workspace-surface-main)] px-2">
    <UButton
      v-if="hasLeftHidden"
      size="xs"
      icon="i-lucide-chevron-left"
      color="neutral"
      variant="ghost"
      aria-label="Scroll tabs left"
      title="Scroll tabs left"
      @click="scrollTabStrip('left')"
    />
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
          @click="selectTab(tab.id)"
          @dblclick="$emit('pin', tab.id)"
          @keydown.enter.prevent="selectTab(tab.id)"
          @keydown.space.prevent="selectTab(tab.id)"
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
    <UButton
      v-if="hasRightHidden"
      size="xs"
      icon="i-lucide-chevron-right"
      color="neutral"
      variant="ghost"
      aria-label="Scroll tabs right"
      title="Scroll tabs right"
      @click="scrollTabStrip('right')"
    />
    <UDropdownMenu
      v-if="hasOverflow"
      :items="tabMenuItems"
      :content="{ align: 'end', side: 'bottom', sideOffset: 6 }"
      :ui="{ content: 'w-52 max-h-64 overflow-y-auto p-1', label: 'truncate' }"
    >
      <UButton
        size="xs"
        icon="i-lucide-ellipsis"
        color="neutral"
        variant="ghost"
        aria-label="Select tab"
        title="Select tab"
      />
    </UDropdownMenu>
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
