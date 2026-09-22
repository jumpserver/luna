import type { ComputedRef, Ref } from "vue";
import type { SftpEditorDraft } from "#koko/composables/sftp/useSftpEditorDrafts";
import type { SftpFileEntry } from "#koko/composables/sftp/useSftpFileManager";
import type { AlertTarget, EditorTab, LineEnding, SaveConflict, TextEncoding, TreeNode } from "./sftpIdeShared";
import { sortSftpEntries } from "#koko/composables/sftp/useSftpFileManager";
import { SftpFileConflictError } from "#koko/composables/sftp/useSftpOperations";
import {
  changedLineCounts,
  comparisonWindow,
  contentVersion,
  decodeText,
  isDirtyTab as dirty,
  encodeText,
  fileVersion,
  formatFileSize,
  IMAGE_EXTENSIONS,
  metadataVersion,
  parentPath,
  parseFileSize,
  TEXT_EXTENSIONS,
  updateDetectedLanguage
} from "./sftpIdeShared";

const defaultMaxEditorBytes = 10 * 1024 * 1024;

interface UseSftpIdeSaveOptions {
  manager: {
    operations: {
      listDirectory: (path: string, options?: { background?: boolean }) => Promise<SftpFileEntry[]>;
      readFile: (entry: SftpFileEntry, path: string) => Promise<Blob>;
      saveFile: (
        path: string,
        bytes: Uint8Array,
        options: { expectedVersion?: string; force?: boolean }
      ) => Promise<SftpFileEntry>;
    };
  };
  fileEditorSupported: Ref<boolean>;
  fileEditorCapability: ComputedRef<{ save?: { max_bytes?: number } } | null>;
  formatError: (cause: unknown) => string;
  drafts: {
    remove: (path: string) => Promise<unknown>;
  };
  persistDirtyDrafts: () => void;
  tabs: Ref<EditorTab[]>;
  activeTab: ComputedRef<EditorTab | null>;
  activePath: { value: string };
  closeTabNow: (tab: EditorTab) => void;
  closeTabsNow: (tabs: EditorTab[], remember?: boolean) => void;
  revokePreview: (tab: EditorTab) => void;
  tabCloseSubmitting: Ref<boolean>;
  tabCloseTargets: Ref<EditorTab[]>;
  tabCloseDialogOpen: Ref<boolean>;
  alertTarget: Ref<AlertTarget | null>;
  alertDialogOpen: Ref<boolean>;
  alertSubmitting: Ref<boolean>;
  tree: Ref<Record<string, TreeNode>>;
  dirtyTabs: ComputedRef<EditorTab[]>;
  savingTabs: ComputedRef<EditorTab[]>;
}

