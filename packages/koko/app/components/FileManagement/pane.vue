<script setup lang="ts">
import type {
  ConnectorSessionContext,
  FileTransferEndpoint,
  FileTransferEndpointRef
} from "@jumpserver/connectors-core";
import type {
  SftpTransferDropPayload,
  SftpTransferSourcePayload
} from "#koko/composables/sftp/file-manager/workspaceTypes";
import type { SftpFileEntry } from "#koko/composables/sftp/useSftpFileManager";
import SftpPaneContextMenu from "#koko/components/FileManagement/pane/SftpPaneContextMenu.vue";
import SftpPaneDropOverlay from "#koko/components/FileManagement/pane/SftpPaneDropOverlay.vue";
import SftpPaneFileTable from "#koko/components/FileManagement/pane/SftpPaneFileTable.vue";
import SftpPaneSelectionBar from "#koko/components/FileManagement/pane/SftpPaneSelectionBar.vue";
import SftpPaneTableSkeleton from "#koko/components/FileManagement/pane/SftpPaneTableSkeleton.vue";
import SftpRemotePaneToolbar from "#koko/components/FileManagement/pane/SftpRemotePaneToolbar.vue";
import {
  buildTransferSourcePayload,
  hasTransferMimeType,
  isCrossEndpointTransferDrag,
  parseTransferDragPayload,
  transferEntriesFromSelection,
  writeTransferDragData
} from "#koko/composables/sftp/file-manager/transfer";
import { useSftpPaneSelection } from "#koko/composables/sftp/file-manager/useSftpPaneSelection";
import { useSftpRemotePaneActions } from "#koko/composables/sftp/file-manager/useSftpRemotePaneActions";
import { useSftpShowHiddenFiles } from "#koko/composables/sftp/file-manager/useSftpShowHiddenFiles";
import { useSftpFileManager } from "#koko/composables/sftp/useSftpFileManager";
import { KeyboardKey } from "#koko/constants/keyboard";

const props = defineProps<{
  context: ConnectorSessionContext | null;
  title?: string;
  /** Host/asset caption for the unified toolbar. */
  contextLabel?: string;
  /** Session single-pane: show add-remote + tour in the toolbar. */
  showWorkbenchActions?: boolean;
  transferEndpoint?: FileTransferEndpointRef;
  compact?: boolean;
  highlightedNames?: string[];
  focused?: boolean;
  sendPeerDirection?: "left" | "right";
}>();
const emit = defineEmits<{
  select: [entry: SftpFileEntry | null];
  send: [payload: SftpTransferSourcePayload];
  transferDrop: [payload: SftpTransferDropPayload];
  transferEndpointMounted: [endpoint: FileTransferEndpoint];
  transferEndpointConnected: [];
  transferEndpointUnmounted: [endpoint: FileTransferEndpointRef];
  focus: [];
  addRemote: [];
  startTour: [];
}>();

const { t } = useI18n();
const manager = useSftpFileManager(
  computed(() => props.context),
  props.transferEndpoint
);
const canTransferFiles = computed(() => Boolean(props.transferEndpoint) && !props.compact);
const activeTransferDragSourceId = useState<string | null>("sftp-active-transfer-drag-source", () => null);
const search = ref("");
const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const contextEntry = ref<SftpFileEntry | null>(null);
const { showHiddenFiles, filterHiddenEntries } = useSftpShowHiddenFiles();
const visibleEntries = computed(() => {
  const query = search.value.toLowerCase();
  return filterHiddenEntries(manager.entries.value)
    .filter((entry) => entry.name.toLowerCase().includes(query))
    .sort((left, right) => {
      if (left.name === "..") return -1;
      if (right.name === "..") return 1;
      return Number(right.is_dir) - Number(left.is_dir);
    });
});
let transferEndpointReady = false;
const selection = useSftpPaneSelection<SftpFileEntry>({ visibleEntries });
const {
  selectedEntries,
  selectedEntry,
  selectionRevision,
  selectAllState,
  clearSelection,
  updateSelection,
  isSelected,
  moveSelection,
  moveSelectionToBoundary,
  selectEntry,
  toggleEntry,
  toggleAllVisible
} = selection;
const pathSegments = computed(() => manager.currentPath.value.split("/").filter(Boolean));
const transferableEntries = computed(() => transferEntriesFromSelection(selectedEntries.value));
const selectedSize = computed(() =>
  transferableEntries.value.reduce((total, entry) => total + Math.max(0, Number(entry.size) || 0), 0)
);
const transferDropActive = computed(
  () =>
    canTransferFiles.value &&
    Boolean(props.transferEndpoint?.id) &&
    isCrossEndpointTransferDrag(activeTransferDragSourceId.value, props.transferEndpoint?.id || "")
);
const transferDropBlocked = computed(
  () =>
    canTransferFiles.value &&
    Boolean(props.transferEndpoint?.id) &&
    activeTransferDragSourceId.value === props.transferEndpoint?.id
);

