<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { SftpRemotePane } from "#koko/composables/sftp/file-manager/workspaceTypes";
import { VueDraggable } from "vue-draggable-plus";

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
}>();

const { t } = useI18n();

const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const contextMenuPane = ref<SftpRemotePane | null>(null);
const contextMenuIndex = ref(-1);

function normalizePaneOrder(panes: SftpRemotePane[]) {
  const pinned = panes.filter((pane) => pane.pinned);
  const unpinned = panes.filter((pane) => !pane.pinned);
  return [...pinned, ...unpinned];
}

const panesModel = computed({
  get: () => props.panes,
  set: (value: SftpRemotePane[]) => emit("update:panes", normalizePaneOrder(value))
});

/** Pinned tabs stay fixed; only unpinned tabs can be reordered among themselves. */
function onMove(event: { related?: HTMLElement | null }) {
  const related = event.related;
  if (!related) return true;
  // Keep the pinned block at the front: never drop relative to a pinned tab.
  if (related.classList.contains("is-pinned")) return false;
  return true;
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
  <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
    <VueDraggable
      v-model="panesModel"
      :animation="150"
      class="flex min-w-0 flex-1 items-center gap-1"
      ghost-class="sftp-machine-tab-ghost"
      chosen-class="sftp-machine-tab-chosen"
      drag-class="sftp-machine-tab-drag"
      filter=".is-pinned"
      :prevent-on-filter="true"
      draggable=".sftp-machine-tab-draggable"
      :on-move="onMove"
    >
      <button
        v-for="(pane, index) in panesModel"
        :key="pane.id"
        type="button"
        class="sftp-file-management__machine-tab flex max-w-45 shrink-0 items-center gap-1.5 rounded-md border px-2"
        :class="[
          activeId === pane.id
            ? 'border-primary/50 bg-accented text-highlighted'
            : 'border-default bg-default text-muted hover:text-highlighted',
          pane.pinned ? 'is-pinned cursor-default' : 'sftp-machine-tab-draggable cursor-grab active:cursor-grabbing'
        ]"
        @click="selectPane(pane.id)"
        @dblclick="emit('pin', pane.id)"
        @auxclick="closeWithMiddleClick(pane.id, $event)"
        @contextmenu="openContextMenu(pane, index, $event)"
      >
        <span class="size-1.5 shrink-0 rounded-full" :class="isConnected(pane.id) ? 'bg-success' : 'bg-warning'" />
        <UIcon v-if="pane.pinned" name="i-lucide-pin" class="size-3 shrink-0 text-primary" />
        <span class="min-w-0 flex-1 truncate">{{ pane.assetName }}</span>
        <UBadge v-if="transferCount(pane.transferEndpoint.id)" color="primary" variant="subtle" size="xs">
          {{ transferCount(pane.transferEndpoint.id) }}
        </UBadge>
        <UIcon name="i-lucide-x" class="size-3 shrink-0" @click.stop="emit('close', pane.id)" />
      </button>
    </VueDraggable>

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

<style scoped>
:deep(.sftp-machine-tab-ghost) {
  opacity: 0.45;
}

:deep(.sftp-machine-tab-chosen) {
  opacity: 0.9;
}

:deep(.sftp-machine-tab-drag) {
  opacity: 0.85;
}

:deep(.is-pinned) {
  cursor: default;
}
</style>
