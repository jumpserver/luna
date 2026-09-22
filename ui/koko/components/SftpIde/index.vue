<script setup lang="ts">
import type { ConnectorSessionContext } from "@jumpserver/connectors-core";
import type { SftpEditorDraft } from "#koko/composables/sftp/useSftpEditorDrafts";
import type { SftpFileEntry } from "#koko/composables/sftp/useSftpFileManager";
import type { AlertTarget, EditorPane, EditorTab, QuickOpenItem, TreeNode } from "./sftpIdeShared";
import { connectorSessionKey } from "@jumpserver/connectors-core";
import { SFTP_REQUEST_TIMEOUT_ERROR, sftpOperationErrorMessage } from "#koko/composables/sftp/protocol";
import { useSftpEditorDrafts } from "#koko/composables/sftp/useSftpEditorDrafts";
import { sortSftpEntries, useSftpFileManager } from "#koko/composables/sftp/useSftpFileManager";
import { KeyboardKey } from "#koko/constants/keyboard";
import CodeMirrorEditor from "./CodeMirrorEditor.client.vue";
import SftpIdeDialogs from "./SftpIdeDialogs.vue";
import SftpIdeExplorer from "./SftpIdeExplorer.vue";
import {
  isDirtyTab as dirty,
  ENCODING_ITEMS,
  fileExtension,
  joinPath,
  LINE_ENDING_ITEMS,
  pathHasPrefix,
  rewritePathPrefix,
  updateDetectedLanguage
} from "./sftpIdeShared";
import { useSftpIdeSave } from "./useSftpIdeSave";
import { useSftpIdeTabs } from "./useSftpIdeTabs";
import { useSftpIdeTree } from "./useSftpIdeTree";
import { useSftpIdeWorkspace } from "./useSftpIdeWorkspace";

const props = defineProps<{ sftpToken: string; workspaceKey?: string }>();
const emit = defineEmits<{
  connectionChange: [connected: boolean];
  connectionFailure: [message: string];
}>();
const { t } = useI18n();
const toast = useToast();
const providedContext = inject(connectorSessionKey, ref(null));
const context = computed<ConnectorSessionContext | null>(() => {
  const value = unref(providedContext);
  if (!value || !props.sftpToken) return null;
  if (value.tokenId === props.sftpToken) return value;
  return { ...value, tokenId: props.sftpToken };
});
const manager = useSftpFileManager(context);
watch(manager.ready, (ready) => emit("connectionChange", Boolean(ready)), { immediate: true });
watch(manager.fatalError, (fatalError) => {
  if (fatalError) emit("connectionFailure", manager.error.value || t("koko.fileManagement.expired"));
});
const fileEditorCapability = computed(() => manager.capabilities.value?.file_editor || null);
const fileEditorSupported = computed(() => {
  const capability = fileEditorCapability.value;
  return Boolean(
    capability?.enabled &&
    capability.read &&
    capability.write &&
    capability.save.version === 1 &&
    capability.save.expected_version &&
    capability.save.force
  );
});
const fileEditorUnavailableDescription = computed(() => {
  const capability = fileEditorCapability.value;
  if (capability && (!capability.read || !capability.write)) {
    return t("koko.sftpEditor.capabilityPermissionRequired");
  }
  return t("koko.sftpEditor.capabilityUpgradeRequired");
});
const draftScope = computed(() => props.workspaceKey || props.sftpToken);
const drafts = useSftpEditorDrafts(draftScope);
const rootPath = ref("");
const explorerRef = useTemplateRef<{
  scrollActiveRow: () => void;
  focusFocusedRow: () => void;
  focusPendingInput: () => void;
  openUploadPicker: () => void;
  scrollQuickOpenActive: () => void;
}>("explorer");
const editorLayout = shallowRef<HTMLElement | null>(null);
const alertDialogOpen = ref(false);
const alertTarget = ref<AlertTarget | null>(null);
const alertSubmitting = ref(false);
const quickOpenVisible = ref(false);
const quickOpenQuery = ref("");
const quickOpenIndex = ref(0);
const alertTitle = computed(() =>
  alertTarget.value?.kind === "delete" ? t("koko.actions.delete") : t("koko.actions.close")
);
const alertDescription = computed(() => {
  const target = alertTarget.value;
  if (!target) return "";
  return target.kind === "delete"
    ? t("koko.sftpEditor.deleteConfirm", { name: target.target.entry.name })
    : t("koko.sftpEditor.unsavedCloseConfirm", { name: target.tab.entry.name });
});
watch(fileEditorSupported, (supported) => {
  if (supported) return;
  alertDialogOpen.value = false;
  alertTarget.value = null;
});
const encodingItems = ENCODING_ITEMS;
const lineEndingItems = LINE_ENDING_ITEMS;
const languageItems = computed(
  () =>
    [
      { label: t("koko.sftpEditor.plainText"), value: "plaintext" },
      { label: "JSON", value: "json" },
      { label: "YAML", value: "yaml" },
      { label: "HTML", value: "html" },
      { label: "XML", value: "xml" },
      { label: "Markdown", value: "markdown" },
      { label: "JavaScript", value: "javascript" },
      { label: "TypeScript", value: "typescript" },
      { label: "CSS", value: "css" },
      { label: "INI", value: "ini" },
      { label: "Python", value: "python" },
      { label: "Go", value: "go" },
      { label: "C", value: "c" },
      { label: "C++", value: "cpp" },
      { label: "Java", value: "java" },
      { label: "Rust", value: "rust" },
      { label: "Shell", value: "shell" },
      { label: "SQL", value: "sql" }
    ] satisfies Array<{ label: string; value: string }>
);
function editorLanguage(tab: EditorTab) {
  return tab.language;
}