function hideContextMenu(): void {
  contextMenuVisible.value = false;
  contextEntry.value = null;
}

function transferSourcePayload(): SftpTransferSourcePayload | null {
  if (!canTransferFiles.value) return null;
  return buildTransferSourcePayload({
    sourceEndpoint: props.transferEndpoint,
    sourcePath: manager.currentPath.value,
    sourceSelectionRevision: selectionRevision.value,
    entries: transferableEntries.value
  });
}

function requestSend(): void {
  const payload = transferSourcePayload();
  if (!payload) return;
  hideContextMenu();
  emit("send", payload);
}

const actions = useSftpRemotePaneActions({
  manager,
  selectedEntries,
  selectedEntry,
  contextEntry,
  canTransferFiles,
  transferableCount: () => transferableEntries.value.length,
  clearSelection,
  updateSelection,
  hideContextMenu,
  requestSend,
  translate: (key, params) => String(params ? t(key, params) : t(key))
});
const {
  promptOpen,
  promptName,
  promptTitle,
  promptConfirmLabel,
  promptDisabled,
  alertOpen,
  alertTarget,
  alertTitle,
  alertDescription,
  contextMenuItems,
  createFolder,
  createFile,
  requestDelete,
  downloadSelected,
  submitPrompt,
  confirmAlert,
  uploadFromEvent,
  refreshCurrentDirectory
} = actions;

function navigateToPath(segmentIndex: number): void {
  const path = segmentIndex < 0 ? "/" : `/${pathSegments.value.slice(0, segmentIndex + 1).join("/")}`;
  if (path !== manager.currentPath.value) void manager.loadCurrentDirectory(path);
}

function goToAbsolutePath(path: string): void {
  const normalized = path.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
  if (normalized !== manager.currentPath.value) void manager.loadCurrentDirectory(normalized);
}

const toolbarRef = ref<{ focusPathEdit?: () => void; focusSearch?: () => void } | null>(null);

function openDirectory(entry: SftpFileEntry): void {
  manager.changeDirectory(entry);
}

function clearTransferredSelection(names: string[], sourcePath: string, revision: number): void {
  selection.clearTransferredSelection(names, sourcePath, revision, manager.currentPath.value);
}

function onDragStart(event: DragEvent, entry: SftpFileEntry): void {
  if (entry.is_dir || entry.name === ".." || !canTransferFiles.value || !props.transferEndpoint) {
    event.preventDefault();
    return;
  }
  if (!isSelected(entry)) selectEntry(entry);
  const payload = transferSourcePayload();
  if (!payload) return event.preventDefault();
  writeTransferDragData(event, payload, activeTransferDragSourceId);
}

function canAcceptTransferDrag(event: DragEvent): boolean {
  return Boolean(
    canTransferFiles.value &&
    props.transferEndpoint?.id &&
    isCrossEndpointTransferDrag(activeTransferDragSourceId.value, props.transferEndpoint.id) &&
    hasTransferMimeType(event)
  );
}

