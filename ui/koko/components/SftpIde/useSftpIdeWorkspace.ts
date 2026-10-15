import type { ComputedRef, Ref } from "vue";
import type { SftpEditorDraft, SftpEditorWorkspaceState } from "#koko/composables/sftp/useSftpEditorDrafts";
import type { SftpFileEntry } from "#koko/composables/sftp/useSftpFileManager";
import type { EditorPane, EditorTab, LineEnding, TextEncoding, TreeNode } from "./sftpIdeShared";
import { sortSftpEntries } from "#koko/composables/sftp/useSftpFileManager";
import { isDirtyTab as dirty, metadataVersion, parentPath, updateDetectedLanguage } from "./sftpIdeShared";

interface UseSftpIdeWorkspaceOptions {
  manager: {
    operations: {
      listDirectory: (path: string, options?: { background?: boolean }) => Promise<SftpFileEntry[]>;
    };
  };
  drafts: {
    save: (draft: SftpEditorDraft) => Promise<unknown>;
    remove: (path: string) => Promise<unknown>;
    list: () => Promise<SftpEditorDraft[]>;
    saveWorkspace: (state: SftpEditorWorkspaceState) => Promise<unknown>;
    loadWorkspace: () => Promise<SftpEditorWorkspaceState | null>;
  };
  rootPath: Ref<string>;
  tabs: Ref<EditorTab[]>;
  activePath: { value: string };
  paneActivePaths: Record<EditorPane, string>;
  activePane: Ref<EditorPane>;
  splitOpen: Ref<boolean>;
  splitRatio: Ref<number>;
  paneTabs: (pane: EditorPane) => EditorTab[];
  createEditorTab: (entry: SftpFileEntry, path: string, pane?: EditorPane) => EditorTab;
  focusPane: (pane: EditorPane, path?: string) => void;
  recentlyClosed: Ref<SftpEditorWorkspaceState["recentlyClosed"]>;
  tree: Ref<Record<string, TreeNode>>;
  expanded: Ref<Set<string>>;
  explorerRootPath: Ref<string>;
  selectedDirectory: Ref<string>;
  explorerWidth: Ref<number>;
  loadDirectory: (path: string, force?: boolean) => Promise<void> | void;
  dirtyTabs: ComputedRef<EditorTab[]>;
}

