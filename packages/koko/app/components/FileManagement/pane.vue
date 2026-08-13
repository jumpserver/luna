<script setup lang="ts">
import type { ConnectorSessionContext } from "@jumpserver/connectors-core";
import type { DropdownMenuItem } from "@nuxt/ui";
import type {
  SftpTransferDropPayload,
  SftpTransferSourcePayload
} from "#koko/composables/sftp/file-manager/workspaceTypes";
import type { SftpFileEntry } from "#koko/composables/sftp/useSftpFileManager";
import type { FileTransferEndpoint, FileTransferEndpointRef } from "~/shared/file-transfer/types";
import prettyBytes from "pretty-bytes";
import SftpPaneSelectionBar from "#koko/components/FileManagement/pane/SftpPaneSelectionBar.vue";

import {
  buildTransferSourcePayload,
  hasTransferMimeType,
  isCrossEndpointTransferDrag,
  parseTransferDragPayload,
  transferEntriesFromSelection,
  writeTransferDragData
} from "#koko/composables/sftp/file-manager/transfer";
import { useSftpPaneSelection } from "#koko/composables/sftp/file-manager/useSftpPaneSelection";
import { useSftpFileManager } from "#koko/composables/sftp/useSftpFileManager";

const props = defineProps<{
  context: ConnectorSessionContext | null;
  title?: string;
  transferEndpoint?: FileTransferEndpointRef;
  /** Lightweight single-pane mode (SSH right panel): browse + basic file ops only. */
  compact?: boolean;
  highlightedNames?: string[];
  focused?: boolean;
}>();

const emit = defineEmits<{
  select: [entry: SftpFileEntry | null];
  send: [payload: SftpTransferSourcePayload];
  transferDrop: [payload: SftpTransferDropPayload];
  transferEndpointMounted: [endpoint: FileTransferEndpoint];
  transferEndpointConnected: [];
  transferEndpointUnmounted: [endpoint: FileTransferEndpointRef];
  focus: [];
}>();

/** Cross-machine send/drag is only available in full dual-pane file management. */
const canTransferFiles = computed(() => Boolean(props.transferEndpoint) && !props.compact);

const { t } = useI18n();
const toast = useToast();
const { addErrorToast } = useErrorToast();
const contextRef = computed(() => props.context);
const manager = useSftpFileManager(contextRef, props.transferEndpoint);
const activeTransferDragSourceId = useState<string | null>("sftp-active-transfer-drag-source", () => null);

const search = ref("");
const uploadInput = ref<HTMLInputElement | null>(null);
const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const contextEntry = ref<SftpFileEntry | null>(null);
const highlightedSet = computed(() => new Set(props.highlightedNames || []));

const promptOpen = ref(false);
const promptName = ref("");
const promptTarget = ref<SftpFileEntry | null>(null);
const promptKind = ref<"folder" | "file">("folder");

const alertOpen = ref(false);
const alertTarget = ref<{ kind: "delete" | "download"; entries: SftpFileEntry[] } | null>(null);

