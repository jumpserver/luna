<script setup lang="ts">
import type { FileTransferEndpoint, FileTransferEndpointRef } from "@jumpserver/connectors-core";
import type { DropdownMenuItem } from "@nuxt/ui";
import type {
  SftpTransferDropPayload,
  SftpTransferSourcePayload
} from "#koko/composables/sftp/file-manager/workspaceTypes";
import type { SftpFileEntry } from "#koko/composables/sftp/useSftpFileManager";
import { useDebounceFn } from "@vueuse/core";
import SftpLocalPaneDialogs from "#koko/components/FileManagement/pane/SftpLocalPaneDialogs.vue";
import SftpLocalPaneToolbar from "#koko/components/FileManagement/pane/SftpLocalPaneToolbar.vue";
import SftpPaneContextMenu from "#koko/components/FileManagement/pane/SftpPaneContextMenu.vue";
import SftpPaneDropOverlay from "#koko/components/FileManagement/pane/SftpPaneDropOverlay.vue";
import SftpPaneFileTable from "#koko/components/FileManagement/pane/SftpPaneFileTable.vue";
import SftpPaneSelectionBar from "#koko/components/FileManagement/pane/SftpPaneSelectionBar.vue";
import SftpPaneTableSkeleton from "#koko/components/FileManagement/pane/SftpPaneTableSkeleton.vue";
import {
  buildTransferSourcePayload,
  hasEndpointPrefix,
  hasTransferMimeType,
  isCrossEndpointTransferDrag,
  parseTransferDragPayload,
  transferEntriesFromSelection,
  writeTransferDragData
} from "#koko/composables/sftp/file-manager/transfer";
import { useLocalFileManager } from "#koko/composables/sftp/file-manager/useLocalFileManager";
import {
  LOCAL_ENDPOINT_ID,
  useLocalFileTransferEndpoint
} from "#koko/composables/sftp/file-manager/useLocalFileTransferEndpoint";
import { useSftpPaneSelection } from "#koko/composables/sftp/file-manager/useSftpPaneSelection";
import { useSftpShowHiddenFiles } from "#koko/composables/sftp/file-manager/useSftpShowHiddenFiles";
import { KeyboardKey } from "#koko/constants/keyboard";
import { useKokoHostAdapter } from "#koko/host";

const props = withDefaults(
  defineProps<{
    highlightedNames?: string[];
    focused?: boolean;
    sendPeerDirection?: "left" | "right";
  }>(),
  {
    highlightedNames: () => [],
    focused: false
  }
);
const emit = defineEmits<{
  select: [entry: SftpFileEntry | null];
  selectionChange: [entries: SftpFileEntry[]];
  focus: [];
  transferDrop: [payload: SftpTransferDropPayload];
  send: [payload: SftpTransferSourcePayload];
  transferEndpointMounted: [endpoint: FileTransferEndpoint];
  transferEndpointConnected: [];
  transferEndpointUnmounted: [endpoint: FileTransferEndpointRef];
}>();

const { t } = useI18n();
const { localFiles } = useKokoHostAdapter();
const toast = useToast();
const { addErrorToast } = useErrorToast();
const setupOpen = ref(false);
const search = ref("");
const rootEl = ref<HTMLElement | null>(null);
const promptOpen = ref(false);
const promptName = ref("");
const promptTarget = ref<SftpFileEntry | null>(null);
const promptKind = ref<"folder" | "file">("folder");
const alertOpen = ref(false);
const alertEntries = ref<SftpFileEntry[]>([]);
const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const contextEntry = ref<SftpFileEntry | null>(null);
const activeTransferDragSourceId = useState<string | null>("sftp-active-transfer-drag-source", () => null);

const localManager = useLocalFileManager({
  translate: (key) => t(key),
  onPermissionRequired: () => {
    setupOpen.value = true;
  }
});
const {
  entries,
  currentPath,
  rootPath,
  loading,
  error,
  quickPaths,
  isPermissionError,
  list,
  readFile,
  uploadBlob,
  createDirectory,
  createFileAt,
  renameEntry,
  removeEntry,
  uploadFromEvent,
  refreshQuickPaths,
  releaseSecurityScope
} = localManager;