export function useSftpIdeWorkspace(options: UseSftpIdeWorkspaceOptions) {
  const { t } = useI18n();
  const toast = useToast();
  const restoringDrafts = ref(false);
  const restoringWorkspace = ref(false);
  let workspaceRestored = false;
  let restoredStoredDrafts = false;

  function draftFromTab(tab: EditorTab): SftpEditorDraft {
    return {
      path: tab.path,
      entry: { ...tab.entry },
      content: tab.content,
      savedContent: tab.savedContent,
      encoding: tab.encoding,
      savedEncoding: tab.savedEncoding,
      lineEnding: tab.lineEnding,
      savedLineEnding: tab.savedLineEnding,
      remoteVersion: tab.remoteVersion,
      remoteMetadataVersion: tab.remoteMetadataVersion,
      updatedAt: Date.now()
    };
  }

  async function persistDirtyDraftsNow() {
    if (restoringDrafts.value) return;
    await Promise.all(
      options.tabs.value.map((tab) =>
        dirty(tab) ? options.drafts.save(draftFromTab(tab)) : options.drafts.remove(tab.path)
      )
    ).catch(() => undefined);
  }

  const persistDirtyDrafts = useDebounceFn(persistDirtyDraftsNow, 800);

  function applyStoredDraft(tab: EditorTab, draft: SftpEditorDraft) {
    tab.kind = "text";
    tab.loading = false;
    tab.loadStarted = true;
    tab.preview = false;
    tab.content = draft.content;
    tab.savedContent = draft.savedContent;
    tab.encoding = draft.encoding as TextEncoding;
    tab.savedEncoding = (draft.savedEncoding || draft.encoding) as TextEncoding;
    tab.lineEnding = draft.lineEnding as LineEnding;
    tab.savedLineEnding = (draft.savedLineEnding || draft.lineEnding) as LineEnding;
    tab.remoteVersion = draft.remoteVersion;
    tab.remoteMetadataVersion = draft.remoteMetadataVersion;
    tab.externalChanged = false;
    tab.draftRestored = true;
    updateDetectedLanguage(tab, draft.content);
  }

  async function verifyRestoredDrafts(restored: Array<{ tab: EditorTab; draft: SftpEditorDraft }>) {
    const directories = new Map<string, Array<{ tab: EditorTab; draft: SftpEditorDraft }>>();
    for (const item of restored) {
      const directory = parentPath(item.tab.path);
      directories.set(directory, [...(directories.get(directory) || []), item]);
    }
    await Promise.all(
      [...directories].map(async ([directory, items]) => {
        const entries = sortSftpEntries(
          await options.manager.operations.listDirectory(directory, { background: true })
        );
        options.tree.value = {
          ...options.tree.value,
          [directory]: { entries, loading: false, error: "", updatedAt: Date.now() }
        };
        for (const { tab, draft } of items) {
          if (!options.tabs.value.includes(tab)) continue;
          const remoteEntry = entries.find((entry) => entry.name === tab.entry.name) || null;
          if (remoteEntry) tab.entry = remoteEntry;
          tab.externalChanged =
            !remoteEntry ||
            Boolean(draft.remoteMetadataVersion && metadataVersion(remoteEntry) !== draft.remoteMetadataVersion);
        }
      })
    );
  }

  async function restoreStoredDrafts() {
    if (restoredStoredDrafts || restoringDrafts.value || !options.rootPath.value) return;
    restoredStoredDrafts = true;
    restoringDrafts.value = true;
    try {
      const storedDrafts = (await options.drafts.list()).slice(0, 10);
      const restored: Array<{ tab: EditorTab; draft: SftpEditorDraft }> = [];
      for (const draft of storedDrafts) {
        if (options.tabs.value.some((tab) => tab.path === draft.path)) continue;
        const tab = options.createEditorTab(draft.entry, draft.path, "left");
        applyStoredDraft(tab, draft);
        options.tabs.value.push(tab);
        restored.push({ tab, draft });
      }
      if (restored.length) {
        options.activePath.value ||= restored[0]?.tab.path || "";
        toast.add({
          title: t("koko.sftpEditor.draftsRestored", { count: restored.length }),
          description: t("koko.sftpEditor.draftsRestoredDescription"),
          color: "info"
        });
        void verifyRestoredDrafts(restored);
      }
    } catch {
      // Draft storage can be unavailable in private or restricted browser modes.
    } finally {
      restoringDrafts.value = false;
    }
  }

  function workspaceState(): SftpEditorWorkspaceState {
    const cachedDirectories = Object.entries(options.tree.value)
      .filter(([, node]) => Boolean(node.updatedAt))
      .sort(([leftPath, left], [rightPath, right]) => {
        const leftPriority = Number(
          leftPath === options.explorerRootPath.value || options.expanded.value.has(leftPath)
        );
        const rightPriority = Number(
          rightPath === options.explorerRootPath.value || options.expanded.value.has(rightPath)
        );
        return rightPriority - leftPriority || (right.updatedAt || 0) - (left.updatedAt || 0);
      })
      .slice(0, 60)
      .map(([path, node]) => ({
        path,
        entries: node.entries.map((entry) => ({ ...entry })),
        updatedAt: node.updatedAt || Date.now()
      }));
    return {
      rootPath: options.rootPath.value,
      explorerRootPath: options.explorerRootPath.value,
      tabs: options.tabs.value
        .filter((tab) => !tab.preview || dirty(tab))
        .slice(0, 30)
        .map((tab) => ({
          path: tab.path,
          entry: { ...tab.entry },
          pane: tab.pane,
          lineWrapping: tab.lineWrapping,
          language: tab.language
        })),
      activePane: options.activePane.value,
      paneActivePaths: { ...options.paneActivePaths },
      splitOpen: options.splitOpen.value,
      splitRatio: options.splitRatio.value,
      explorerWidth: options.explorerWidth.value,
      expanded: [...options.expanded.value],
      treeIncludesRoot: true,
      selectedDirectory: options.selectedDirectory.value,
      directories: cachedDirectories,
      recentlyClosed: options.recentlyClosed.value.map((item) => ({
        ...item,
        entry: { ...item.entry }
      })),
      updatedAt: Date.now()
    };
  }

  async function persistWorkspaceNow() {
    if (!workspaceRestored || restoringWorkspace.value || !options.rootPath.value) return;
    await options.drafts.saveWorkspace(workspaceState()).catch(() => undefined);
  }

  const persistWorkspace = useDebounceFn(persistWorkspaceNow, 600);

  async function restoreWorkspace() {
    if (workspaceRestored || restoringWorkspace.value || !options.rootPath.value) return;
    workspaceRestored = true;
    restoringWorkspace.value = true;
    try {
      const state = await options.drafts.loadWorkspace();
      if (!state || state.rootPath !== options.rootPath.value) return;

      options.explorerWidth.value = Math.min(480, Math.max(220, state.explorerWidth || 280));
      options.splitRatio.value = Math.min(80, Math.max(20, state.splitRatio || 50));
      const sessionRootPrefix = `${options.rootPath.value.replace(/\/$/, "")}/`;
      const storedExplorerRoot = state.explorerRootPath || options.rootPath.value;
      options.explorerRootPath.value =
        storedExplorerRoot === options.rootPath.value || storedExplorerRoot.startsWith(sessionRootPrefix)
          ? storedExplorerRoot
          : options.rootPath.value;
      const rootPrefix = `${options.explorerRootPath.value.replace(/\/$/, "")}/`;
      options.selectedDirectory.value =
        state.selectedDirectory === options.explorerRootPath.value || state.selectedDirectory.startsWith(rootPrefix)
          ? state.selectedDirectory
          : options.explorerRootPath.value;
      const restoredExpanded = new Set(
        state.expanded.filter((path) => path === options.explorerRootPath.value || path.startsWith(rootPrefix))
      );
      if (!state.treeIncludesRoot) restoredExpanded.add(options.explorerRootPath.value);
      options.expanded.value = restoredExpanded;
      options.recentlyClosed.value = state.recentlyClosed.slice(-20);

      const cachedTree = { ...options.tree.value };
      for (const directory of state.directories) {
        const existing = cachedTree[directory.path];
        if (existing?.updatedAt && existing.updatedAt >= directory.updatedAt) continue;
        cachedTree[directory.path] = {
          entries: sortSftpEntries(directory.entries),
          loading: false,
          error: "",
          updatedAt: directory.updatedAt
        };
      }
      options.tree.value = cachedTree;

      const restoredTabs: EditorTab[] = [];
      for (const stored of state.tabs) {
        let tab = options.tabs.value.find((item) => item.path === stored.path);
        if (!tab) {
          tab = options.createEditorTab(stored.entry, stored.path, stored.pane);
          options.tabs.value.push(tab);
        }
        tab.pane = stored.pane;
        tab.preview = false;
        tab.lineWrapping = stored.lineWrapping;
        tab.language = stored.language;
        restoredTabs.push(tab);
      }
      const restoredPaths = new Set(restoredTabs.map((tab) => tab.path));
      options.tabs.value = [...restoredTabs, ...options.tabs.value.filter((tab) => !restoredPaths.has(tab.path))];

      const panePath = (pane: EditorPane) => {
        const requested = state.paneActivePaths[pane];
        return (
          options.tabs.value.find((tab) => tab.pane === pane && tab.path === requested)?.path ||
          options.paneTabs(pane)[0]?.path ||
          ""
        );
      };
      options.paneActivePaths.left = panePath("left");
      options.paneActivePaths.right = panePath("right");
      options.splitOpen.value = Boolean(state.splitOpen && options.paneTabs("right").length);
      options.activePane.value = state.activePane === "right" && options.splitOpen.value ? "right" : "left";
      const selectedPath = options.paneActivePaths[options.activePane.value];
      if (selectedPath) options.focusPane(options.activePane.value, selectedPath);

      const refreshPaths = [options.explorerRootPath.value, ...options.expanded.value]
        .filter((path) => options.tree.value[path])
        .slice(0, 20);
      refreshPaths.forEach((path) => void options.loadDirectory(path));
    } catch {
      // Workspace recovery remains optional when browser storage is unavailable.
    } finally {
      restoringWorkspace.value = false;
    }
  }

  async function restoreEditorState() {
    await restoreStoredDrafts();
    await restoreWorkspace();
    if (options.activePath.value) options.focusPane(options.activePane.value, options.activePath.value);
  }

  watch(
    () =>
      options.tabs.value.map((tab) => [
        tab.path,
        tab.content,
        tab.savedContent,
        tab.encoding,
        tab.savedEncoding,
        tab.lineEnding,
        tab.savedLineEnding
      ]),
    () => {
      options.tabs.value.forEach((tab) => {
        if (tab.preview && dirty(tab)) tab.preview = false;
      });
      void persistDirtyDrafts();
    },
    { deep: true }
  );
  watch(
    () => ({
      tabs: options.tabs.value.map((tab) => [
        tab.path,
        tab.pane,
        tab.preview,
        tab.lineWrapping,
        tab.language,
        tab.entry.name
      ]),
      activePane: options.activePane.value,
      activePaths: [options.paneActivePaths.left, options.paneActivePaths.right],
      split: [options.splitOpen.value, options.splitRatio.value, options.explorerWidth.value],
      expanded: [...options.expanded.value],
      explorerRootPath: options.explorerRootPath.value,
      selectedDirectory: options.selectedDirectory.value,
      recentlyClosed: options.recentlyClosed.value.map((item) => item.path),
      directories: Object.entries(options.tree.value).map(([path, node]) => [path, node.updatedAt])
    }),
    () => void persistWorkspace(),
    { deep: true }
  );

  useEventListener(document, "visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    void persistDirtyDraftsNow();
    void persistWorkspaceNow();
  });
  useEventListener(window, "beforeunload", (event: BeforeUnloadEvent) => {
    if (options.dirtyTabs.value.length === 0) return;
    event.preventDefault();
    event.returnValue = "";
  });
  onUnmounted(() => {
    void persistDirtyDraftsNow();
    void persistWorkspaceNow();
  });

  return { persistDirtyDrafts, restoreEditorState };
}