function languageLabel(value: string) {
  return languageItems.value.find((item) => item.value === value)?.label || value;
}

function formatError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (message === SFTP_REQUEST_TIMEOUT_ERROR) return t("koko.sftpEditor.requestTimeout");
  return sftpOperationErrorMessage(cause, t);
}

const treeLookup = { get: () => ({}) as Record<string, TreeNode> };
const revealLookup = { run: (_path: string) => undefined as void };
const loadTabLookup = {
  run: async (_tab: EditorTab, _forceLarge?: boolean, _draft?: SftpEditorDraft): Promise<void> => {}
};
const persistDraftsLookup = { run: () => undefined as void };
const {
  tabs,
  activePane,
  paneActivePaths,
  activePath,
  activeTab,
  splitOpen,
  splitRatio,
  editorGroups,
  resizingSplit,
  tabContextMenuVisible,
  tabContextMenuPosition,
  tabCloseDialogOpen,
  tabCloseTargets,
  tabCloseSubmitting,
  tabCloseDirtyCount,
  draggedEditorItem,
  editorDropPane,
  recentlyClosed,
  navigationHistory,
  dirtyTabs,
  savingTabs,
  tabContextMenuItems,
  editorHistoryMenuItems,
  paneTabs,
  paneActiveTab,
  subTabsForPane,
  createEditorTab,
  revokePreview,
  closeTabsNow,
  closeTabNow,
  closeTab,
  forgetPaths,
  focusPane,
  pinTab,
  reorderTabs,
  splitEditor,
  closeSplitEditor,
  openFileInPane,
  reopenLastClosed,
  navigateEditorHistory,
  beginTabDrag,
  beginTreeDrag,
  endEditorDrag,
  updateEditorDropTarget,
  leaveEditorDropTarget,
  dropEditorItem,
  openTabContextMenu,
  hideTabContextMenu,
  beginSplitResize
} = useSftpIdeTabs({
  getTree: () => treeLookup.get(),
  onLoadTab: (tab, forceLarge, draft) => loadTabLookup.run(tab, forceLarge, draft),
  onRevealActiveFile: (path) => revealLookup.run(path),
  onRemoveDraft: (path) => void drafts.remove(path),
  onRequestUnsavedClose(tab) {
    alertTarget.value = { kind: "unsaved-close", tab };
    alertDialogOpen.value = true;
  }
});

const {
  tree,
  expanded,
  explorerRootPath,
  selectedDirectory,
  pendingName,
  pendingError,
  pendingSubmitting,
  contextMenuVisible,
  contextMenuPosition,
  explorerWidth,
  isNarrowScreen,
  explorerOpen,
  responsiveExplorerWidth,
  resizingExplorer,
  treeFocusedPath,
  treeRows,
  renameDialogOpen,
  renameValue,
  renameError,
  renameSubmitting,
  renameDisabled,
  contextMenuItems,
  loadDirectory,
  revealActiveFile,
  toggleDirectory,
  handleTreeKeydown,
  confirmPendingCreate,
  cancelCreate,
  commitCreate,
  refreshTree,
  openContextMenu,
  hideContextMenu,
  submitRename,
  removeEntry,
  uploadFiles,
  beginExplorerResize
} = useSftpIdeTree({
  manager,
  fileEditorSupported,
  rootPath,
  activePath,
  explorerRef,
  editorLayout,
  formatError,
  onOpenEntry: (entry, path) => void openEntry(entry, path),
  onPinTab: pinTab,
  onCreatedFile(entry, path) {
    const tab = createEditorTab(entry, path);
    tab.kind = "text";
    tab.loading = false;
    tab.loadStarted = true;
    tabs.value.push(tab);
    focusPane(tab.pane, path);
  },
  onOpenToSide(entry, path) {
    const pane: EditorPane = activePane.value === "left" ? "right" : "left";
    void openFileInPane(entry, path, pane, true);
  },
  onRenamed({ from, to, name }) {
    const renamedDraftPaths = tabs.value.filter((tab) => pathHasPrefix(tab.path, from)).map((tab) => tab.path);
    tabs.value.forEach((tab) => {
      if (!pathHasPrefix(tab.path, from)) return;
      tab.path = rewritePathPrefix(tab.path, from, to);
      if (tab.path === to) {
        tab.entry.name = name;
        updateDetectedLanguage(tab, tab.content);
      }
    });
    for (const pane of ["left", "right"] satisfies EditorPane[]) {
      paneActivePaths[pane] = rewritePathPrefix(paneActivePaths[pane], from, to);
    }
    navigationHistory.value = navigationHistory.value.map((location) => ({
      ...location,
      path: rewritePathPrefix(location.path, from, to),
      entry: location.path === from ? { ...location.entry, name } : location.entry
    }));
    recentlyClosed.value = recentlyClosed.value.map((item) => ({
      ...item,
      path: rewritePathPrefix(item.path, from, to),
      entry: item.path === from ? { ...item.entry, name } : item.entry
    }));
    void Promise.all(renamedDraftPaths.map((path) => drafts.remove(path)));
    persistDraftsLookup.run();
  },
  onRequestDelete(target) {
    alertTarget.value = { kind: "delete", target };
    alertDialogOpen.value = true;
  }
});
treeLookup.get = () => tree.value;
revealLookup.run = revealActiveFile;

