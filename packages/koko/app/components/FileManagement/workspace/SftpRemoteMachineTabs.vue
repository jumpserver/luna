<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { SftpRemotePane } from "#koko/composables/sftp/file-manager/workspaceTypes";

const props = defineProps<{
  panes: SftpRemotePane[];
  activeId: string | null;
  transferCount: (endpointId: string) => number;
  isConnected: (paneId: string) => boolean;
}>();

const emit = defineEmits<{
  "update:panes": [panes: SftpRemotePane[]];
  select: [id: string];
  close: [id: string];
  reconnect: [id: string];
  closeOthers: [id: string];
  closeRight: [id: string];
  pin: [id: string];
  paneDragStart: [id: string];
  paneDragEnd: [];
}>();

const { t } = useI18n();

const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const contextMenuPane = ref<SftpRemotePane | null>(null);
const contextMenuIndex = ref(-1);
const draggedPaneId = ref("");
const dropTargetId = ref("");
const dropPlacement = ref<"before" | "after">("before");

function normalizePaneOrder(panes: SftpRemotePane[]) {
  const pinned = panes.filter((pane) => pane.pinned);
  const unpinned = panes.filter((pane) => !pane.pinned);
  return [...pinned, ...unpinned];
}

function resetDragState() {
  draggedPaneId.value = "";
  dropTargetId.value = "";
  dropPlacement.value = "before";
}

function beginDrag(pane: SftpRemotePane, event: DragEvent) {
  if (pane.pinned || !event.dataTransfer) {
    event.preventDefault();
    return;
  }
  draggedPaneId.value = pane.id;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/x-jumpserver-sftp-pane", pane.id);
  event.dataTransfer.setData("text/plain", pane.id);
  emit("paneDragStart", pane.id);
}

function endDrag() {
  resetDragState();
  emit("paneDragEnd");
}