const transferEndpoint = computed<FileTransferEndpointRef>(() => ({
  id: LOCAL_ENDPOINT_ID,
  label: t("koko.fileManagement.localFiles")
}));
const localTransferEndpoint = useLocalFileTransferEndpoint({
  label: t("koko.fileManagement.localFiles"),
  getCurrentPath: () => currentPath.value,
  isAvailable: () => localFiles.isAvailable() && !error.value,
  onTransferCommitted: async () => {
    await list();
  }
});
const { showHiddenFiles, filterHiddenEntries } = useSftpShowHiddenFiles();
const visibleEntries = computed(() => {
  const query = search.value.trim().toLowerCase();
  return filterHiddenEntries(entries.value)
    .filter((entry) => !query || entry.name.toLowerCase().includes(query))
    .sort((left, right) => {
      if (left.name === "..") return -1;
      if (right.name === "..") return 1;
      if (left.is_dir !== right.is_dir) return Number(right.is_dir) - Number(left.is_dir);
      return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
    });
});
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
const transferableEntries = computed(() => transferEntriesFromSelection(selectedEntries.value));
const selectedSize = computed(() =>
  transferableEntries.value.reduce((total, entry) => total + Math.max(0, Number(entry.size) || 0), 0)
);
const transferDropActive = computed(
  () =>
    isCrossEndpointTransferDrag(activeTransferDragSourceId.value, LOCAL_ENDPOINT_ID) &&
    hasEndpointPrefix(activeTransferDragSourceId.value, "sftp:")
);
const transferDropBlocked = computed(
  () => Boolean(activeTransferDragSourceId.value) && activeTransferDragSourceId.value === LOCAL_ENDPOINT_ID
);
const promptTitle = computed(() =>
  promptTarget.value
    ? t("koko.actions.rename")
    : t(promptKind.value === "file" ? "koko.fileManagement.newFile" : "koko.fileManagement.newFolder")
);
const promptConfirmLabel = computed(() => (promptTarget.value ? t("koko.actions.rename") : t("koko.actions.confirm")));
const promptDisabled = computed(() => {
  const name = promptName.value.trim();
  return !name || (promptTarget.value !== null && name === promptTarget.value.name);
});

function clearTransferredSelection(names: string[], sourcePath: string, revision: number): void {
  selection.clearTransferredSelection(names, sourcePath, revision, currentPath.value);
}

async function changeDirectory(entry: SftpFileEntry): Promise<void> {
  await localManager.changeDirectory(entry);
  clearSelection();
}

const goToPathDebounced = useDebounceFn(async (path: string) => {
  if (!path || path === currentPath.value) return;
  await localManager.goToPath(path);
  clearSelection();
}, 280);

function goToPath(path: string): void {
  if (!path || path === currentPath.value) return;
  void goToPathDebounced(path);
}