const { persistDirtyDrafts, restoreEditorState } = useSftpIdeWorkspace({
  manager,
  drafts,
  rootPath,
  tabs,
  activePath,
  paneActivePaths,
  activePane,
  splitOpen,
  splitRatio,
  paneTabs,
  createEditorTab,
  focusPane,
  recentlyClosed,
  tree,
  expanded,
  explorerRootPath,
  selectedDirectory,
  explorerWidth,
  loadDirectory,
  dirtyTabs
});
persistDraftsLookup.run = persistDirtyDrafts;

const {
  saveConflict,
  conflictSubmitting,
  saveAllRunning,
  localChangesOpen,
  localChangeTab,
  workspaceCloseDialogOpen,
  conflictComparison,
  localChangeComparison,
  localChangeStats,
  loadTab,
  save,
  saveAll,
  triggerSaveAll,
  saveAndCloseTab,
  saveAndCloseTabs,
  discardAndCloseTabs,
  overwriteConflict,
  reloadConflict,
  compareRemote,
  reloadRemote,
  openLargeFile,
  requestClose,
  resolveWorkspaceClose,
  saveAllAndClose,
  discardAllAndClose,
  openLocalChanges,
  saveLocalChangeFromDialog,
  tabChangeStats
} = useSftpIdeSave({
  manager,
  fileEditorSupported,
  fileEditorCapability,
  formatError,
  drafts,
  persistDirtyDrafts,
  tabs,
  activeTab,
  activePath,
  closeTabNow,
  closeTabsNow,
  revokePreview,
  tabCloseSubmitting,
  tabCloseTargets,
  tabCloseDialogOpen,
  alertTarget,
  alertDialogOpen,
  alertSubmitting,
  tree,
  dirtyTabs,
  savingTabs
});
loadTabLookup.run = loadTab;

function quickOpenScore(path: string, query: string) {
  if (!query) return 0;
  const normalizedPath = path.toLowerCase();
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  if (name === query) return 0;
  if (name.startsWith(query)) return 10 + name.length - query.length;
  const nameIndex = name.indexOf(query);
  if (nameIndex >= 0) return 30 + nameIndex;
  const pathIndex = normalizedPath.indexOf(query);
  if (pathIndex >= 0) return 60 + pathIndex;

  let queryIndex = 0;
  let gaps = 0;
  let lastMatch = -1;
  for (let index = 0; index < normalizedPath.length && queryIndex < query.length; index++) {
    if (normalizedPath[index] !== query[queryIndex]) continue;
    if (lastMatch >= 0) gaps += index - lastMatch - 1;
    lastMatch = index;
    queryIndex++;
  }
  return queryIndex === query.length ? 100 + gaps : Number.POSITIVE_INFINITY;
}

const quickOpenItems = computed<QuickOpenItem[]>(() => {
  const entries = new Map<string, SftpFileEntry>();
  for (const tab of tabs.value) entries.set(tab.path, tab.entry);
  for (const [parent, node] of Object.entries(tree.value)) {
    for (const entry of node.entries) {
      if (!entry.is_dir && entry.name !== "..") entries.set(joinPath(parent, entry.name), entry);
    }
  }
  const query = quickOpenQuery.value.trim().toLowerCase();
  return [...entries]
    .map(([path, entry]) => ({
      entry,
      path,
      open: tabs.value.some((tab) => tab.path === path),
      score: quickOpenScore(path, query)
    }))
    .filter((item) => Number.isFinite(item.score))
    .sort(
      (left, right) =>
        left.score - right.score ||
        Number(right.open) - Number(left.open) ||
        left.entry.name.localeCompare(right.entry.name)
    )
    .slice(0, 100)
    .map(({ entry, path, open }) => ({ entry, path, open }));
});

function openQuickOpen() {
  quickOpenQuery.value = "";
  quickOpenIndex.value = 0;
  quickOpenVisible.value = true;
}

function moveQuickOpenSelection(offset: number) {
  const count = quickOpenItems.value.length;
  if (!count) return;
  quickOpenIndex.value = (quickOpenIndex.value + offset + count) % count;
  void nextTick(() => {
    explorerRef.value?.scrollQuickOpenActive();
  });
}

function openQuickOpenItem(item: QuickOpenItem | undefined) {
  if (!item) return;
  quickOpenVisible.value = false;
  void openFileInPane(item.entry, item.path, activePane.value, false, true);
}

async function confirmAlert() {
  const target = alertTarget.value;
  if (!target || alertSubmitting.value) return;
  if (target.kind === "unsaved-close") {
    closeTabNow(target.tab);
    alertDialogOpen.value = false;
    return;
  }
  if (!fileEditorSupported.value) return;
  alertSubmitting.value = true;
  try {
    await manager.operations.removePath(target.target.path);
    for (const tab of tabs.value.filter((tab) => pathHasPrefix(tab.path, target.target.path))) {
      void drafts.remove(tab.path);
    }
    forgetPaths(target.target.path);
    await removeEntry(target.target.path);
    alertDialogOpen.value = false;
  } catch (cause) {
    const message = formatError(cause);
    toast.add({
      title: t("koko.actions.delete"),
      description: message,
      color: "error",
      actions: [{ label: t("koko.actions.retry"), color: "error", variant: "soft", onClick: () => void confirmAlert() }]
    });
  } finally {
    alertSubmitting.value = false;
  }
}