function dragOver(pane: SftpRemotePane, event: DragEvent) {
  if (pane.pinned || !draggedPaneId.value || draggedPaneId.value === pane.id) {
    dropTargetId.value = "";
    return;
  }
  event.preventDefault();
  const element = event.currentTarget as HTMLElement;
  dropTargetId.value = pane.id;
  dropPlacement.value =
    event.clientX < element.getBoundingClientRect().left + element.offsetWidth / 2 ? "before" : "after";
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

function dropPane(targetId: string, event: DragEvent) {
  event.preventDefault();
  const sourceId = draggedPaneId.value;
  if (!sourceId || sourceId === targetId) {
    resetDragState();
    return;
  }

  const panes = [...props.panes];
  const sourceIndex = panes.findIndex((pane) => pane.id === sourceId && !pane.pinned);
  if (sourceIndex < 0 || panes.find((pane) => pane.id === targetId)?.pinned) {
    resetDragState();
    return;
  }

  const [source] = panes.splice(sourceIndex, 1);
  const targetIndex = panes.findIndex((pane) => pane.id === targetId);
  panes.splice(targetIndex + (dropPlacement.value === "after" ? 1 : 0), 0, source!);
  emit("update:panes", normalizePaneOrder(panes));
  resetDragState();
}

function hideContextMenu() {
  contextMenuVisible.value = false;
  contextMenuPane.value = null;
  contextMenuIndex.value = -1;
}

function openContextMenu(pane: SftpRemotePane, index: number, event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  contextMenuPane.value = pane;
  contextMenuIndex.value = index;
  contextMenuPosition.value = { x: event.clientX, y: event.clientY };
  contextMenuVisible.value = true;
}

function selectPane(id: string) {
  emit("select", id);
}

function closeWithMiddleClick(id: string, event: MouseEvent) {
  if (event.button !== 1) return;
  event.preventDefault();
  emit("close", id);
}

const contextMenuItems = computed<DropdownMenuItem[]>(() => {
  const pane = contextMenuPane.value;
  const index = contextMenuIndex.value;
  if (!pane || index < 0) return [];

  const pinned = Boolean(pane.pinned);
  const isLast = index >= props.panes.length - 1;

  return [
    {
      label: t("TabMenu.Reconnect"),
      icon: "i-lucide-refresh-cw",
      onSelect: () => {
        hideContextMenu();
        emit("reconnect", pane.id);
      }
    },
    {
      label: pinned ? t("koko.fileManagement.unpinTab") : t("koko.fileManagement.pinTab"),
      icon: pinned ? "i-lucide-pin-off" : "i-lucide-pin",
      onSelect: () => {
        hideContextMenu();
        emit("pin", pane.id);
      }
    },
    { type: "separator" },
    {
      label: t("TabMenu.CloseCurrent"),
      icon: "i-lucide-x",
      onSelect: () => {
        hideContextMenu();
        emit("close", pane.id);
      }
    },
    {
      label: t("TabMenu.CloseOther"),
      icon: "i-lucide-copy-x",
      disabled: props.panes.length <= 1,
      onSelect: () => {
        hideContextMenu();
        emit("closeOthers", pane.id);
      }
    },
    {
      label: t("TabMenu.CloseRight"),
      icon: "i-lucide-panel-right-close",
      disabled: isLast,
      onSelect: () => {
        hideContextMenu();
        emit("closeRight", pane.id);
      }
    }
  ];
});
</script>

<template>
  <div class="sftp-file-management__machine-tabs flex h-full w-fit shrink-0 items-center overflow-visible py-0.5">
    <div class="flex h-full w-fit items-center gap-1.5 overflow-visible">
      <div
        v-for="(pane, index) in panes"
        :key="pane.id"
        :draggable="!pane.pinned"
        class="sftp-file-management__machine-tab relative flex h-7 min-w-20 max-w-40 basis-40 grow shrink items-center gap-1 rounded-md px-1.5 text-[11px] leading-none transition-colors"
        :class="[
          activeId === pane.id ? 'bg-accented text-highlighted' : 'text-muted hover:bg-accented hover:text-highlighted',
          pane.pinned
            ? 'sftp-file-management__machine-tab--pinned cursor-default'
            : 'cursor-grab active:cursor-grabbing',
          draggedPaneId === pane.id ? 'opacity-60' : ''
        ]"
        :title="pane.pinned ? t('koko.fileManagement.unpinTab') : undefined"
        @dblclick="emit('pin', pane.id)"
        @auxclick="closeWithMiddleClick(pane.id, $event)"
        @contextmenu="openContextMenu(pane, index, $event)"
        @dragstart="beginDrag(pane, $event)"
        @dragend="endDrag"
        @dragenter="dragOver(pane, $event)"
        @dragover="dragOver(pane, $event)"
        @dragleave="dropTargetId = dropTargetId === pane.id ? '' : dropTargetId"
        @drop="dropPane(pane.id, $event)"
      >
        <span
          v-if="dropTargetId === pane.id"
          class="pointer-events-none absolute inset-y-1 z-10 w-0.5 rounded-full bg-primary"
          :class="dropPlacement === 'after' ? '-right-[3px]' : '-left-[3px]'"
        />
        <span
          v-if="pane.pinned"
          class="sftp-file-management__machine-tab-pin"
          :aria-label="t('koko.fileManagement.pinTab')"
        >
          <UIcon name="i-lucide-pin" />
        </span>
        <button type="button" class="flex min-w-0 flex-1 items-center gap-1 text-left" @click="selectPane(pane.id)">
          <UIcon
            name="i-lucide-server"
            class="size-3.5 shrink-0"
            :class="isConnected(pane.id) ? 'text-success' : 'text-warning'"
          />
          <span class="min-w-0 flex-1 truncate">{{ pane.assetName }}</span>
        </button>
        <UBadge v-if="transferCount(pane.transferEndpoint.id)" color="primary" variant="subtle" size="xs">
          {{ transferCount(pane.transferEndpoint.id) }}
        </UBadge>
        <span
          v-if="!pane.pinned"
          class="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded text-muted hover:bg-elevated hover:text-foreground"
          role="button"
          tabindex="0"
          @click.stop="emit('close', pane.id)"
          @mousedown.stop
          @dragstart.stop.prevent
          @keydown.enter.stop.prevent="emit('close', pane.id)"
          @keydown.space.stop.prevent="emit('close', pane.id)"
        >
          <UIcon name="i-lucide-x" class="size-3" />
        </span>
      </div>
    </div>

    <UDropdownMenu
      :open="contextMenuVisible"
      :items="contextMenuItems"
      size="sm"
      :content="{ align: 'start', side: 'bottom', sideOffset: 4 }"
      :ui="{ content: 'min-w-44' }"
      @update:open="(open) => (!open ? hideContextMenu() : (contextMenuVisible = open))"
    >
      <div
        class="pointer-events-none fixed size-px"
        :style="{ left: `${contextMenuPosition.x}px`, top: `${contextMenuPosition.y}px` }"
      />
    </UDropdownMenu>
  </div>
</template>
