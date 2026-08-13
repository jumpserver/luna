<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type {
  SftpTransferDropPayload,
  SftpTransferSourcePayload
} from "#koko/composables/sftp/file-manager/workspaceTypes";
import type { SftpFileEntry } from "#koko/composables/sftp/useSftpFileManager";
import type { FileTransferEndpointRef } from "~/shared/file-transfer/types";
import prettyBytes from "pretty-bytes";
import SftpPaneSelectionBar from "#koko/components/FileManagement/pane/SftpPaneSelectionBar.vue";

import {
  buildTransferSourcePayload,
  hasEndpointPrefix,
  hasTransferMimeType,
  isCrossEndpointTransferDrag,
  parseTransferDragPayload,
  transferEntriesFromSelection,
  writeTransferDragData
} from "#koko/composables/sftp/file-manager/transfer";
import { useSftpPaneSelection } from "#koko/composables/sftp/file-manager/useSftpPaneSelection";

const props = withDefaults(
  defineProps<{
    /** Names to briefly highlight after a completed transfer. */
    highlightedNames?: string[];
    focused?: boolean;
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
}>();

const LOCAL_ROOT_STORAGE_KEY = "jumpserver-client:file-manager-local-root";
const LOCAL_ENDPOINT_ID = "local:fs";

const { t } = useI18n();
const toast = useToast();
const { addErrorToast } = useErrorToast();

const entries = ref<SftpFileEntry[]>([]);
const currentPath = ref("");
const rootPath = ref("");
const loading = ref(true);
const error = ref("");
const setupOpen = ref(false);
const search = ref("");
const uploadInput = ref<HTMLInputElement | null>(null);
const activeScopedPath = ref("");
const rootEl = ref<HTMLElement | null>(null);
const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const contextEntry = ref<SftpFileEntry | null>(null);
const promptOpen = ref(false);
const promptName = ref("");
const promptTarget = ref<SftpFileEntry | null>(null);
const promptKind = ref<"folder" | "file">("folder");
const alertOpen = ref(false);
const alertEntries = ref<SftpFileEntry[]>([]);
const quickPaths = ref<Array<{ key: string; label: string; path: string; icon: string }>>([]);

const activeTransferDragSourceId = useState<string | null>("sftp-active-transfer-drag-source", () => null);

const transferEndpoint = computed<FileTransferEndpointRef>(() => ({
  id: LOCAL_ENDPOINT_ID,
  label: t("koko.fileManagement.localFiles")
}));

const isPermissionError = computed(() =>
  /forbidden path|not allowed on the scope|permission|operation not permitted/i.test(error.value)
);

const visibleEntries = computed(() => {
  const query = search.value.trim().toLowerCase();
  const list = entries.value.filter((entry) => !query || entry.name.toLowerCase().includes(query));
  return list.sort((left, right) => {
    if (left.name === "..") return -1;
    if (right.name === "..") return 1;
    if (left.is_dir !== right.is_dir) return Number(right.is_dir) - Number(left.is_dir);
    return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
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

function clearTransferredSelection(names: string[], sourcePath: string, revision: number) {
  clearTransferredSelectionWithGuard(names, sourcePath, revision, currentPath.value);
}
const transferableEntries = computed(() => transferEntriesFromSelection(selectedEntries.value));
const selectedSize = computed(() =>
  transferableEntries.value.reduce((total, entry) => {
    const size = Number(entry.size);
    return total + (Number.isFinite(size) && size >= 0 ? size : 0);
  }, 0)
);

const transferDropActive = computed(
  () =>
    isCrossEndpointTransferDrag(activeTransferDragSourceId.value, LOCAL_ENDPOINT_ID) &&
    hasEndpointPrefix(activeTransferDragSourceId.value, "sftp:")
);
const transferDropBlocked = computed(
  () => Boolean(activeTransferDragSourceId.value) && activeTransferDragSourceId.value === LOCAL_ENDPOINT_ID
);

const highlightedSet = computed(() => new Set(props.highlightedNames || []));

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

function loadSavedRoot() {
  if (!import.meta.client) return "";
  return globalThis.localStorage?.getItem(LOCAL_ROOT_STORAGE_KEY)?.trim() || "";
}

function saveRoot(path: string) {
  if (!import.meta.client) return;
  globalThis.localStorage?.setItem(LOCAL_ROOT_STORAGE_KEY, path);
}

function clearRoot() {
  if (!import.meta.client) return;
  globalThis.localStorage?.removeItem(LOCAL_ROOT_STORAGE_KEY);
}

async function fsModules() {
  const [fs, path] = await Promise.all([import("@tauri-apps/plugin-fs"), import("@tauri-apps/api/path")]);
  return { fs, path };
}

async function releaseSecurityScope(targetPath = activeScopedPath.value) {
  if (!targetPath || !isTauriRuntime()) return;
  try {
    const { fs } = await fsModules();
    await fs.stopAccessingSecurityScopedResource?.(targetPath);
  } catch {
    // Ignore scope release failures so the UI can keep working.
  } finally {
    if (targetPath === activeScopedPath.value) activeScopedPath.value = "";
  }
}

async function activateSecurityScope(targetPath: string) {
  if (!targetPath || !isTauriRuntime()) return;
  if (activeScopedPath.value && activeScopedPath.value !== targetPath) {
    await releaseSecurityScope(activeScopedPath.value);
  }
  try {
    const { fs } = await fsModules();
    await fs.startAccessingSecurityScopedResource?.(targetPath);
    activeScopedPath.value = targetPath;
  } catch {
    // Some platforms and unsigned/dev builds do not expose security-scoped access.
  }
}

async function resolveInitialRoot() {
  const { path } = await fsModules();
  return loadSavedRoot() || (await path.homeDir());
}

async function refreshQuickPaths() {
  if (!isTauriRuntime()) {
    quickPaths.value = [];
    return;
  }
  try {
    const { path } = await fsModules();
    const [home, desktop, download] = await Promise.all([
      path.homeDir().catch(() => ""),
      path.desktopDir().catch(() => ""),
      path.downloadDir().catch(() => "")
    ]);
    const next: Array<{ key: string; label: string; path: string; icon: string }> = [];
    if (home) next.push({ key: "home", label: t("koko.localFile.quickHome"), path: home, icon: "i-lucide-house" });
    if (desktop)
      next.push({ key: "desktop", label: t("koko.localFile.quickDesktop"), path: desktop, icon: "i-lucide-monitor" });
    if (download)
      next.push({
        key: "download",
        label: t("koko.localFile.quickDownload"),
        path: download,
        icon: "i-lucide-download"
      });
    quickPaths.value = next;
  } catch {
    quickPaths.value = [];
  }
}

async function list(path?: string) {
  if (!isTauriRuntime()) return;
  loading.value = true;
  error.value = "";
  try {
    const { fs, path: pathApi } = await fsModules();
    if (!rootPath.value) rootPath.value = await resolveInitialRoot();
    currentPath.value = path || currentPath.value || rootPath.value;
    await activateSecurityScope(rootPath.value);
    const items = await fs.readDir(currentPath.value);
    const nextEntries = await Promise.all(
      items.map(async (item) => {
        const fullPath = await pathApi.join(currentPath.value, item.name);
        try {
          const info = await fs.stat(fullPath);
          return {
            name: item.name,
            size: info.isFile ? String(info.size) : "",
            perm: "",
            mod_time: info.mtime?.toISOString() || "",
            type: "",
            is_dir: info.isDirectory
          } satisfies SftpFileEntry;
        } catch {
          return {
            name: item.name,
            size: "",
            perm: "",
            mod_time: "",
            type: "",
            is_dir: item.isDirectory
          } satisfies SftpFileEntry;
        }
      })
    );
    entries.value = nextEntries;
    if (currentPath.value !== rootPath.value) {
      entries.value.unshift({ name: "..", size: "", perm: "", mod_time: "", type: "", is_dir: true });
    }
    saveRoot(rootPath.value);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
    if (!currentPath.value && !rootPath.value) {
      rootPath.value = await resolveInitialRoot().catch(() => "");
    }
    if (isPermissionError.value) setupOpen.value = true;
  } finally {
    loading.value = false;
  }
}

async function entryPath(entry: SftpFileEntry) {
  const { path } = await fsModules();
  return path.join(currentPath.value, entry.name);
}

async function changeDirectory(entry: SftpFileEntry) {
  const { path } = await fsModules();
  await list(entry.name === ".." ? await path.dirname(currentPath.value) : await entryPath(entry));
  clearSelection();
}

async function goToPath(target: string) {
  if (!target) return;
  rootPath.value = target;
  currentPath.value = target;
  saveRoot(target);
  await activateSecurityScope(target);
  await list(target);
  clearSelection();
}

async function readFile(entry: SftpFileEntry, targetPath?: string) {
  const { fs } = await fsModules();
  const fullPath = targetPath || (await entryPath(entry));
  return new Blob([await fs.readFile(fullPath)]);
}

async function uploadBlob(fileName: string, blob: Blob, targetPath?: string) {
  const { fs, path } = await fsModules();
  const fullPath = targetPath || (await path.join(currentPath.value, fileName));
  await fs.writeFile(fullPath, new Uint8Array(await blob.arrayBuffer()));
  await list();
}

async function createDirectory(name: string) {
  const { fs, path } = await fsModules();
  await fs.mkdir(await path.join(currentPath.value, name));
  await list();
}

async function createFileAt(name: string) {
  await uploadBlob(name, new Blob([""]));
}

async function renameEntry(entry: SftpFileEntry, nextName: string) {
  const { fs, path } = await fsModules();
  const from = await entryPath(entry);
  const to = await path.join(currentPath.value, nextName);
  await fs.rename(from, to);
  await list();
}

async function removeEntry(entry: SftpFileEntry) {
  const { fs } = await fsModules();
  const fullPath = await entryPath(entry);
  if (entry.is_dir) await fs.remove(fullPath, { recursive: true });
  else await fs.remove(fullPath);
}

async function uploadFromEvent(event: Event) {
  const files = [...((event.target as HTMLInputElement).files || [])];
  (event.target as HTMLInputElement).value = "";
  for (const file of files) await uploadBlob(file.name, file);
}

async function chooseFolder() {
  try {
    const selected = (await useTauriDialogOpen({
      directory: true,
      multiple: false,
      title: t("koko.localFile.chooseFolder")
    })) as string | null;
    if (!selected) return;
    setupOpen.value = false;
    await goToPath(selected);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}

async function resetToDefaultRoot() {
  const { path } = await fsModules();
  const home = await path.homeDir();
  clearRoot();
  setupOpen.value = false;
  await goToPath(home);
}

async function revealInSystem(entry?: SftpFileEntry | null) {
  if (!isTauriRuntime()) return;
  try {
    const target = entry && entry.name !== ".." ? await entryPath(entry) : currentPath.value;
    const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
    await revealItemInDir(target);
  } catch (cause) {
    addErrorToast({ title: t("koko.localFile.revealFailed"), error: cause });
  }
}

function formatFileSize(value: string) {
  const bytes = Number(value);
  return Number.isFinite(bytes) && bytes >= 0 ? prettyBytes(bytes) : value || "—";
}

function formatModifiedTime(value: string) {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  const two = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

function fileType(entry: SftpFileEntry) {
  if (entry.is_dir) return t("koko.fileManagement.folder");
  const normalizedName = entry.name.toLowerCase();
  const extension = normalizedName.includes(".") ? normalizedName.split(".").at(-1) || "" : "";
  return extension || t("koko.fileManagement.file");
}

function onDragStart(event: DragEvent, entry: SftpFileEntry) {
  if (entry.is_dir || entry.name === "..") {
    event.preventDefault();
    return;
  }
  if (!isSelected(entry)) selectEntry(entry);

  const payload = buildTransferSourcePayload({
    sourceEndpoint: transferEndpoint.value,
    sourcePath: currentPath.value,
    sourceSelectionRevision: selectionRevision.value,
    entries: transferableEntries.value
  });
  if (!payload) {
    event.preventDefault();
    return;
  }

  writeTransferDragData(event, payload, activeTransferDragSourceId);
}

function clearTransferDragState() {
  activeTransferDragSourceId.value = null;
}

function canAcceptTransferDrag(event: DragEvent) {
  return Boolean(
    isCrossEndpointTransferDrag(activeTransferDragSourceId.value, LOCAL_ENDPOINT_ID) && hasTransferMimeType(event)
  );
}

function onTransferDragOver(event: DragEvent) {
  if (!canAcceptTransferDrag(event)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
}

function onTransferDrop(event: DragEvent) {
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

function openCreate(kind: "folder" | "file") {
  hideContextMenu();
  promptTarget.value = null;
  promptKind.value = kind;
  promptName.value = "";
  promptOpen.value = true;
}

function openRename(entry: SftpFileEntry) {
  hideContextMenu();
  promptTarget.value = entry;
  promptName.value = entry.name;
  promptOpen.value = true;
}

function requestDelete(entriesToDelete = selectedEntries.value) {
  const targets = entriesToDelete.filter((entry) => entry.name !== "..");
  if (!targets.length) return;
  hideContextMenu();
  alertEntries.value = targets;
  alertOpen.value = true;
}

async function submitPrompt() {
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
        : promptKind.value === "file"
          ? t("koko.fileManagement.fileCreated", { name })
          : t("koko.fileManagement.folderCreated", { name }),
      color: "success"
    });
    clearSelection();
    promptOpen.value = false;
  } catch (cause) {
    addErrorToast({ title: t("koko.fileManagement.operationFailed"), error: cause });
  }
}

async function confirmDelete() {
  const targets = alertEntries.value;
  if (!targets.length) return;
  let success = 0;
  for (const entry of targets) {
    try {
      await removeEntry(entry);
      success += 1;
    } catch {
      // continue
    }
  }
  if (success) {
    toast.add({
      title:
        targets.length === 1
          ? t("koko.fileManagement.entryDeleted", { name: targets[0]?.name })
          : `${t("koko.actions.delete")}: ${t("koko.fileManagement.items", { count: success })}`,
      color: success === targets.length ? "success" : "warning"
    });
    await list();
    clearSelection();
    alertOpen.value = false;
  } else {
    addErrorToast({ title: t("koko.fileManagement.operationFailed"), error: "" });
  }
}

function onKeydown(event: KeyboardEvent) {
  if (!props.focused) return;
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
    void list();
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
    void changeDirectory(selectedEntry.value);
  }
}

function focusPane() {
  emit("focus");
  rootEl.value?.focus({ preventScroll: true });
}

watch(selectedEntry, (entry) => emit("select", entry));
watch(selectedEntries, (value) => emit("selectionChange", value), { deep: true });
watch(
  () => props.focused,
  (focused) => {
    if (focused) rootEl.value?.focus({ preventScroll: true });
  }
);

onMounted(() => {
  void list();
  void refreshQuickPaths();
  document.addEventListener("dragend", clearTransferDragState);
  document.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("dragend", clearTransferDragState);
  document.removeEventListener("keydown", onKeydown);
  void releaseSecurityScope();
});

const manager = {
  operations: { readFile, uploadBlob },
  currentPath,
  connected: computed(() => !error.value && !loading.value)
};

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
    {
      label: t("koko.actions.rename"),
      icon: "i-lucide-pencil",
      disabled: !single,
      onSelect: () => openRename(entry)
    },
    {
      label: t("koko.actions.delete"),
      icon: "i-lucide-trash-2",
      color: "error",
      onSelect: () => requestDelete()
    }
  ];
});
</script>

<template>
  <div
    ref="rootEl"
    class="sftp-file-management relative flex h-full min-h-0 flex-col bg-(--app-main-bg) outline-none"
    :class="{ 'ring-1 ring-inset ring-primary/40': focused }"
    tabindex="0"
    @mousedown="focusPane"
    @dragenter="onTransferDragOver"
    @dragover="onTransferDragOver"
    @drop="onTransferDrop"
  >
    <div class="flex shrink-0 items-center gap-1 border-b border-default p-2">
      <UButton
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        size="xs"
        :disabled="currentPath === rootPath"
        @click="changeDirectory({ name: '..', is_dir: true } as SftpFileEntry)"
      />
      <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="xs" @click="list()" />
      <div class="min-w-0 flex-1 truncate rounded bg-(--app-hover-soft) px-2 py-1 font-ui-mono text-[11px]">
        {{ currentPath || t("koko.localFile.folder") }}
      </div>
      <UButton
        icon="i-lucide-app-window"
        color="neutral"
        variant="ghost"
        size="xs"
        :title="t('koko.localFile.revealInFinder')"
        @click="revealInSystem()"
      />
      <UButton icon="i-lucide-folder-cog" color="neutral" variant="ghost" size="xs" @click="setupOpen = true" />
      <UButton icon="i-lucide-upload" color="primary" variant="soft" size="xs" @click="uploadInput?.click()" />
      <input ref="uploadInput" type="file" multiple class="hidden" @change="uploadFromEvent" />
    </div>

    <div
      v-if="quickPaths.length"
      class="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-default px-2 py-1"
    >
      <UButton
        v-for="item in quickPaths"
        :key="item.key"
        size="xs"
        color="neutral"
        :variant="currentPath.startsWith(item.path) ? 'soft' : 'ghost'"
        :icon="item.icon"
        :label="item.label"
        class="shrink-0"
        @click="goToPath(item.path)"
      />
    </div>

    <div class="flex shrink-0 items-center justify-between gap-2 border-b border-default px-2 py-1.5">
      <div class="flex min-w-0 items-center gap-1">
        <UButton
          icon="i-lucide-folder-plus"
          color="neutral"
          variant="soft"
          size="xs"
          :title="t('koko.fileManagement.newFolder')"
          @click="openCreate('folder')"
        />
        <UButton
          icon="i-lucide-file-plus-2"
          color="neutral"
          variant="soft"
          size="xs"
          :title="t('koko.fileManagement.newFile')"
          @click="openCreate('file')"
        />
      </div>
      <UInput
        v-model="search"
        icon="i-lucide-search"
        size="sm"
        :placeholder="t('koko.actions.search')"
        class="w-44 max-w-[45%] shrink-0"
        :ui="{ base: 'h-7 text-[12px]' }"
      />
    </div>

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

    <div v-else-if="loading" class="grid flex-1 place-items-center">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
    </div>

    <div v-else class="relative min-h-0 flex-1">
      <div class="h-full overflow-auto">
        <table class="sftp-file-management__table w-full table-fixed border-separate border-spacing-0">
          <thead>
            <tr>
              <th class="h-8 w-10 border-b border-default bg-elevated/50 px-2 text-center">
                <UCheckbox
                  :model-value="selectAllState"
                  icon="i-lucide-check"
                  indeterminate-icon="i-lucide-minus"
                  :aria-label="t('koko.fileManagement.selectAllVisibleFiles')"
                  :disabled="!selectableVisibleEntries.length"
                  @update:model-value="toggleAllVisible($event === true)"
                />
              </th>
              <th
                class="h-8 min-w-0 border-b border-default bg-elevated/50 px-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted"
              >
                {{ t("koko.fileManagement.name") }}
              </th>
              <th
                class="hidden h-8 w-36 border-b border-default bg-elevated/50 px-2 text-right text-[10px] font-semibold uppercase tracking-wide text-muted md:table-cell"
              >
                {{ t("koko.fileManagement.modifiedTime") }}
              </th>
              <th
                class="h-8 w-24 border-b border-default bg-elevated/50 px-2 text-right text-[10px] font-semibold uppercase tracking-wide text-muted"
              >
                {{ t("koko.fileManagement.size") }}
              </th>
              <th
                class="h-8 w-20 border-b border-default bg-elevated/50 px-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted"
              >
                {{ t("koko.fileManagement.type") }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="entry in visibleEntries"
              :key="entry.name"
              class="group h-9 transition-colors hover:bg-(--app-hover-soft)"
              :class="[
                isSelected(entry) ? 'bg-(--app-selected-soft)' : '',
                highlightedSet.has(entry.name) ? 'sftp-file-row--highlight' : ''
              ]"
              @click="selectEntry(entry, $event)"
              @contextmenu="openContextMenu(entry, $event)"
            >
              <td class="h-9 w-10 border-b border-default/60 px-2 text-center" @click.stop>
                <UCheckbox
                  v-if="entry.name !== '..'"
                  :model-value="isSelected(entry)"
                  icon="i-lucide-check"
                  :aria-label="t('koko.fileManagement.selectFile', { name: entry.name })"
                  @update:model-value="toggleEntry(entry, $event === true)"
                />
              </td>
              <td class="h-9 min-w-0 border-b border-default/60 px-2 text-[12.5px]">
                <button
                  type="button"
                  class="flex min-w-0 w-full items-center gap-2 rounded text-left"
                  :class="!entry.is_dir && entry.name !== '..' ? 'cursor-grab active:cursor-grabbing' : ''"
                  :draggable="!entry.is_dir && entry.name !== '..'"
                  @dblclick.stop="entry.is_dir && changeDirectory(entry)"
                  @dragstart="onDragStart($event, entry)"
                >
                  <UIcon
                    :name="entry.is_dir ? 'i-lucide-folder' : 'i-lucide-file'"
                    class="size-4 shrink-0 text-muted"
                    :class="entry.is_dir ? 'text-primary' : ''"
                  />
                  <span class="min-w-0 flex-1 truncate" :class="entry.is_dir ? 'font-medium' : ''">
                    {{ entry.name }}
                  </span>
                </button>
              </td>
              <td
                class="hidden h-9 w-36 border-b border-default/60 px-2 text-right font-ui-mono text-[11px] text-muted md:table-cell"
              >
                {{ formatModifiedTime(entry.mod_time) }}
              </td>
              <td class="h-9 w-24 border-b border-default/60 px-2 text-right font-ui-mono text-[11px] text-muted">
                {{ entry.is_dir ? "—" : formatFileSize(entry.size) }}
              </td>
              <td class="h-9 w-20 border-b border-default/60 px-2 text-left font-ui-mono text-[11px] text-muted">
                {{ fileType(entry) }}
              </td>
            </tr>
            <tr v-if="!visibleEntries.length">
              <td colspan="5" class="h-20 text-center text-sm text-muted">{{ t("Common.NoData") }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <SftpPaneSelectionBar
        :selected-count="selectedEntries.length"
        :transferable-count="transferableEntries.length"
        :selected-bytes="selectedSize"
        @remove="requestDelete()"
        @clear="clearSelection"
      />
    </div>

    <div v-if="transferDropActive" class="sftp-transfer-drop-target" aria-hidden="true">
      <div class="sftp-transfer-drop-target__label">
        <UIcon name="i-lucide-download" />
        <span>
          {{ t("koko.fileManagement.copyTo") }}
          <strong>{{ t("koko.fileManagement.localFiles") }}</strong>
        </span>
      </div>
      <p class="font-ui-mono">{{ currentPath }}</p>
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
      @update:open="(open) => (!open ? hideContextMenu() : (contextMenuVisible = open))"
    >
      <div
        class="pointer-events-none fixed size-px"
        :style="{ left: `${contextMenuPosition.x}px`, top: `${contextMenuPosition.y}px` }"
      />
    </UDropdownMenu>

    <UModal v-model:open="setupOpen" :title="t('koko.localFile.title')" :ui="{ content: 'max-w-lg' }">
      <template #body>
        <div class="space-y-3 text-sm text-muted">
          <p>{{ t("koko.localFile.setupDescription") }}</p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full flex-wrap justify-end gap-2">
          <UButton color="neutral" variant="outline" @click="setupOpen = false">{{ t("koko.actions.close") }}</UButton>
          <UButton color="neutral" variant="soft" icon="i-lucide-house" @click="resetToDefaultRoot">
            {{ t("koko.localFile.resetDefault") }}
          </UButton>
          <UButton color="primary" icon="i-lucide-folder-open" @click="chooseFolder">
            {{ t("koko.localFile.chooseFolder") }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="promptOpen" :title="promptTitle" :ui="{ content: 'max-w-sm' }">
      <template #body>
        <UInput v-model="promptName" autofocus @keydown.enter.prevent="!promptDisabled && submitPrompt()" />
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" @click="promptOpen = false">
            {{ t("koko.actions.cancel") }}
          </UButton>
          <UButton color="primary" :disabled="promptDisabled" @click="submitPrompt">{{ promptConfirmLabel }}</UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="alertOpen" :title="t('koko.actions.delete')" :ui="{ content: 'max-w-sm' }">
      <template #body>
        <p class="text-sm text-muted">
          {{
            alertEntries.length === 1
              ? t("koko.fileManagement.deleteConfirm", { name: alertEntries[0]?.name })
              : `${t("koko.actions.delete")} ${t("koko.fileManagement.items", { count: alertEntries.length })}?`
          }}
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" @click="alertOpen = false">{{ t("koko.actions.cancel") }}</UButton>
          <UButton color="error" @click="confirmDelete">{{ t("koko.actions.delete") }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