async function openEntry(entry: SftpFileEntry, path: string) {
  if (entry.is_dir) {
    selectedDirectory.value = path;
    toggleDirectory(path);
    return;
  }
  if (isNarrowScreen.value) explorerOpen.value = false;
  await openFileInPane(entry, path, activePane.value, false, true);
}

function updateCursor(tab: EditorTab | null, line: number, column: number) {
  if (!tab) return;
  tab.cursorLine = line;
  tab.cursorColumn = column;
}

defineExpose({ requestClose });

useEventListener(window, "keydown", (event: KeyboardEvent) => {
  if (!fileEditorSupported.value) return;
  const modifier = event.metaKey || event.ctrlKey;
  if (event.altKey && !modifier && (event.key === KeyboardKey.ArrowLeft || event.key === KeyboardKey.ArrowRight)) {
    event.preventDefault();
    void navigateEditorHistory(event.key === KeyboardKey.ArrowLeft ? -1 : 1);
    return;
  }
  if (modifier && event.shiftKey && event.key.toLowerCase() === KeyboardKey.T) {
    event.preventDefault();
    void reopenLastClosed();
    return;
  }
  if (modifier && !event.shiftKey && event.key.toLowerCase() === KeyboardKey.P) {
    event.preventDefault();
    openQuickOpen();
    return;
  }
  if (modifier && !event.shiftKey && event.key === KeyboardKey.Backslash && activeTab.value) {
    event.preventDefault();
    splitEditor(activeTab.value);
    return;
  }
  if (
    modifier &&
    !event.shiftKey &&
    !event.altKey &&
    (event.key === KeyboardKey.Digit1 || event.key === KeyboardKey.Digit2)
  ) {
    event.preventDefault();
    const pane: EditorPane = event.key === KeyboardKey.Digit1 ? "left" : "right";
    if (pane === "right" && !splitOpen.value && activeTab.value) splitEditor(activeTab.value);
    else focusPane(pane);
    return;
  }
  if (modifier && event.key.toLowerCase() === KeyboardKey.S && activeTab.value) {
    event.preventDefault();
    if (event.shiftKey) void saveAll();
    else void save();
    return;
  }
  if (modifier && !event.shiftKey && event.key.toLowerCase() === KeyboardKey.W && activeTab.value) {
    event.preventDefault();
    closeTab(activeTab.value);
    return;
  }
  const activePaneTabs = paneTabs(activePane.value);
  if (event.ctrlKey && event.key === KeyboardKey.Tab && activePaneTabs.length > 1) {
    event.preventDefault();
    const index = activePaneTabs.findIndex((tab) => tab.path === activePath.value);
    const offset = event.shiftKey ? -1 : 1;
    focusPane(
      activePane.value,
      activePaneTabs[(index + offset + activePaneTabs.length) % activePaneTabs.length]?.path || activePath.value
    );
  }
});
watch(quickOpenQuery, () => {
  quickOpenIndex.value = 0;
});
watch(quickOpenVisible, (visible) => {
  if (!visible) return;
  quickOpenQuery.value = "";
  quickOpenIndex.value = 0;
});
watch(quickOpenItems, (items) => {
  quickOpenIndex.value = Math.min(quickOpenIndex.value, Math.max(0, items.length - 1));
});
watch(
  [manager.currentPath, manager.entries],
  ([path, entries]) => {
    if (!path) return;
    if (!rootPath.value) {
      rootPath.value = path as string;
      explorerRootPath.value = path as string;
      selectedDirectory.value = path as string;
      expanded.value = new Set([path as string]);
      void restoreEditorState();
    }
    if (path === rootPath.value) {
      tree.value = {
        ...tree.value,
        [path as string]: {
          entries: sortSftpEntries(entries as SftpFileEntry[]),
          loading: false,
          error: "",
          updatedAt: Date.now()
        }
      };
    }
  },
  { immediate: true, deep: true }
);
onUnmounted(() => {
  tabs.value.forEach(revokePreview);
});
</script>