async function chooseFolder(): Promise<void> {
  try {
    if (await localManager.chooseFolder()) setupOpen.value = false;
    clearSelection();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}

async function resetToDefaultRoot(): Promise<void> {
  await localManager.resetToDefaultRoot();
  setupOpen.value = false;
  clearSelection();
}

async function revealInSystem(entry?: SftpFileEntry | null): Promise<void> {
  try {
    await localManager.revealInSystem(entry);
  } catch (cause) {
    addErrorToast({ title: t("koko.localFile.revealFailed"), error: cause });
  }
}

function onDragStart(event: DragEvent, entry: SftpFileEntry): void {
  if (entry.is_dir || entry.name === "..") return event.preventDefault();
  if (!isSelected(entry)) selectEntry(entry);
  const payload = transferSourcePayload();
  if (!payload) return event.preventDefault();
  writeTransferDragData(event, payload, activeTransferDragSourceId);
}

function clearTransferDragState(): void {
  activeTransferDragSourceId.value = null;
}

function onTransferDragOver(event: DragEvent): void {
  if (!isCrossEndpointTransferDrag(activeTransferDragSourceId.value, LOCAL_ENDPOINT_ID) || !hasTransferMimeType(event))
    return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
}

function onTransferDrop(event: DragEvent): void {
  const payload = parseTransferDragPayload(event, LOCAL_ENDPOINT_ID);
  clearTransferDragState();
  if (!payload) return;
  event.preventDefault();
  emit("transferDrop", { ...payload, destinationPath: currentPath.value });
}

function transferSourcePayload(): SftpTransferSourcePayload | null {
  return buildTransferSourcePayload({
    sourceEndpoint: transferEndpoint.value,
    sourcePath: currentPath.value,
    sourceSelectionRevision: selectionRevision.value,
    entries: transferableEntries.value
  });
}

function requestSend(): void {
  const payload = transferSourcePayload();
  if (!payload) return;
  emit("send", payload);
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

function hideContextMenu(): void {
  contextMenuVisible.value = false;
  contextEntry.value = null;
}

function openCreate(kind: "folder" | "file"): void {
  hideContextMenu();
  promptTarget.value = null;
  promptKind.value = kind;
  promptName.value = "";
  promptOpen.value = true;
}

function openRename(entry: SftpFileEntry): void {
  hideContextMenu();
  promptTarget.value = entry;
  promptName.value = entry.name;
  promptOpen.value = true;
}

function requestDelete(targets = selectedEntries.value): void {
  alertEntries.value = targets.filter((entry) => entry.name !== "..");
  if (!alertEntries.value.length) return;
  hideContextMenu();
  alertOpen.value = true;
}

async function submitPrompt(): Promise<void> {
  const name = promptName.value.trim();
  const target = promptTarget.value;
  if (!name || (target && name === target.name)) return;
  try {
    if (target) await renameEntry(target, name);
    else if (promptKind.value === "file") await createFileAt(name);
    else await createDirectory(name);
    toast.add({
      title: target
        ? t("koko.fileManagement.entryRenamed", { name })
        : t(promptKind.value === "file" ? "koko.fileManagement.fileCreated" : "koko.fileManagement.folderCreated", {
            name
          }),
      color: "success"
    });
    clearSelection();
    promptOpen.value = false;
  } catch (cause) {
    addErrorToast({ title: t("koko.fileManagement.operationFailed"), error: cause });
  }
}

async function confirmDelete(): Promise<void> {
  const targets = alertEntries.value;
  const results = await Promise.allSettled(targets.map(removeEntry));
  const success = results.filter((result) => result.status === "fulfilled").length;
  if (!success) {
    addErrorToast({ title: t("koko.fileManagement.operationFailed"), error: "" });
    return;
  }
  toast.add({
    title:
      targets.length === 1
        ? t("koko.fileManagement.entryDeleted", { name: targets[0]?.name })
        : `${t("koko.actions.delete")}: ${t("koko.fileManagement.items", { count: success })}`,
    color: success === targets.length ? "success" : "warning",
    duration: 1500
  });
  await list();
  clearSelection();
  alertOpen.value = false;
}

function onKeydown(event: KeyboardEvent): void {
  if (!props.focused || (event.target as HTMLElement | null)?.closest("input, textarea, [contenteditable='true']"))
    return;
  if (event.key.toLowerCase() === KeyboardKey.A && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    return toggleAllVisible(true);
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
    return void list();
  }
  if ((event.key === KeyboardKey.Delete || event.key === KeyboardKey.Backspace) && selectedEntries.value.length) {
    event.preventDefault();
    return requestDelete();
  }
  if (event.key === KeyboardKey.Enter && selectedEntry.value?.is_dir) {
    event.preventDefault();
    void changeDirectory(selectedEntry.value);
  }
}

function focusPane(): void {
  emit("focus");
  rootEl.value?.focus({ preventScroll: true });
}

watch(selectedEntry, (entry) => emit("select", entry));
watch(selectedEntries, (value) => emit("selectionChange", value), { deep: true });
watch(
  () => props.focused,
  (focused) => focused && rootEl.value?.focus({ preventScroll: true })
);
onMounted(() => {
  void list();
  void refreshQuickPaths();
  document.addEventListener("dragend", clearTransferDragState);
  document.addEventListener("keydown", onKeydown);
  if (localFiles.isAvailable()) {
    emit("transferEndpointMounted", localTransferEndpoint);
    emit("transferEndpointConnected");
  }
});
onBeforeUnmount(() => {
  document.removeEventListener("dragend", clearTransferDragState);
  document.removeEventListener("keydown", onKeydown);
  if (localFiles.isAvailable()) emit("transferEndpointUnmounted", transferEndpoint.value);
  void releaseSecurityScope();
});

const manager = {
  operations: { readFile, uploadBlob },
  currentPath,
  connected: computed(() => !error.value && !loading.value)
};
const contextMenuItems = computed<DropdownMenuItem[]>(() => {
  const entry = contextEntry.value;
  if (!entry) return [];
  const single = selectedEntries.value.length === 1;
  return [
    {
      label: t("koko.localFile.revealInFinder"),
      icon: "i-lucide-folder-open",
      disabled: !single,
      onSelect: () => void revealInSystem(entry)
    },
    { type: "separator" },
    { label: t("koko.actions.rename"), icon: "i-lucide-pencil", disabled: !single, onSelect: () => openRename(entry) },
    { label: t("koko.actions.delete"), icon: "i-lucide-trash-2", color: "error", onSelect: () => requestDelete() }
  ];
});

defineExpose({
  manager,
  selectedEntry,
  selectedEntries,
  clearSelection,
  clearTransferredSelection,
  transferSourcePayload,
  list,
  refresh: list,
  transferEndpoint,
  focus: focusPane,
  focusPane
});
</script>

<template>
  <div
    ref="rootEl"
    class="sftp-file-management relative flex h-full min-h-0 flex-col bg-(--app-main-bg) outline-none"
    tabindex="0"
    @mousedown="focusPane"
    @dragenter="onTransferDragOver"
    @dragover="onTransferDragOver"
    @drop="onTransferDrop"
  >
    <SftpLocalPaneToolbar
      v-model:search="search"
      v-model:show-hidden-files="showHiddenFiles"
      :current-path="currentPath"
      :root-path="rootPath"
      :quick-paths="quickPaths"
      @parent="changeDirectory"
      @refresh="list()"
      @reveal="revealInSystem()"
      @setup="setupOpen = true"
      @upload="uploadFromEvent"
      @go-to-path="goToPath"
      @create="openCreate"
    />
    <div v-if="error" class="grid flex-1 place-items-center p-4">
      <div class="w-full max-w-md space-y-3 rounded-xl border border-default bg-elevated/60 p-4">
        <div class="flex items-start gap-3">
          <div class="mt-0.5 rounded-lg bg-error/10 p-2 text-error">
            <UIcon name="i-lucide-folder-lock" class="size-4" />
          </div>
          <div class="min-w-0 space-y-1">
            <p class="text-sm font-medium text-highlighted">
              {{ isPermissionError ? t("koko.localFile.notReady") : t("koko.localFile.openFailed") }}
            </p>
            <p class="text-xs leading-5 text-muted">
              {{ isPermissionError ? t("koko.localFile.permissionHint") : error }}
            </p>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton size="sm" color="primary" icon="i-lucide-folder-open" @click="chooseFolder">
            {{ t("koko.localFile.chooseFolder") }}
          </UButton>
          <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-house" @click="resetToDefaultRoot">
            {{ t("koko.localFile.resetDefault") }}
          </UButton>
          <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-refresh-cw" @click="list()">
            {{ t("koko.actions.retry") }}
          </UButton>
        </div>
      </div>
    </div>
    <SftpPaneTableSkeleton v-else-if="loading && !entries.length" class="min-h-0 flex-1" />
    <div v-else class="relative flex min-h-0 flex-1 flex-col">
      <div v-if="loading && entries.length" class="sftp-file-table__refresh-bar" aria-hidden="true" />
      <SftpPaneFileTable
        class="min-h-0 flex-1"
        :entries="visibleEntries"
        :selected-names="selectedEntries.map((entry) => entry.name)"
        :highlighted-names="highlightedNames"
        :select-all-state="selectAllState"
        :list-key="currentPath"
        :refreshing="loading && entries.length > 0"
        show-status-bar
        draggable
        @select="selectEntry"
        @toggle="toggleEntry"
        @toggle-all="toggleAllVisible"
        @open="changeDirectory"
        @context="openContextMenu"
        @drag-start="onDragStart"
      />
      <SftpPaneSelectionBar
        :selected-count="selectedEntries.length"
        :transferable-count="transferableEntries.length"
        :selected-bytes="selectedSize"
        :can-send="transferableEntries.length > 0"
        :send-peer-direction="sendPeerDirection"
        @send="requestSend"
        @remove="requestDelete()"
        @clear="clearSelection"
      />
    </div>
    <SftpPaneDropOverlay
      :active="transferDropActive"
      :blocked="transferDropBlocked"
      icon="i-lucide-download"
      :endpoint-label="t('koko.fileManagement.localFiles')"
      :path="currentPath"
    />
    <SftpPaneContextMenu
      :open="contextMenuVisible"
      :items="contextMenuItems"
      :position="contextMenuPosition"
      @update-open="(open) => (open ? (contextMenuVisible = true) : hideContextMenu())"
    />
    <SftpLocalPaneDialogs
      v-model:setup-open="setupOpen"
      v-model:prompt-open="promptOpen"
      v-model:prompt-name="promptName"
      v-model:alert-open="alertOpen"
      :prompt-title="promptTitle"
      :prompt-confirm-label="promptConfirmLabel"
      :prompt-disabled="promptDisabled"
      :alert-entries="alertEntries"
      @choose-folder="chooseFolder"
      @reset-root="resetToDefaultRoot"
      @submit-prompt="submitPrompt"
      @confirm-delete="confirmDelete"
    />
  </div>
</template>