function onTransferDragOver(event: DragEvent): void {
  if (!canAcceptTransferDrag(event)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
}

function clearTransferDragState(): void {
  activeTransferDragSourceId.value = null;
}

function onTransferDrop(event: DragEvent): void {
  const payload = parseTransferDragPayload(event, props.transferEndpoint?.id);
  clearTransferDragState();
  if (!payload) return;
  event.preventDefault();
  emit("transferDrop", { ...payload, destinationPath: manager.currentPath.value });
}

function openContextMenu(entry: SftpFileEntry, event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  if (entry.name === "..") return;
  if (!isSelected(entry)) updateSelection([entry]);
  contextEntry.value = entry;
  contextMenuPosition.value = { x: event.clientX, y: event.clientY };
  contextMenuVisible.value = true;
}

function onKeydown(event: KeyboardEvent): void {
  if (
    !props.focused ||
    props.compact ||
    (event.target as HTMLElement | null)?.closest("input, textarea, [contenteditable='true']")
  )
    return;
  if (event.key.toLowerCase() === KeyboardKey.A && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    return toggleAllVisible(true);
  }
  if (event.key.toLowerCase() === KeyboardKey.L && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    return toolbarRef.value?.focusPathEdit?.();
  }
  if (event.key.toLowerCase() === KeyboardKey.F && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    return toolbarRef.value?.focusSearch?.();
  }
  if (event.key === KeyboardKey.ArrowUp || event.key === KeyboardKey.ArrowDown) {
    event.preventDefault();
    return moveSelection(event.key === KeyboardKey.ArrowUp ? -1 : 1, event.shiftKey);
  }
  if (event.key === KeyboardKey.Home || event.key === KeyboardKey.End) {
    event.preventDefault();
    return moveSelectionToBoundary(event.key === KeyboardKey.Home ? "start" : "end", event.shiftKey);
  }
  if (event.key === KeyboardKey.Escape) {
    clearSelection();
    return hideContextMenu();
  }
  if (event.key === KeyboardKey.F5 || (event.key.toLowerCase() === KeyboardKey.R && (event.metaKey || event.ctrlKey))) {
    event.preventDefault();
    return void manager.loadCurrentDirectory();
  }
  if ((event.key === KeyboardKey.Delete || event.key === KeyboardKey.Backspace) && selectedEntries.value.length) {
    event.preventDefault();
    return requestDelete();
  }
  if (event.key === KeyboardKey.Enter && selectedEntry.value?.is_dir) {
    event.preventDefault();
    void manager.changeDirectory(selectedEntry.value);
  }
}

function focusPane(): void {
  emit("focus");
}

watch(selectedEntry, (entry) => emit("select", entry));
watch(manager.currentPath, () => {
  hideContextMenu();
  clearSelection();
});
watch([manager.connected, manager.loading, manager.error], ([connected, loading, error]) => {
  if (!connected || error) {
    transferEndpointReady = false;
    return;
  }
  if (loading || transferEndpointReady || !manager.transferEndpoint) return;
  transferEndpointReady = true;
  emit("transferEndpointConnected");
});
onMounted(() => {
  if (manager.transferEndpoint) emit("transferEndpointMounted", manager.transferEndpoint);
  document.addEventListener("dragend", clearTransferDragState);
  document.addEventListener("keydown", onKeydown);
});
onUnmounted(() => {
  document.removeEventListener("dragend", clearTransferDragState);
  document.removeEventListener("keydown", onKeydown);
  if (props.transferEndpoint) emit("transferEndpointUnmounted", props.transferEndpoint);
});

defineExpose({
  manager,
  selectedEntry,
  selectedEntries,
  clearSelection,
  clearTransferredSelection,
  transferSourcePayload,
  focusPane,
  refresh: refreshCurrentDirectory
});
</script>

<template>
  <div
    v-if="manager.error.value"
    class="grid h-full place-items-center bg-(--app-main-bg) p-4 text-sm text-(--app-muted)"
  >
    <div class="flex flex-col items-center gap-2 text-center">
      <UIcon name="i-lucide-circle-alert" class="size-6" />
      <p>{{ manager.error.value }}</p>
      <UButton size="xs" @click="manager.retry.reconnect()">{{ t("koko.fileManagement.reconnect") }}</UButton>
    </div>
  </div>
  <div
    v-else
    class="sftp-file-management relative flex h-full min-h-0 flex-col bg-(--app-main-bg) text-(--app-fg) outline-none"
    :class="{ 'sftp-file-management--compact': compact }"
    tabindex="0"
    @mousedown="focusPane"
    @dragenter="onTransferDragOver"
    @dragover="onTransferDragOver"
    @drop="onTransferDrop"
  >
    <SftpRemotePaneToolbar
      ref="toolbarRef"
      v-model:search="search"
      v-model:show-hidden-files="showHiddenFiles"
      :manager="manager"
      :title="title"
      :context-label="contextLabel"
      :show-workbench-actions="showWorkbenchActions && !compact"
      :path-segments="pathSegments"
      :dense="Boolean(compact)"
      @navigate="navigateToPath"
      @go-to-path="goToAbsolutePath"
      @create-folder="createFolder"
      @create-file="createFile"
      @upload="uploadFromEvent"
      @add-remote="emit('addRemote')"
      @start-tour="emit('startTour')"
    />
    <SftpPaneTableSkeleton
      v-if="manager.loading.value && !manager.entries.value.length"
      class="min-h-0 flex-1"
      :compact="compact"
    />
    <div v-else class="relative flex min-h-0 flex-1 flex-col bg-(--app-main-bg)">
      <div
        v-if="manager.loading.value && manager.entries.value.length"
        class="sftp-file-table__refresh-bar"
        aria-hidden="true"
      />
      <SftpPaneFileTable
        class="min-h-0 flex-1"
        :entries="visibleEntries"
        :selected-names="selectedEntries.map((entry) => entry.name)"
        :highlighted-names="highlightedNames"
        :select-all-state="selectAllState"
        :draggable="canTransferFiles"
        :compact="compact"
        :list-key="manager.currentPath.value"
        :refreshing="manager.loading.value && manager.entries.value.length > 0"
        show-status-bar
        @select="selectEntry"
        @toggle="toggleEntry"
        @toggle-all="toggleAllVisible"
        @open="openDirectory"
        @context="openContextMenu"
        @drag-start="onDragStart"
      />
      <SftpPaneSelectionBar
        :selected-count="selectedEntries.length"
        :transferable-count="transferableEntries.length"
        :selected-bytes="selectedSize"
        :can-send="canTransferFiles"
        :can-download="selectedEntries.length === 1"
        :send-peer-direction="sendPeerDirection"
        @send="requestSend"
        @download="downloadSelected"
        @remove="requestDelete()"
        @clear="clearSelection"
      />
    </div>
    <SftpPaneDropOverlay
      :active="transferDropActive"
      :blocked="transferDropBlocked"
      icon="i-lucide-send"
      :endpoint-label="transferEndpoint?.label || ''"
      :path="manager.currentPath.value"
      release-hint
    />
    <SftpPaneContextMenu
      :open="contextMenuVisible"
      :items="contextMenuItems"
      :position="contextMenuPosition"
      @update-open="(open) => (open ? (contextMenuVisible = true) : hideContextMenu())"
    />
    <ModalPromptDialog
      v-model:open="promptOpen"
      v-model="promptName"
      :title="promptTitle"
      :confirm-label="promptConfirmLabel"
      :disabled="promptDisabled"
      @confirm="submitPrompt"
    />
    <ModalAlertDialog
      v-model:open="alertOpen"
      :title="alertTitle"
      :description="alertDescription"
      :confirm-label="alertTitle"
      :confirm-color="alertTarget?.kind === 'delete' ? 'error' : 'primary'"
      @confirm="confirmAlert"
    />
  </div>
</template>