<template>
  <div
    v-if="manager.error.value && !manager.capabilitiesKnown.value"
    class="grid h-full min-h-0 place-items-center bg-(--app-main-bg) p-6"
  >
    <div class="flex max-w-md flex-col items-center gap-3 text-center">
      <UIcon name="i-lucide-wifi-off" class="size-7 text-warning" />
      <p class="text-xs leading-5 text-muted">{{ manager.error.value }}</p>
    </div>
  </div>
  <div
    v-else-if="!manager.capabilitiesKnown.value"
    class="grid h-full min-h-0 place-items-center bg-(--app-main-bg) p-6"
  >
    <div class="flex flex-col items-center gap-2 text-center text-sm text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
      <span>{{ t("koko.sftpEditor.checkingCapabilities") }}</span>
    </div>
  </div>
  <div v-else-if="!fileEditorSupported" class="grid h-full min-h-0 place-items-center bg-(--app-main-bg) p-6">
    <div class="flex max-w-md flex-col items-center gap-2 text-center">
      <UIcon name="i-lucide-file-lock-2" class="size-7 text-muted" />
      <h3 class="text-sm font-medium text-highlighted">{{ t("koko.sftpEditor.capabilityUnavailableTitle") }}</h3>
      <p class="text-xs leading-5 text-muted">{{ fileEditorUnavailableDescription }}</p>
    </div>
  </div>
  <div
    v-else
    ref="editorLayout"
    class="relative grid h-full min-h-0 bg-(--app-main-bg) text-(--app-fg)"
    :class="resizingExplorer || resizingSplit ? 'cursor-col-resize select-none' : ''"
    :style="{ gridTemplateColumns: isNarrowScreen ? 'minmax(0, 1fr)' : responsiveExplorerWidth }"
  >
    <SftpIdeExplorer
      ref="explorer"
      v-model:explorer-open="explorerOpen"
      v-model:explorer-width="explorerWidth"
      v-model:pending-name="pendingName"
      v-model:tree-focused-path="treeFocusedPath"
      v-model:context-menu-visible="contextMenuVisible"
      v-model:quick-open-visible="quickOpenVisible"
      v-model:quick-open-query="quickOpenQuery"
      v-model:quick-open-index="quickOpenIndex"
      :manager="manager"
      :is-narrow-screen="isNarrowScreen"
      :responsive-explorer-width="responsiveExplorerWidth"
      :resizing-explorer="resizingExplorer"
      :root-path="rootPath"
      :explorer-root-path="explorerRootPath"
      :selected-directory="selectedDirectory"
      :active-path="activePath"
      :tree="tree"
      :tree-rows="treeRows"
      :expanded="expanded"
      :pending-error="pendingError"
      :pending-submitting="pendingSubmitting"
      :context-menu-items="contextMenuItems"
      :context-menu-position="contextMenuPosition"
      :quick-open-items="quickOpenItems"
      @refresh-tree="refreshTree"
      @open-entry="openEntry"
      @pin-tab="pinTab"
      @tree-keydown="handleTreeKeydown"
      @open-context-menu="openContextMenu"
      @tree-drag-start="beginTreeDrag"
      @tree-drag-end="endEditorDrag"
      @confirm-create="confirmPendingCreate"
      @cancel-create="cancelCreate"
      @commit-create="commitCreate"
      @retry-directory="(path) => loadDirectory(path, true)"
      @begin-resize="beginExplorerResize"
      @upload-change="uploadFiles"
      @move-quick-open="moveQuickOpenSelection"
      @open-quick-open-item="openQuickOpenItem"
      @hide-context-menu="hideContextMenu"
    />

    <button
      v-if="isNarrowScreen && explorerOpen"
      type="button"
      class="absolute inset-0 z-30 bg-black/35 backdrop-blur-[1px]"
      :aria-label="t('koko.actions.close')"
      @click="explorerOpen = false"
    />

    <section class="flex min-h-0 min-w-0 flex-col">
      <div class="flex h-(--workspace-toolbar-height) shrink-0 items-center border-b border-default px-2 md:hidden">
        <UButton
          icon="i-lucide-panel-left"
          :label="t('koko.sftpEditor.explorerTitle')"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-expanded="explorerOpen"
          @click="void (explorerOpen = true)"
        />
      </div>
      <div
        v-if="manager.error.value"
        class="flex min-h-9 shrink-0 items-center gap-2 border-b border-warning/30 bg-warning/10 px-3 text-xs"
      >
        <UIcon name="i-lucide-wifi-off" class="size-4 shrink-0 text-warning" />
        <span class="min-w-0 flex-1 truncate">{{ manager.error.value }}</span>
      </div>
      <UDropdownMenu
        :open="tabContextMenuVisible"
        :items="tabContextMenuItems"
        size="sm"
        :content="{ align: 'start', side: 'bottom' }"
        @update:open="
          (open) => {
            if (!open) hideTabContextMenu();
            else tabContextMenuVisible = open;
          }
        "
      >
        <div
          class="pointer-events-none fixed size-px"
          :style="{ left: `${tabContextMenuPosition.x}px`, top: `${tabContextMenuPosition.y}px` }"
        />
      </UDropdownMenu>
      <div
        ref="editorGroups"
        class="relative grid min-h-0 flex-1 overflow-hidden bg-(--app-main-bg)"
        :style="{
          gridTemplateColumns: splitOpen ? `${splitRatio}fr ${100 - splitRatio}fr` : 'minmax(0, 1fr)'
        }"
        @dragover="updateEditorDropTarget"
        @dragleave="leaveEditorDropTarget"
        @drop="dropEditorItem"
      >
        <template v-for="tab in tabs" :key="tab.path">
          <section
            v-show="paneActivePaths[tab.pane] === tab.path && (tab.pane === 'left' || splitOpen)"
            class="flex min-h-0 min-w-0 flex-col overflow-hidden bg-(--app-main-bg)"
            :class="[
              tab.pane === 'right' ? 'border-l border-(--workspace-surface-sub-border)' : '',
              splitOpen && activePane === tab.pane ? 'shadow-[inset_0_2px_0_var(--ui-primary)]' : ''
            ]"
            :style="{ gridColumn: tab.pane === 'left' ? 1 : 2, gridRow: 1 }"
            @pointerdown.capture="focusPane(tab.pane, tab.path)"
          >
            <WorkspaceSubTabStrip
              :tabs="subTabsForPane(tab.pane)"
              :active-id="paneActivePaths[tab.pane]"
              :dragged-id="draggedEditorItem?.source === 'tab' ? draggedEditorItem.path : ''"
              :close-label="t('koko.actions.close')"
              reorderable
              context-menu
              @select="focusPane(tab.pane, $event)"
              @pin="pinTab"
              @reorder="reorderTabs"
              @contextmenu="openTabContextMenu"
              @dragstart="beginTabDrag"
              @dragend="endEditorDrag"
              @close="
                (id) => {
                  const target = tabs.find((item) => item.path === id);
                  if (target) closeTab(target);
                }
              "
            >
              <template #trailing>
                <UDropdownMenu :items="editorHistoryMenuItems" size="sm">
                  <UButton
                    icon="i-lucide-history"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :title="t('koko.sftpEditor.editorHistory')"
                  />
                </UDropdownMenu>
                <template v-if="tab.kind === 'text'">
                  <UTooltip v-if="dirty(tab)" :text="t('koko.sftpEditor.viewChanges')" :delay-duration="150">
                    <UButton
                      icon="i-lucide-git-compare-arrows"
                      size="xs"
                      color="warning"
                      variant="soft"
                      @click="openLocalChanges(tab)"
                    >
                      <span class="font-ui-mono tabular-nums">
                        +{{ tabChangeStats(tab).added }} −{{ tabChangeStats(tab).removed }}
                      </span>
                    </UButton>
                  </UTooltip>
                  <UTooltip
                    :text="
                      tab.lineWrapping ? t('koko.sftpEditor.disableWordWrap') : t('koko.sftpEditor.enableWordWrap')
                    "
                    :delay-duration="150"
                  >
                    <UButton
                      icon="i-lucide-wrap-text"
                      size="xs"
                      :color="tab.lineWrapping ? 'primary' : 'neutral'"
                      :variant="tab.lineWrapping ? 'soft' : 'ghost'"
                      :aria-pressed="tab.lineWrapping"
                      @click="void (tab.lineWrapping = !tab.lineWrapping)"
                    />
                  </UTooltip>
                  <UTooltip v-if="dirty(tab) || tab.saving" :text="t('koko.actions.save')" :delay-duration="150">
                    <UButton
                      icon="i-lucide-save"
                      size="xs"
                      color="primary"
                      variant="soft"
                      :loading="tab.saving"
                      @click="void save(tab)"
                    />
                  </UTooltip>
                  <UTooltip
                    v-if="dirtyTabs.length > 1"
                    :text="t('koko.sftpEditor.saveAllShortcut')"
                    :delay-duration="150"
                  >
                    <UButton
                      icon="i-lucide-layers-2"
                      size="xs"
                      color="neutral"
                      variant="soft"
                      :loading="saveAllRunning"
                      @click="triggerSaveAll"
                    />
                  </UTooltip>
                </template>
                <UTooltip
                  :text="
                    tab.pane === 'left' ? t('koko.sftpEditor.splitEditorRight') : t('koko.sftpEditor.closeRightEditor')
                  "
                  :delay-duration="150"
                >
                  <UButton
                    :icon="tab.pane === 'left' ? 'i-lucide-columns-2' : 'i-lucide-panel-right-close'"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    @click="tab.pane === 'left' ? splitEditor(tab) : closeSplitEditor()"
                  />
                </UTooltip>
              </template>
            </WorkspaceSubTabStrip>
            <div class="relative flex min-h-0 flex-1">
              <div v-if="tab.loading" class="absolute inset-0 z-10 grid place-items-center bg-(--app-main-bg)">
                <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
              </div>
              <div v-if="tab.kind === 'text'" class="flex min-h-0 min-w-0 flex-1 flex-col bg-(--app-main-bg)">
                <div
                  v-if="tab.externalChanged"
                  class="flex min-h-9 shrink-0 items-center gap-2 border-b border-warning/30 bg-warning/10 px-3 text-xs"
                >
                  <UIcon name="i-lucide-file-warning" class="size-4 shrink-0 text-warning" />
                  <span class="min-w-0 flex-1">
                    {{ t("koko.sftpEditor.remoteChangedWhileEditing") }}
                  </span>
                  <UButton size="xs" color="neutral" variant="ghost" @click="compareRemote(tab)">
                    {{ t("koko.sftpEditor.compareChanges") }}
                  </UButton>
                  <UButton
                    v-if="!dirty(tab)"
                    size="xs"
                    color="warning"
                    variant="soft"
                    icon="i-lucide-refresh-cw"
                    @click="reloadRemote(tab)"
                  >
                    {{ t("koko.sftpEditor.reloadRemote") }}
                  </UButton>
                </div>
                <div
                  v-if="tab.draftRestored"
                  class="flex min-h-8 shrink-0 items-center gap-2 border-b border-info/30 bg-info/10 px-3 text-xs"
                >
                  <UIcon name="i-lucide-history" class="size-3.5 shrink-0 text-info" />
                  <span class="min-w-0 flex-1">{{ t("koko.sftpEditor.draftRestored") }}</span>
                  <UButton
                    icon="i-lucide-x"
                    size="xs"
                    color="info"
                    variant="ghost"
                    :title="t('koko.actions.close')"
                    @click="void (tab.draftRestored = false)"
                  />
                </div>
                <div
                  v-if="tab.contentLanguageMismatch"
                  class="flex min-h-8 shrink-0 items-center gap-2 border-b border-info/30 bg-info/10 px-3 text-xs"
                >
                  <UIcon name="i-lucide-scan-search" class="size-3.5 shrink-0 text-info" />
                  <span class="min-w-0 flex-1">
                    {{
                      t("koko.sftpEditor.contentTypeMismatch", {
                        extension: fileExtension(tab.entry.name).toUpperCase(),
                        detected: languageLabel(tab.language)
                      })
                    }}
                  </span>
                  <UButton
                    size="xs"
                    color="info"
                    variant="ghost"
                    @click="
                      tab.language = tab.expectedLanguage;
                      void (tab.contentLanguageMismatch = false);
                    "
                  >
                    {{ t("koko.sftpEditor.useExtensionLanguage") }}
                  </UButton>
                </div>
                <div
                  v-if="tab.error"
                  class="flex min-h-8 shrink-0 items-center gap-2 border-b border-error/30 bg-error/10 px-3 text-xs text-error"
                >
                  <UIcon name="i-lucide-circle-alert" class="size-3.5 shrink-0" />
                  <span class="min-w-0 flex-1 truncate">{{ tab.error }}</span>
                  <UButton
                    icon="i-lucide-x"
                    size="xs"
                    color="error"
                    variant="ghost"
                    :title="t('koko.actions.close')"
                    @click="void (tab.error = '')"
                  />
                </div>
                <div class="min-h-0 flex-1">
                  <CodeMirrorEditor
                    v-model="tab.content"
                    :active="activePane === tab.pane && paneActivePaths[tab.pane] === tab.path"
                    :baseline="tab.savedContent"
                    :language="editorLanguage(tab)"
                    :line-wrapping="tab.lineWrapping"
                    :path="tab.path"
                    @cursor="(line, column) => updateCursor(tab, line, column)"
                    @save="void save(tab)"
                  />
                </div>
              </div>
              <div
                v-else-if="!tab.loading && tab.kind === 'image'"
                class="grid min-h-0 flex-1 place-items-center overflow-auto bg-checkered p-6"
              >
                <img :src="tab.previewUrl" :alt="tab.entry.name" class="max-h-full max-w-full object-contain" />
              </div>
              <div
                v-else-if="!tab.loading"
                class="grid min-h-0 flex-1 place-items-center bg-(--app-main-bg) p-6 text-center text-sm text-(--app-muted)"
              >
                <div class="flex flex-col items-center gap-3">
                  <UIcon :name="tab.error ? 'i-lucide-circle-alert' : 'i-lucide-file-warning'" class="size-10" />
                  <span>{{ tab.error || t("koko.sftpEditor.unsupportedPreview") }}</span>
                  <UButton
                    v-if="tab.largeBlocked"
                    size="xs"
                    color="neutral"
                    variant="soft"
                    icon="i-lucide-file-warning"
                    @click="openLargeFile(tab)"
                  >
                    {{ t("koko.sftpEditor.openAnyway") }}
                  </UButton>
                </div>
              </div>
            </div>
            <footer
              class="flex h-7 shrink-0 items-center justify-between gap-2 overflow-hidden border-t border-(--workspace-surface-sub-border) bg-(--workspace-surface-sub-header) px-2 text-[10px] text-(--app-muted)"
            >
              <span class="min-w-0 flex-1 truncate">{{ tab.path }}</span>
              <div v-if="tab.kind === 'text'" class="flex min-w-0 shrink items-center gap-1 overflow-x-auto">
                <button
                  v-if="dirty(tab)"
                  type="button"
                  class="flex shrink-0 items-center gap-1 font-ui-mono text-warning hover:underline"
                  @click="openLocalChanges(tab)"
                >
                  <UIcon name="i-lucide-git-compare-arrows" class="size-3" />
                  +{{ tabChangeStats(tab).added }} −{{ tabChangeStats(tab).removed }}
                </button>
                <span class="shrink-0">
                  {{
                    t("koko.sftpEditor.cursorPosition", {
                      line: tab.cursorLine,
                      column: tab.cursorColumn
                    })
                  }}
                </span>
                <USelect
                  v-model="tab.language"
                  :items="languageItems"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  value-key="value"
                  class="w-28 shrink-0"
                  :aria-label="t('koko.sftpEditor.languageMode')"
                  @update:model-value="tab.contentLanguageMismatch = false"
                />
                <USelect
                  v-model="tab.lineEnding"
                  :items="lineEndingItems"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  value-key="value"
                  class="w-18 shrink-0"
                  :aria-label="t('koko.sftpEditor.lineEnding')"
                />
                <USelect
                  v-model="tab.encoding"
                  :items="encodingItems"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  value-key="value"
                  class="w-36 shrink-0"
                  :aria-label="t('koko.sftpEditor.encoding')"
                />
              </div>
              <span v-else class="shrink-0">SFTP</span>
            </footer>
          </section>
        </template>
        <div
          v-if="!paneActiveTab('left')"
          class="grid min-h-0 place-items-center bg-(--app-main-bg) p-6 text-sm text-(--app-muted)"
          :style="{ gridColumn: 1, gridRow: 1 }"
          @click="focusPane('left')"
        >
          <span class="flex flex-col items-center gap-3">
            <UIcon :name="tabs.length ? 'i-lucide-panel-left' : 'i-lucide-file-code-2'" class="size-10" />
            <span>{{ tabs.length ? t("koko.sftpEditor.selectFileForPane") : t("koko.sftpEditor.editorEmpty") }}</span>
            <span class="text-center text-[10px] text-(--app-muted)">
              {{ t("koko.sftpEditor.editorEmptyHint") }}
            </span>
            <UButton
              v-if="!tabs.length && recentlyClosed.length"
              size="xs"
              color="neutral"
              variant="soft"
              icon="i-lucide-rotate-ccw"
              @click.stop="reopenLastClosed"
            >
              {{ t("koko.sftpEditor.reopenClosedEditor") }}
            </UButton>
          </span>
        </div>
        <div
          v-if="splitOpen && !paneActiveTab('right')"
          class="relative grid min-h-0 place-items-center border-l border-(--workspace-surface-sub-border) bg-(--app-main-bg) p-6 text-sm text-(--app-muted)"
          :class="activePane === 'right' ? 'shadow-[inset_0_2px_0_var(--ui-primary)]' : ''"
          :style="{ gridColumn: 2, gridRow: 1 }"
          @click="focusPane('right')"
        >
          <UButton
            icon="i-lucide-panel-right-close"
            size="xs"
            color="neutral"
            variant="ghost"
            class="absolute right-2 top-2"
            :title="t('koko.sftpEditor.closeRightEditor')"
            @click.stop="closeSplitEditor"
          />
          <span class="flex flex-col items-center gap-3">
            <UIcon name="i-lucide-panel-right" class="size-10" />
            {{ t("koko.sftpEditor.selectFileForPane") }}
          </span>
        </div>
        <div
          v-if="draggedEditorItem && editorDropPane"
          class="pointer-events-none absolute inset-y-2 z-40 grid place-items-center rounded-lg border-2 border-dashed border-primary bg-primary/10 text-primary shadow-lg backdrop-blur-[1px] transition-[left,right]"
          :style="
            editorDropPane === 'left'
              ? {
                  left: '8px',
                  right: splitOpen ? `calc(${100 - splitRatio}% + 4px)` : '32%'
                }
              : {
                  left: splitOpen ? `calc(${splitRatio}% + 4px)` : '68%',
                  right: '8px'
                }
          "
        >
          <span
            class="flex flex-col items-center gap-2 rounded-md bg-(--workspace-surface-sub-panel) px-4 py-3 text-xs shadow-sm"
          >
            <UIcon
              :name="editorDropPane === 'right' && !splitOpen ? 'i-lucide-columns-2' : 'i-lucide-file-input'"
              class="size-6"
            />
            {{
              editorDropPane === "left"
                ? t("koko.sftpEditor.dropToLeftEditor")
                : splitOpen
                  ? t("koko.sftpEditor.dropToRightEditor")
                  : t("koko.sftpEditor.dropToSplitRight")
            }}
          </span>
        </div>
        <div
          v-if="splitOpen"
          class="absolute inset-y-0 z-30 w-2 -translate-x-1/2 cursor-col-resize"
          :style="{ left: `${splitRatio}%` }"
          :title="t('koko.sftpEditor.resizeEditorGroups')"
          @pointerdown="beginSplitResize"
          @dblclick="splitRatio = 50"
        >
          <div
            class="mx-auto h-full w-px transition-colors"
            :class="resizingSplit ? 'bg-primary' : 'bg-transparent hover:bg-primary/70'"
          />
        </div>
      </div>
    </section>
  </div>
  <SftpIdeDialogs
    v-model:rename-open="renameDialogOpen"
    v-model:rename-value="renameValue"
    v-model:alert-open="alertDialogOpen"
    v-model:tab-close-open="tabCloseDialogOpen"
    v-model:local-changes-open="localChangesOpen"
    v-model:workspace-close-open="workspaceCloseDialogOpen"
    :rename-error="renameError"
    :rename-loading="renameSubmitting"
    :rename-disabled="renameDisabled"
    :alert-target="alertTarget"
    :alert-title="alertTitle"
    :alert-description="alertDescription"
    :alert-submitting="alertSubmitting"
    :tab-close-count="tabCloseTargets.length"
    :tab-close-dirty-count="tabCloseDirtyCount"
    :tab-close-submitting="tabCloseSubmitting"
    :local-change-tab="localChangeTab"
    :local-change-comparison="localChangeComparison"
    :local-change-stats="localChangeStats"
    :save-conflict="saveConflict"
    :conflict-comparison="conflictComparison"
    :conflict-submitting="conflictSubmitting"
    :dirty-tab-count="dirtyTabs.length"
    :save-all-running="saveAllRunning"
    @rename-confirm="submitRename"
    @alert-confirm="confirmAlert"
    @save-and-close-tab="saveAndCloseTab"
    @save-and-close-tabs="saveAndCloseTabs"
    @discard-and-close-tabs="discardAndCloseTabs"
    @clear-tab-close-targets="tabCloseTargets = []"
    @save-local-change="saveLocalChangeFromDialog"
    @close-conflict="saveConflict = null"
    @reload-conflict="reloadConflict"
    @overwrite-conflict="overwriteConflict"
    @resolve-workspace-close="resolveWorkspaceClose"
    @save-all-and-close="saveAllAndClose"
    @discard-all-and-close="discardAllAndClose"
  />
</template>