export function useSftpIdeSave(options: UseSftpIdeSaveOptions) {
  const { t } = useI18n();
  const toast = useToast();
  const saveConflict = ref<SaveConflict | null>(null);
  const conflictSubmitting = ref(false);
  const saveAllRunning = ref(false);
  const remoteCheckInProgress = ref(false);
  const localChangesOpen = ref(false);
  const localChangeTab = ref<EditorTab | null>(null);
  const workspaceCloseDialogOpen = ref(false);
  let workspaceCloseResolver: ((confirmed: boolean) => void) | null = null;
  let workspaceClosePromise: Promise<boolean> | null = null;
  const maxEditorBytes = computed(() =>
    Math.min(defaultMaxEditorBytes, options.fileEditorCapability.value?.save?.max_bytes || defaultMaxEditorBytes)
  );
  const conflictComparison = computed(() => {
    const conflict = saveConflict.value;
    return conflict ? comparisonWindow(conflict.tab.content, conflict.remoteContent) : null;
  });
  const localChangeComparison = computed(() => {
    const tab = localChangeTab.value;
    return tab ? comparisonWindow(tab.savedContent, tab.content) : null;
  });
  const localChangeStats = computed(() => {
    const tab = localChangeTab.value;
    return tab ? changedLineCounts(tab.savedContent, tab.content) : { added: 0, removed: 0 };
  });

  watch(options.fileEditorSupported, (supported) => {
    if (supported) return;
    saveConflict.value = null;
  });

  function tabChangeStats(tab: EditorTab) {
    return changedLineCounts(tab.savedContent, tab.content);
  }

  function openLocalChanges(tab = options.activeTab.value) {
    if (!tab || !dirty(tab)) return;
    localChangeTab.value = tab;
    localChangesOpen.value = true;
  }

  async function saveLocalChangeFromDialog() {
    if (localChangeTab.value && (await save(localChangeTab.value))) localChangesOpen.value = false;
  }

  function blockLargeFile(tab: EditorTab) {
    tab.kind = "unsupported";
    tab.largeBlocked = true;
    tab.error = t("koko.sftpEditor.fileTooLarge", { size: formatFileSize(String(maxEditorBytes.value)) });
  }

  async function loadTab(tab: EditorTab, forceLarge = false, draft?: SftpEditorDraft) {
    if (tab.loadStarted && tab.loading) return;
    tab.loadStarted = true;
    options.revokePreview(tab);
    tab.loading = true;
    tab.error = "";
    tab.largeBlocked = false;
    try {
      const reportedSize = parseFileSize(tab.entry.size);
      if (!forceLarge && reportedSize > maxEditorBytes.value) {
        blockLargeFile(tab);
        return;
      }

      const blob = await options.manager.operations.readFile(tab.entry, tab.path);
      if (!forceLarge && blob.size > maxEditorBytes.value) {
        // ponytail: the legacy koko download command has no stat/range phase, so an
        // unknown-size file is already transferred here. Upgrade to ranged reads when
        // the server exposes metadata before content.
        blockLargeFile(tab);
        return;
      }

      const extension = tab.entry.name.split(".").pop()?.toLowerCase() || "";
      if (IMAGE_EXTENSIONS.has(extension)) {
        tab.kind = "image";
        tab.previewUrl = URL.createObjectURL(blob);
        return;
      }
      if (!TEXT_EXTENSIONS.has(extension) && blob.size >= 1024 * 1024) {
        tab.kind = "unsupported";
        return;
      }

      const buffer = await blob.arrayBuffer();
      const decoded = decodeText(buffer);
      if (decoded.content.includes("\0")) throw new Error("binary_file");
      tab.kind = "text";
      const currentVersion = (await contentVersion(buffer)) || fileVersion(tab.entry);
      tab.remoteMetadataVersion = metadataVersion(tab.entry);
      tab.externalChanged = false;
      if (draft) {
        tab.content = draft.content;
        tab.savedContent = draft.savedContent;
        tab.encoding = draft.encoding as TextEncoding;
        tab.savedEncoding = (draft.savedEncoding || decoded.encoding) as TextEncoding;
        tab.lineEnding = draft.lineEnding as LineEnding;
        tab.savedLineEnding = (draft.savedLineEnding || decoded.lineEnding) as LineEnding;
        tab.remoteVersion = draft.remoteVersion;
        tab.remoteMetadataVersion = draft.remoteMetadataVersion;
        tab.externalChanged = Boolean(draft.remoteVersion && draft.remoteVersion !== currentVersion);
        tab.draftRestored = true;
        updateDetectedLanguage(tab, draft.content);
      } else {
        tab.content = decoded.content;
        tab.savedContent = decoded.content;
        tab.encoding = decoded.encoding;
        tab.savedEncoding = decoded.encoding;
        tab.lineEnding = decoded.lineEnding;
        tab.savedLineEnding = decoded.lineEnding;
        tab.remoteVersion = currentVersion;
        tab.draftRestored = false;
        updateDetectedLanguage(tab, decoded.content);
      }
    } catch (cause) {
      if (draft) {
        tab.kind = "text";
        tab.content = draft.content;
        tab.savedContent = draft.savedContent;
        tab.encoding = draft.encoding as TextEncoding;
        tab.savedEncoding = (draft.savedEncoding || draft.encoding) as TextEncoding;
        tab.lineEnding = draft.lineEnding as LineEnding;
        tab.savedLineEnding = (draft.savedLineEnding || draft.lineEnding) as LineEnding;
        tab.remoteVersion = draft.remoteVersion;
        tab.remoteMetadataVersion = draft.remoteMetadataVersion;
        tab.externalChanged = true;
        tab.draftRestored = true;
        updateDetectedLanguage(tab, draft.content);
        tab.error = options.formatError(cause);
        return;
      }
      tab.kind = "unsupported";
      tab.error =
        cause instanceof Error && cause.message === "unsupported_text_encoding"
          ? t("koko.sftpEditor.unsupportedEncoding")
          : cause instanceof Error && cause.message === "binary_file"
            ? t("koko.sftpEditor.unsupportedPreview")
            : options.formatError(cause);
    } finally {
      tab.loading = false;
    }
  }

  async function fetchRemoteEntry(tab: EditorTab) {
    const directory = parentPath(tab.path);
    const entries = await options.manager.operations.listDirectory(directory, { background: true });
    options.tree.value = {
      ...options.tree.value,
      [directory]: { entries: sortSftpEntries(entries), loading: false, error: "", updatedAt: Date.now() }
    };
    return entries.find((entry) => entry.name === tab.entry.name) || null;
  }

  async function showSaveConflict(tab: EditorTab, remoteEntry: SftpFileEntry | null) {
    const conflict = reactive<SaveConflict>({
      tab,
      remoteEntry,
      remoteContent: "",
      loading: Boolean(remoteEntry),
      error: ""
    });
    saveConflict.value = conflict;
    if (!remoteEntry) return;
    try {
      const blob = await options.manager.operations.readFile(remoteEntry, tab.path);
      conflict.remoteContent = decodeText(await blob.arrayBuffer()).content;
    } catch (cause) {
      conflict.error = options.formatError(cause);
    } finally {
      conflict.loading = false;
    }
  }

  async function save(tab = options.activeTab.value, overwrite = false): Promise<boolean> {
    if (!options.fileEditorSupported.value) return false;
    if (!tab) return true;
    if (!dirty(tab) && !overwrite) return true;
    if (tab.saving) return false;
    const snapshot = {
      content: tab.content,
      encoding: tab.encoding,
      lineEnding: tab.lineEnding
    };
    tab.saving = true;
    tab.error = "";
    try {
      if (!overwrite && tab.remoteVersion && !tab.remoteVersion.startsWith("sha256:")) {
        const remoteEntry = await fetchRemoteEntry(tab);
        if (!remoteEntry || fileVersion(remoteEntry) !== tab.remoteVersion) {
          await showSaveConflict(tab, remoteEntry);
          return false;
        }
      }

      const bytes = encodeText(snapshot.content, snapshot.encoding, snapshot.lineEnding);
      const remoteEntry = await options.manager.operations.saveFile(tab.path, bytes, {
        expectedVersion: overwrite ? undefined : tab.remoteVersion,
        force: overwrite
      });
      tab.savedContent = snapshot.content;
      tab.savedEncoding = snapshot.encoding;
      tab.savedLineEnding = snapshot.lineEnding;
      tab.entry = remoteEntry;
      tab.remoteVersion = fileVersion(remoteEntry);
      tab.remoteMetadataVersion = metadataVersion(remoteEntry);
      tab.externalChanged = false;
      tab.draftRestored = false;
      if (dirty(tab)) void options.persistDirtyDrafts();
      else await options.drafts.remove(tab.path);
      return true;
    } catch (cause) {
      if (cause instanceof SftpFileConflictError) {
        const remoteEntry = await fetchRemoteEntry(tab).catch(() => null);
        await showSaveConflict(tab, remoteEntry);
        return false;
      }
      tab.error = options.formatError(cause);
      return false;
    } finally {
      tab.saving = false;
    }
  }

  async function saveAll() {
    if (saveAllRunning.value || options.savingTabs.value.length) return false;
    saveAllRunning.value = true;
    try {
      const pending = [...options.dirtyTabs.value];
      for (const tab of pending) {
        options.activePath.value = tab.path;
        if (!(await save(tab))) return false;
      }
      if (pending.length) {
        toast.add({
          title: t("koko.sftpEditor.savedAll", { count: pending.length }),
          color: "success"
        });
      }
      return true;
    } finally {
      saveAllRunning.value = false;
    }
  }

  function triggerSaveAll() {
    void saveAll();
  }

  async function saveAndCloseTab() {
    const target = options.alertTarget.value;
    if (target?.kind !== "unsaved-close" || options.alertSubmitting.value) return;
    options.alertSubmitting.value = true;
    try {
      if (!(await save(target.tab)) || dirty(target.tab)) return;
      options.closeTabNow(target.tab);
      options.alertDialogOpen.value = false;
    } finally {
      options.alertSubmitting.value = false;
    }
  }

  async function saveAndCloseTabs() {
    if (options.tabCloseSubmitting.value) return;
    options.tabCloseSubmitting.value = true;
    const targets = [...options.tabCloseTargets.value];
    try {
      for (const tab of targets) {
        if (!options.tabs.value.includes(tab) || !dirty(tab)) continue;
        options.activePath.value = tab.path;
        if (!(await save(tab)) || dirty(tab)) {
          options.tabCloseDialogOpen.value = false;
          options.tabCloseTargets.value = [];
          return;
        }
      }
      options.closeTabsNow(targets.filter((tab) => options.tabs.value.includes(tab)));
      options.tabCloseDialogOpen.value = false;
      options.tabCloseTargets.value = [];
    } finally {
      options.tabCloseSubmitting.value = false;
    }
  }

  function discardAndCloseTabs() {
    if (options.tabCloseSubmitting.value) return;
    options.closeTabsNow(options.tabCloseTargets.value);
    options.tabCloseTargets.value = [];
    options.tabCloseDialogOpen.value = false;
  }

  async function overwriteConflict() {
    const conflict = saveConflict.value;
    if (!conflict || conflictSubmitting.value) return;
    conflictSubmitting.value = true;
    saveConflict.value = null;
    try {
      await save(conflict.tab, true);
    } finally {
      conflictSubmitting.value = false;
    }
  }

  async function reloadConflict() {
    const conflict = saveConflict.value;
    if (!conflict || conflictSubmitting.value) return;
    conflictSubmitting.value = true;
    saveConflict.value = null;
    try {
      if (!conflict.remoteEntry) {
        conflict.tab.error = t("koko.sftpEditor.remoteFileDeleted");
        return;
      }
      await options.drafts.remove(conflict.tab.path);
      conflict.tab.entry = conflict.remoteEntry;
      conflict.tab.remoteVersion = fileVersion(conflict.remoteEntry);
      conflict.tab.remoteMetadataVersion = metadataVersion(conflict.remoteEntry);
      conflict.tab.externalChanged = false;
      await loadTab(conflict.tab);
    } finally {
      conflictSubmitting.value = false;
    }
  }

  async function compareRemote(tab = options.activeTab.value) {
    if (!tab) return;
    const remoteEntry = await fetchRemoteEntry(tab).catch(() => null);
    await showSaveConflict(tab, remoteEntry);
  }

  async function reloadRemote(tab = options.activeTab.value) {
    if (!tab) return;
    const remoteEntry = await fetchRemoteEntry(tab).catch(() => null);
    if (!remoteEntry || dirty(tab)) {
      await showSaveConflict(tab, remoteEntry);
      return;
    }
    tab.entry = remoteEntry;
    tab.remoteVersion = fileVersion(remoteEntry);
    tab.remoteMetadataVersion = metadataVersion(remoteEntry);
    tab.externalChanged = false;
    await options.drafts.remove(tab.path);
    await loadTab(tab);
  }

  async function checkActiveRemote() {
    const tab = options.activeTab.value;
    if (
      !tab ||
      tab.kind !== "text" ||
      tab.loading ||
      tab.saving ||
      remoteCheckInProgress.value ||
      document.visibilityState !== "visible"
    )
      return;
    remoteCheckInProgress.value = true;
    try {
      const remoteEntry = await fetchRemoteEntry(tab);
      if (!remoteEntry || metadataVersion(remoteEntry) !== tab.remoteMetadataVersion) {
        tab.externalChanged = true;
      }
    } catch {
      // Connection errors already surface through the manager. Polling stays quiet.
    } finally {
      remoteCheckInProgress.value = false;
    }
  }

  async function openLargeFile(tab: EditorTab) {
    await loadTab(tab, true);
  }

  function requestClose() {
    if (options.savingTabs.value.length > 0) {
      toast.add({
        title: t("koko.sftpEditor.saveInProgress"),
        color: "warning"
      });
      return Promise.resolve(false);
    }
    if (options.dirtyTabs.value.length === 0) return Promise.resolve(true);
    if (workspaceClosePromise) return workspaceClosePromise;
    workspaceCloseDialogOpen.value = true;
    workspaceClosePromise = new Promise<boolean>((resolve) => {
      workspaceCloseResolver = resolve;
    });
    return workspaceClosePromise;
  }

  function resolveWorkspaceClose(confirmed: boolean) {
    const resolve = workspaceCloseResolver;
    workspaceCloseResolver = null;
    workspaceClosePromise = null;
    workspaceCloseDialogOpen.value = false;
    resolve?.(confirmed);
  }

  async function saveAllAndClose() {
    workspaceCloseDialogOpen.value = false;
    const saved = await saveAll();
    resolveWorkspaceClose(saved && options.dirtyTabs.value.length === 0);
  }

  async function discardAllAndClose() {
    await Promise.all(options.dirtyTabs.value.map((tab) => options.drafts.remove(tab.path)));
    resolveWorkspaceClose(true);
  }

  useEventListener(window, "focus", () => void checkActiveRemote());
  useIntervalFn(() => void checkActiveRemote(), 15_000);
  onUnmounted(() => {
    workspaceCloseResolver?.(false);
  });

  return {
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
  };
}