const visibleEntries = computed(() => {
  const query = search.value.toLowerCase();
  const entries = manager.entries.value.filter((entry) => entry.name.toLowerCase().includes(query));

  return entries.sort((left, right) => {
    if (left.name === "..") return -1;
    if (right.name === "..") return 1;
    return Number(right.is_dir) - Number(left.is_dir);
  });
});
const {
  selectedEntries,
  selectedEntry,
  selectionRevision,
  selectableVisibleEntries,
  selectAllState,
  clearSelection,
  updateSelection,
  clearTransferredSelection: clearTransferredSelectionWithGuard,
  isSelected,
  moveSelection,
  moveSelectionToBoundary,
  selectEntry,
  toggleEntry,
  toggleAllVisible
} = useSftpPaneSelection<SftpFileEntry>({ visibleEntries });
const pathSegments = computed(() => manager.currentPath.value.split("/").filter(Boolean));
const transferableEntries = computed(() => transferEntriesFromSelection(selectedEntries.value));
const selectedSize = computed(() =>
  transferableEntries.value.reduce((total, entry) => {
    const size = Number(entry.size);
    return total + (Number.isFinite(size) && size >= 0 ? size : 0);
  }, 0)
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
const typeColumnLabel = computed(() => t("koko.fileManagement.type"));

function navigateToPath(segmentIndex: number) {
  const path = segmentIndex < 0 ? "/" : `/${pathSegments.value.slice(0, segmentIndex + 1).join("/")}`;
  if (path === manager.currentPath.value) return;
  void manager.loadCurrentDirectory(path);
}

function formatFileSize(value: string) {
  const bytes = Number(value);
  return Number.isFinite(bytes) && bytes >= 0 ? prettyBytes(bytes) : value || "—";
}

function formatModifiedTime(value: string) {
  if (!value) return "—";
  const timestamp = Number(value);
  const date = Number.isFinite(timestamp)
    ? new Date(timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp)
    : new Date(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;

  const twoDigits = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())} ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

function fileType(entry: SftpFileEntry) {
  if (entry.is_dir) return t("koko.fileManagement.folder");

  const normalizedName = entry.name.toLowerCase();
  const extension =
    normalizedName.startsWith(".") && !normalizedName.slice(1).includes(".")
      ? normalizedName.slice(1)
      : normalizedName.includes(".")
        ? normalizedName.split(".").at(-1) || ""
        : "";
  if (extension) return extension;

  const serverType = entry.type?.trim().replace(/^\./, "").toLowerCase();
  if (serverType && !["file", "regular"].includes(serverType)) return serverType;
  return t("koko.fileManagement.file");
}

const promptTitle = computed(() =>
  promptTarget.value
    ? t("koko.actions.rename")
    : promptKind.value === "file"
      ? t("koko.fileManagement.newFile")
      : t("koko.fileManagement.newFolder")
);
const promptConfirmLabel = computed(() => (promptTarget.value ? t("koko.actions.rename") : t("koko.actions.confirm")));
const promptDisabled = computed(() => {
  const name = promptName.value.trim();
  return !name || (promptTarget.value !== null && name === promptTarget.value.name);
});
const alertTitle = computed(() =>
  alertTarget.value?.kind === "delete" ? t("koko.actions.delete") : t("koko.actions.download")
);
const alertDescription = computed(() => {
  if (!alertTarget.value) return "";
  if (alertTarget.value.kind === "delete") {
    const entries = alertTarget.value.entries;
    if (entries.length === 1) return t("koko.fileManagement.deleteConfirm", { name: entries[0]?.name });
    return `${t("koko.actions.delete")} ${t("koko.fileManagement.items", { count: entries.length })}?`;
  }
  return t("koko.fileManagement.downloadFolderConfirm");
});

async function removeEntries(entries: SftpFileEntry[], concurrency = 4) {
  const results: PromiseSettledResult<void>[] = new Array(entries.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, entries.length) }, async () => {
    while (nextIndex < entries.length) {
      const index = nextIndex++;
      const entry = entries[index];
      if (!entry) continue;
      try {
        await manager.operations.removeEntry(entry);
        results[index] = { status: "fulfilled", value: undefined };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

watch(selectedEntry, (entry) => emit("select", entry));

watch(manager.currentPath, () => {
  hideContextMenu();
  clearSelection();
});

watch(manager.connected, (connected) => {
  if (connected && manager.transferEndpoint) emit("transferEndpointConnected");
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

function clearTransferredSelection(names: string[], sourcePath: string, revision: number) {
  clearTransferredSelectionWithGuard(names, sourcePath, revision, manager.currentPath.value);
}

function onDragStart(event: DragEvent, entry: SftpFileEntry) {
  if (entry.is_dir || entry.name === ".." || !canTransferFiles.value || !props.transferEndpoint) {
    event.preventDefault();
    return;
  }

  if (!isSelected(entry)) selectEntry(entry);

  const payload = buildTransferSourcePayload({
    sourceEndpoint: props.transferEndpoint,
    sourcePath: manager.currentPath.value,
    sourceSelectionRevision: selectionRevision.value,
    entries: transferEntriesFromSelection(selectedEntries.value)
  });
  if (!payload) {
    event.preventDefault();
    return;
  }

  writeTransferDragData(event, payload, activeTransferDragSourceId);
}

function canAcceptTransferDrag(event: DragEvent) {
  return Boolean(
    canTransferFiles.value &&
    props.transferEndpoint?.id &&
    isCrossEndpointTransferDrag(activeTransferDragSourceId.value, props.transferEndpoint.id) &&
    hasTransferMimeType(event)
  );
}

function onTransferDragEnter(event: DragEvent) {
  if (!canAcceptTransferDrag(event)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
}

function onTransferDragOver(event: DragEvent) {
  if (!canAcceptTransferDrag(event)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
}

function clearTransferDragState() {
  activeTransferDragSourceId.value = null;
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

function requestSend() {
  if (!canTransferFiles.value) return;
  const payload = transferSourcePayload();
  if (!payload) return;
  hideContextMenu();
  emit("send", payload);
}

function onTransferDrop(event: DragEvent) {
  const payload = parseTransferDragPayload(event, props.transferEndpoint?.id);
  clearTransferDragState();
  if (!payload) return;
  event.preventDefault();
  emit("transferDrop", { ...payload, destinationPath: manager.currentPath.value });
}

async function refreshCurrentDirectory() {
  const refreshed = await manager.loadCurrentDirectory();
  if (refreshed) return;
  addErrorToast({ title: t("koko.fileManagement.refreshFailed"), error: manager.error.value });
}

async function runFileOperation(operation: () => Promise<void>, successTitle: string, refresh = false) {
  try {
    await operation();
    toast.add({ title: successTitle, color: "success" });
    if (refresh) await refreshCurrentDirectory();
    return true;
  } catch (error) {
    addErrorToast({ title: t("koko.fileManagement.operationFailed"), error });
    return false;
  }
}

const createFolder = () => {
  promptTarget.value = null;
  promptKind.value = "folder";
  promptName.value = "";
  promptOpen.value = true;
};

const createFile = () => {
  promptTarget.value = null;
  promptKind.value = "file";
  promptName.value = "";
  promptOpen.value = true;
};

const rename = (entry: SftpFileEntry) => {
  hideContextMenu();
  promptTarget.value = entry;
  promptName.value = entry.name;
  promptOpen.value = true;
};

function requestDelete(entries = selectedEntries.value) {
  const targets = entries.filter((entry) => entry.name !== "..");
  if (!targets.length) return;
  hideContextMenu();
  alertTarget.value = { kind: "delete", entries: targets };
  alertOpen.value = true;
}

const downloadEntry = (entry: SftpFileEntry) => {
  hideContextMenu();
  void runFileOperation(
    () => manager.operations.downloadEntry(entry),
    t("koko.fileManagement.entryDownloaded", { name: entry.name })
  );
};

const downloadSelected = () => {
  const entry = selectedEntry.value;
  if (!entry || selectedEntries.value.length !== 1) return;
  if (entry.is_dir) {
    hideContextMenu();
    alertTarget.value = { kind: "download", entries: [entry] };
    alertOpen.value = true;
    return;
  }
  downloadEntry(entry);
};

function openContextMenu(entry: SftpFileEntry, event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  if (entry.name === "..") return;
  if (!isSelected(entry)) updateSelection([entry]);
  contextEntry.value = entry;
  contextMenuPosition.value = { x: event.clientX, y: event.clientY };
  contextMenuVisible.value = true;
}

function hideContextMenu() {
  contextMenuVisible.value = false;
  contextEntry.value = null;
}

const contextMenuItems = computed<DropdownMenuItem[]>(() => {
  const entry = contextEntry.value;
  if (!entry) return [];
  const singleSelection = selectedEntries.value.length === 1;
  const items: DropdownMenuItem[] = [];

  // Full dual-pane mode only: multi-target distribution is intentionally absent from compact SFTP.
  if (canTransferFiles.value) {
    items.push(
      {
        label: t("koko.fileManagement.sendTo"),
        icon: "i-lucide-send",
        disabled: !transferableEntries.value.length,
        onSelect: requestSend
      },
      { type: "separator" }
    );
  }

  items.push(
    {
      label: t("koko.actions.download"),
      icon: "i-lucide-download",
      disabled: !singleSelection,
      onSelect: downloadSelected
    },
    {
      label: t("koko.actions.rename"),
      icon: "i-lucide-pencil",
      disabled: !singleSelection,
      onSelect: () => rename(entry)
    },
    { type: "separator" },
    {
      label: t("koko.actions.delete"),
      icon: "i-lucide-trash-2",
      color: "error",
      onSelect: () => requestDelete()
    }
  );

  return items;
});

const submitPrompt = async () => {
  const name = promptName.value.trim();
  const target = promptTarget.value;
  const isNewFile = promptKind.value === "file";
  if (!name || (target && name === target.name)) return;
  const success = await runFileOperation(
    () => {
      if (target) return manager.operations.renameEntry(target, name);
      if (isNewFile) {
        const directory = manager.currentPath.value.replace(/\/$/, "") || "/";
        return manager.operations.createFileAt(`${directory}/${name}`.replace(/\/+/g, "/"));
      }
      return manager.operations.createDirectory(name);
    },
    target
      ? t("koko.fileManagement.entryRenamed", { name })
      : isNewFile
        ? t("koko.fileManagement.fileCreated", { name })
        : t("koko.fileManagement.folderCreated", { name }),
    true
  );
  if (success) {
    clearSelection();
    promptOpen.value = false;
  }
};

const confirmAlert = async () => {
  const target = alertTarget.value;
  if (!target) return;
  const [entry] = target.entries;
  if (!entry) return;

  if (target.kind === "download") {
    const success = await runFileOperation(
      () => manager.operations.downloadEntry(entry),
      t("koko.fileManagement.entryDownloaded", { name: entry.name })
    );
    if (success) alertOpen.value = false;
    return;
  }

  const results = await removeEntries(target.entries);
  const succeeded = results.filter((result) => result.status === "fulfilled").length;
  const failedEntries = target.entries.filter((_, index) => results[index]?.status === "rejected");
  if (succeeded) {
    toast.add({
      title:
        target.entries.length === 1
          ? t("koko.fileManagement.entryDeleted", { name: entry.name })
          : `${t("koko.actions.delete")}: ${t("koko.fileManagement.items", { count: succeeded })}`,
      color: succeeded === target.entries.length ? "success" : "warning"
    });
    await refreshCurrentDirectory();
    updateSelection(failedEntries);
    alertOpen.value = false;
  }

  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") {
    addErrorToast({ title: t("koko.fileManagement.operationFailed"), error: failure.reason });
  }
};

const uploadFromEvent = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files || [])];
  input.value = "";

  if (!files.length) return;

  const results = await Promise.allSettled(files.map((file) => manager.operations.uploadFile(file)));
  const success = results.filter((result) => result.status === "fulfilled").length;

  if (success) {
    toast.add({
      title:
        success === files.length
          ? t("koko.fileManagement.uploadedFiles", { count: success })
          : t("koko.fileManagement.uploadedFilesPartial", { success, total: files.length }),
      color: success === files.length ? "success" : "warning"
    });
    await refreshCurrentDirectory();
  }

  if (success !== files.length) {
    const failure = results.find((result) => result.status === "rejected");
    addErrorToast({
      title: t("koko.fileManagement.operationFailed"),
      error: failure && failure.status === "rejected" ? failure.reason : ""
    });
  }
};

function onKeydown(event: KeyboardEvent) {
  if (!props.focused || props.compact) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest("input, textarea, [contenteditable='true']")) return;

  if ((event.key === "a" || event.key === "A") && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    toggleAllVisible(true);
    return;
  }
  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    event.preventDefault();
    moveSelection(event.key === "ArrowUp" ? -1 : 1, event.shiftKey);
    return;
  }
  if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    moveSelectionToBoundary(event.key === "Home" ? "start" : "end", event.shiftKey);
    return;
  }
  if (event.key === "Escape") {
    clearSelection();
    hideContextMenu();
    return;
  }
  if (event.key === "F5" || ((event.key === "r" || event.key === "R") && (event.metaKey || event.ctrlKey))) {
    event.preventDefault();
    void manager.loadCurrentDirectory();
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    if (!selectedEntries.value.length) return;
    event.preventDefault();
    requestDelete();
    return;
  }
  if (event.key === "Enter" && selectedEntry.value?.is_dir) {
    event.preventDefault();
    void manager.changeDirectory(selectedEntry.value);
  }
}

function focusPane() {
  emit("focus");
}

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
      <UButton size="xs" @click="manager.retry.reconnect()">
        {{ t("koko.fileManagement.reconnect") }}
      </UButton>
    </div>
  </div>
  <div
    v-else
    class="sftp-file-management relative flex h-full min-h-0 flex-col bg-(--app-main-bg) text-(--app-fg) outline-none"
    :class="{
      'sftp-file-management--compact': compact,
      'ring-1 ring-inset ring-primary/40': focused && !compact
    }"
    tabindex="0"
    @mousedown="focusPane"
    @dragenter="canTransferFiles ? onTransferDragEnter($event) : undefined"
    @dragover="canTransferFiles ? onTransferDragOver($event) : undefined"
    @drop="canTransferFiles ? onTransferDrop($event) : undefined"
  >
    <div
      v-if="title"
      class="sftp-file-management__pane-title flex shrink-0 items-center border-b border-(--app-border) bg-(--app-header-bg)"
    >
      {{ title }}
    </div>
    <div
      data-sftp-tour="navigation"
      class="sftp-file-management__toolbar flex shrink-0 items-center gap-1.5 border-b border-(--app-border) bg-(--app-panel-bg) px-3"
    >
      <UButton
        icon="i-lucide-chevron-left"
        color="neutral"
        variant="ghost"
        size="sm"
        :disabled="!manager.canGoBack.value"
        :title="t('koko.fileManagement.back')"
        @click="manager.goBack()"
      />
      <UButton
        icon="i-lucide-chevron-right"
        color="neutral"
        variant="ghost"
        size="sm"
        :disabled="!manager.canGoForward.value"
        :title="t('koko.fileManagement.forward')"
        @click="manager.goForward()"
      />
      <UButton
        icon="i-lucide-arrow-up"
        color="neutral"
        variant="ghost"
        size="sm"
        :disabled="manager.currentPath.value === '/'"
        :title="t('koko.drawer.up')"
        @click="manager.changeDirectory({ name: '..', is_dir: true } as SftpFileEntry)"
      />
      <UButton
        icon="i-lucide-house"
        color="neutral"
        variant="ghost"
        size="sm"
        :disabled="!manager.canGoHome.value"
        :title="t('koko.fileManagement.home')"
        @click="manager.goHome()"
      />
      <UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="ghost"
        size="sm"
        :title="t('koko.fileManagement.refresh')"
        @click="manager.loadCurrentDirectory()"
      />
      <div
        class="flex h-8 min-w-0 flex-1 items-center overflow-x-auto rounded-[3px] border border-(--app-border) bg-(--app-input-bg) px-1 font-ui-mono text-[12px] text-(--app-fg)"
      >
        <button
          type="button"
          class="shrink-0 rounded-[3px] px-1.5 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--app-focus-ring)"
          aria-label="/"
          :aria-current="pathSegments.length === 0 ? 'page' : undefined"
          @click="navigateToPath(-1)"
        >
          /
        </button>
        <template v-for="(segment, index) in pathSegments" :key="`${segment}:${index}`">
          <UIcon name="i-lucide-chevron-right" class="size-3 shrink-0 text-(--app-muted)" />
          <button
            type="button"
            class="shrink-0 rounded px-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--app-focus-ring)"
            :class="index === pathSegments.length - 1 ? 'font-semibold' : 'text-(--app-muted)'"
            :aria-label="`/${pathSegments.slice(0, index + 1).join('/')}`"
            :aria-current="index === pathSegments.length - 1 ? 'page' : undefined"
            @click="navigateToPath(index)"
          >
            {{ segment }}
          </button>
        </template>
      </div>
      <UInput
        v-model="search"
        icon="i-lucide-search"
        size="sm"
        :placeholder="t('koko.actions.search')"
        class="w-47.5 shrink-0 max-w-[38%]"
        :ui="{ base: 'h-8 text-[12px]' }"
      />
    </div>
    <div
      data-sftp-tour="file-actions"
      class="sftp-file-management__actionbar flex shrink-0 items-center justify-between gap-2 border-b border-(--app-border) bg-(--app-panel-bg) px-3"
    >
      <div class="flex min-w-0 items-center gap-1.5">
        <UButton icon="i-lucide-folder-plus" color="neutral" variant="soft" size="xs" @click="createFolder">
          {{ t("koko.fileManagement.newFolder") }}
        </UButton>
        <UButton icon="i-lucide-file-plus-2" color="neutral" variant="soft" size="xs" @click="createFile">
          {{ t("koko.fileManagement.newFile") }}
        </UButton>
      </div>
      <div class="flex shrink-0 items-center gap-1.5">
        <UButton icon="i-lucide-upload" color="primary" variant="solid" size="xs" @click="uploadInput?.click()">
          {{ t("koko.actions.upload") }}
        </UButton>
      </div>
      <input ref="uploadInput" type="file" multiple class="hidden" @change="uploadFromEvent" />
    </div>
    <div v-if="manager.currentUploadName.value" class="border-b border-(--app-border) bg-(--app-panel-bg) px-3 py-1.5">
      <div class="mb-1 flex items-center justify-between gap-2 text-[10px] text-(--app-muted)">
        <span class="truncate">{{ manager.currentUploadName.value }}</span>
        <span>{{ manager.uploadProgress.value }}%</span>
      </div>
      <div class="flex items-center gap-2">
        <UProgress :value="manager.uploadProgress.value" size="xs" class="flex-1" />
        <span v-if="manager.queuedUploadCount.value" class="shrink-0 text-[11px] text-(--app-muted)">
          +{{ manager.queuedUploadCount.value }}
        </span>
      </div>
    </div>
    <div v-if="manager.loading.value" class="grid flex-1 place-items-center">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
    </div>
    <div v-else class="relative min-h-0 flex-1 bg-(--app-main-bg)">
      <div class="h-full overflow-auto">
        <div class="relative min-h-full select-none pb-15">
          <table
            class="sftp-file-management__table w-full table-fixed border-separate border-spacing-0"
            data-sftp-tour="file-table"
          >
            <thead>
              <tr>
                <th class="h-8.75 w-10 border-b border-(--app-border) bg-(--app-panel-bg) px-3 py-2 text-center">
                  <UCheckbox
                    :model-value="selectAllState"
                    icon="i-lucide-check"
                    indeterminate-icon="i-lucide-minus"
                    :aria-label="t('koko.fileManagement.selectAllVisibleFiles')"
                    :disabled="selectableVisibleEntries.length === 0"
                    @update:model-value="toggleAllVisible($event === true)"
                  />
                </th>
                <th
                  class="h-8.75 min-w-0 border-b border-(--app-border) bg-(--app-panel-bg) px-3.5 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.05em] text-(--app-muted)"
                >
                  {{ t("koko.fileManagement.name") }}
                </th>
                <th
                  class="hidden h-8.75 w-42 border-b border-(--app-border) bg-(--app-panel-bg) px-3.5 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.05em] text-(--app-muted) md:table-cell"
                >
                  {{ t("koko.fileManagement.modifiedTime") }}
                </th>
                <th
                  class="h-8.75 w-27.5 border-b border-(--app-border) bg-(--app-panel-bg) px-3.5 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.05em] text-(--app-muted)"
                >
                  {{ t("koko.fileManagement.size") }}
                </th>
                <th
                  class="h-8.75 w-24 border-b border-(--app-border) bg-(--app-panel-bg) px-3.5 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.05em] text-(--app-muted)"
                >
                  {{ typeColumnLabel }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="entry in visibleEntries"
                :key="entry.name"
                class="group h-9.5 transition-colors hover:bg-(--app-hover-soft)"
                :class="[
                  isSelected(entry) ? 'bg-(--app-selected-soft)' : '',
                  highlightedSet.has(entry.name) ? 'sftp-file-row--highlight' : ''
                ]"
                :aria-selected="isSelected(entry)"
                @click="selectEntry(entry, $event)"
                @contextmenu="openContextMenu(entry, $event)"
              >
                <td class="h-9.5 w-10 border-b border-(--app-border)/60 px-3 py-1.5 text-center" @click.stop>
                  <UCheckbox
                    v-if="entry.name !== '..'"
                    :model-value="isSelected(entry)"
                    icon="i-lucide-check"
                    :aria-label="t('koko.fileManagement.selectFile', { name: entry.name })"
                    @update:model-value="toggleEntry(entry, $event === true)"
                  />
                </td>
                <td class="h-9.5 min-w-0 border-b border-(--app-border)/60 px-3.5 py-1.5 text-[12.5px] text-(--app-fg)">
                  <div class="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      class="flex min-w-0 flex-1 items-center gap-2 rounded-[3px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--app-focus-ring)"
                      :class="
                        canTransferFiles && !entry.is_dir && entry.name !== '..'
                          ? 'cursor-grab active:cursor-grabbing'
                          : ''
                      "
                      :draggable="canTransferFiles && !entry.is_dir && entry.name !== '..'"
                      :title="
                        canTransferFiles && !entry.is_dir && entry.name !== '..'
                          ? t('koko.fileManagement.transferToRemote')
                          : undefined
                      "
                      @dblclick.stop="entry.is_dir && manager.changeDirectory(entry)"
                      @dragstart="onDragStart($event, entry)"
                    >
                      <UIcon
                        :name="entry.is_dir ? 'i-lucide-folder' : 'i-lucide-file'"
                        class="sftp-file-icon shrink-0 text-(--app-muted)"
                        :class="entry.is_dir ? 'text-primary' : ''"
                      />
                      <UTooltip :text="entry.name" :delay-duration="150">
                        <span class="sftp-file-name min-w-0 flex-1 truncate" :class="entry.is_dir ? 'font-medium' : ''">
                          {{ entry.name }}
                        </span>
                      </UTooltip>
                    </button>
                  </div>
                </td>
                <td class="hidden h-9.5 w-42 border-b border-(--app-border)/60 px-3.5 py-1.5 text-right md:table-cell">
                  <span class="sftp-file-meta block truncate font-ui-mono">
                    {{ formatModifiedTime(entry.mod_time) }}
                  </span>
                </td>
                <td class="h-9.5 w-27.5 border-b border-(--app-border)/60 px-3.5 py-1.5 text-right">
                  <span class="sftp-file-meta block truncate font-ui-mono">
                    {{ entry.is_dir ? "—" : formatFileSize(entry.size) }}
                  </span>
                </td>
                <td class="h-9.5 w-24 border-b border-(--app-border)/60 px-3.5 py-1.5 text-left">
                  <span class="sftp-file-meta block truncate font-ui-mono">
                    {{ fileType(entry) }}
                  </span>
                </td>
              </tr>
              <tr v-if="visibleEntries.length === 0">
                <td
                  colspan="5"
                  class="h-24 border-b border-(--app-border)/60 px-3.5 text-center text-sm text-(--app-muted)"
                >
                  {{ t("Common.NoData") }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div
          class="flex h-7 items-center border-t border-(--app-border) bg-(--app-panel-bg) px-3.5 font-ui-mono text-[10.5px] text-(--app-muted)"
        >
          {{ t("koko.fileManagement.items", { count: visibleEntries.length }) }}
        </div>
      </div>
      <SftpPaneSelectionBar
        :selected-count="selectedEntries.length"
        :transferable-count="transferableEntries.length"
        :selected-bytes="selectedSize"
        :can-send="canTransferFiles"
        :can-download="selectedEntries.length === 1"
        remote-style
        @send="requestSend"
        @download="downloadSelected"
        @remove="requestDelete()"
        @clear="clearSelection"
      />
    </div>
    <div v-if="transferDropActive" class="sftp-transfer-drop-target" aria-hidden="true">
      <div class="sftp-transfer-drop-target__label">
        <UIcon name="i-lucide-send" />
        <span>
          {{ t("koko.fileManagement.copyTo") }}
          <strong>{{ transferEndpoint?.label }}</strong>
          ·
          <span class="font-ui-mono">{{ manager.currentPath.value }}</span>
        </span>
      </div>
      <p class="font-ui-mono">{{ t("koko.fileManagement.releaseToCurrentDirectory") }}</p>
    </div>
    <div
      v-else-if="transferDropBlocked"
      class="sftp-transfer-drop-target sftp-transfer-drop-target--blocked"
      aria-hidden="true"
    >
      <div class="sftp-transfer-drop-target__label">
        <UIcon name="i-lucide-ban" />
        <span>{{ t("koko.fileManagement.dropSameEndpoint") }}</span>
      </div>
    </div>
    <UDropdownMenu
      :open="contextMenuVisible"
      :items="contextMenuItems"
      size="sm"
      :content="{ align: 'start', side: 'bottom' }"
      @update:open="
        (open) => {
          if (!open) hideContextMenu();
          else contextMenuVisible = open;
        }
      "
    >
      <div
        class="pointer-events-none fixed size-px"
        :style="{ left: `${contextMenuPosition.x}px`, top: `${contextMenuPosition.y}px` }"
      />
    </UDropdownMenu>
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
