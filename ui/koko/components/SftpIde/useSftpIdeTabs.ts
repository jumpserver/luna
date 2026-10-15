import type { SftpEditorDraft } from "#koko/composables/sftp/useSftpEditorDrafts";
import type { SftpFileEntry } from "#koko/composables/sftp/useSftpFileManager";
import type { DraggedEditorItem, EditorNavigationLocation, EditorPane, EditorTab, TreeNode } from "./sftpIdeShared";
import {
  isDirtyTab as dirty,
  expectedLanguage,
  fileVersion,
  metadataVersion,
  parentPath,
  pathHasPrefix,
  tabIcon
} from "./sftpIdeShared";

const editorDragMime = "application/x-jumpserver-editor-item";

interface UseSftpIdeTabsOptions {
  getTree: () => Record<string, TreeNode>;
  onLoadTab: (tab: EditorTab, forceLarge?: boolean, draft?: SftpEditorDraft) => Promise<void> | void;
  onRevealActiveFile: (path: string) => void;
  onRemoveDraft: (path: string) => void;
  onRequestUnsavedClose: (tab: EditorTab) => void;
}

export function useSftpIdeTabs(options: UseSftpIdeTabsOptions) {
  const { t } = useI18n();
  const toast = useToast();
  const tabs = ref<EditorTab[]>([]);
  const activePane = ref<EditorPane>("left");
  const paneActivePaths = reactive<Record<EditorPane, string>>({ left: "", right: "" });
  const splitOpen = ref(false);
  const splitRatio = ref(50);
  const editorGroups = ref<HTMLElement | null>(null);
  const resizingSplit = ref(false);
  const tabContextMenuVisible = ref(false);
  const tabContextMenuPosition = ref({ x: 0, y: 0 });
  const tabContextPath = ref("");
  const tabCloseDialogOpen = ref(false);
  const tabCloseTargets = ref<EditorTab[]>([]);
  const tabCloseSubmitting = ref(false);
  const draggedEditorItem = ref<DraggedEditorItem | null>(null);
  const editorDropPane = ref<EditorPane | null>(null);
  const recentlyClosed = ref<
    Array<{ path: string; entry: SftpFileEntry; pane: EditorPane; lineWrapping: boolean; language: string }>
  >([]);
  const navigationHistory = ref<EditorNavigationLocation[]>([]);
  const navigationIndex = ref(-1);
  const navigatingHistory = ref(false);
  const activePath = computed({
    get: () => paneActivePaths[activePane.value],
    set: (path: string) => {
      const existing = tabs.value.find((tab) => tab.path === path);
      if (existing) activePane.value = existing.pane;
      paneActivePaths[activePane.value] = path;
    }
  });
  const activeTab = computed(() => tabs.value.find((tab) => tab.path === activePath.value) || null);
  const canNavigateBack = computed(() => navigationIndex.value > 0);
  const canNavigateForward = computed(
    () => navigationIndex.value >= 0 && navigationIndex.value < navigationHistory.value.length - 1
  );
  const dirtyTabs = computed(() => tabs.value.filter((tab) => dirty(tab)));
  const savingTabs = computed(() => tabs.value.filter((tab) => tab.saving));
  const tabCloseDirtyCount = computed(() => tabCloseTargets.value.filter((tab) => dirty(tab)).length);

  function paneTabs(pane: EditorPane) {
    return tabs.value.filter((tab) => tab.pane === pane);
  }

  function paneActiveTab(pane: EditorPane) {
    return tabs.value.find((tab) => tab.pane === pane && tab.path === paneActivePaths[pane]) || null;
  }

  function subTabsForPane(pane: EditorPane) {
    return paneTabs(pane).map((tab) => ({
      id: tab.path,
      label: tab.entry.name,
      icon: tabIcon(tab),
      title: tab.preview ? `${tab.path}\n${t("koko.sftpEditor.previewTabHint")}` : tab.path,
      dirty: dirty(tab),
      preview: tab.preview
    }));
  }

  function beginSplitResize(event: PointerEvent) {
    event.preventDefault();
    resizingSplit.value = true;
  }

  function resizeSplit(event: PointerEvent) {
    if (!resizingSplit.value || !editorGroups.value) return;
    const bounds = editorGroups.value.getBoundingClientRect();
    splitRatio.value = Math.min(80, Math.max(20, ((event.clientX - bounds.left) / bounds.width) * 100));
  }

  function endSplitResize() {
    resizingSplit.value = false;
  }

  function createEditorTab(entry: SftpFileEntry, path: string, pane: EditorPane = activePane.value): EditorTab {
    return reactive({
      path,
      pane,
      entry,
      content: "",
      savedContent: "",
      kind: "empty",
      previewUrl: "",
      loading: true,
      loadStarted: false,
      saving: false,
      error: "",
      encoding: "utf-8",
      savedEncoding: "utf-8",
      lineEnding: "LF",
      savedLineEnding: "LF",
      remoteVersion: fileVersion(entry),
      remoteMetadataVersion: metadataVersion(entry),
      externalChanged: false,
      draftRestored: false,
      largeBlocked: false,
      lineWrapping: false,
      language: expectedLanguage(entry.name),
      expectedLanguage: expectedLanguage(entry.name),
      contentLanguageMismatch: false,
      cursorLine: 1,
      cursorColumn: 1,
      preview: false
    });
  }

  function revokePreview(tab: EditorTab) {
    if (tab.previewUrl) URL.revokeObjectURL(tab.previewUrl);
    tab.previewUrl = "";
  }

  function closeTabsNow(targets: EditorTab[], remember = true) {
    const paths = new Set(targets.map((tab) => tab.path));
    if (!paths.size) return;
    const previousTabs = tabs.value;
    if (remember) {
      const closed = targets.map((tab) => ({
        path: tab.path,
        entry: { ...tab.entry },
        pane: tab.pane,
        lineWrapping: tab.lineWrapping,
        language: tab.language
      }));
      const closedPaths = new Set(closed.map((item) => item.path));
      recentlyClosed.value = [...recentlyClosed.value.filter((item) => !closedPaths.has(item.path)), ...closed].slice(
        -20
      );
    }
    for (const tab of previousTabs) {
      if (!paths.has(tab.path)) continue;
      options.onRemoveDraft(tab.path);
      revokePreview(tab);
    }
    tabs.value = previousTabs.filter((tab) => !paths.has(tab.path));
    for (const pane of ["left", "right"] satisfies EditorPane[]) {
      const currentPath = paneActivePaths[pane];
      if (!paths.has(currentPath)) continue;
      const previousPaneTabs = previousTabs.filter((tab) => tab.pane === pane);
      const activeIndex = previousPaneTabs.findIndex((tab) => tab.path === currentPath);
      const nextTab = previousPaneTabs.slice(activeIndex + 1).find((tab) => !paths.has(tab.path));
      const previousTab = previousPaneTabs
        .slice(0, Math.max(0, activeIndex))
        .reverse()
        .find((tab) => !paths.has(tab.path));
      paneActivePaths[pane] = nextTab?.path || previousTab?.path || "";
    }
    if (!paneTabs("right").length) {
      splitOpen.value = false;
      paneActivePaths.right = "";
      if (activePane.value === "right") activePane.value = "left";
    } else if (!paneTabs(activePane.value).length) {
      activePane.value = activePane.value === "left" ? "right" : "left";
    }
  }

  function closeTabNow(tab: EditorTab) {
    closeTabsNow([tab]);
  }

  function closeTab(tab: EditorTab) {
    if (tab.saving) {
      toast.add({
        title: t("koko.sftpEditor.saveInProgress"),
        color: "warning"
      });
      return;
    }
    if (!dirty(tab)) {
      closeTabNow(tab);
      return;
    }
    options.onRequestUnsavedClose(tab);
  }

  function requestCloseTabs(targets: EditorTab[]) {
    const existingPaths = new Set(tabs.value.map((tab) => tab.path));
    const uniqueTargets = [...new Map(targets.map((tab) => [tab.path, tab])).values()].filter((tab) =>
      existingPaths.has(tab.path)
    );
    if (!uniqueTargets.length) return;
    if (uniqueTargets.some((tab) => tab.saving)) {
      toast.add({
        title: t("koko.sftpEditor.saveInProgress"),
        color: "warning"
      });
      return;
    }
    if (!uniqueTargets.some((tab) => dirty(tab))) {
      closeTabsNow(uniqueTargets);
      return;
    }
    tabCloseTargets.value = uniqueTargets;
    tabCloseDialogOpen.value = true;
  }

  function forgetPaths(prefix: string) {
    for (const tab of tabs.value.filter((tab) => pathHasPrefix(tab.path, prefix))) revokePreview(tab);
    tabs.value = tabs.value.filter((tab) => !pathHasPrefix(tab.path, prefix));
    navigationHistory.value = navigationHistory.value.filter((location) => !pathHasPrefix(location.path, prefix));
    navigationIndex.value = navigationHistory.value.length - 1;
    recentlyClosed.value = recentlyClosed.value.filter((item) => !pathHasPrefix(item.path, prefix));
    for (const pane of ["left", "right"] satisfies EditorPane[]) {
      const panePath = paneActivePaths[pane];
      if (!pathHasPrefix(panePath, prefix)) continue;
      paneActivePaths[pane] = paneTabs(pane).at(-1)?.path || "";
    }
    if (!paneTabs("right").length) {
      splitOpen.value = false;
      if (activePane.value === "right") activePane.value = "left";
    }
  }

  function recordNavigation(pane: EditorPane, path: string) {
    if (navigatingHistory.value || !path) return;
    const tab = tabs.value.find((item) => item.path === path);
    if (!tab) return;
    const current = navigationHistory.value[navigationIndex.value];
    if (current?.path === path && current.pane === pane) return;
    const next = navigationHistory.value.slice(0, navigationIndex.value + 1);
    next.push({ entry: { ...tab.entry }, pane, path });
    navigationHistory.value = next.slice(-100);
    navigationIndex.value = navigationHistory.value.length - 1;
  }

  function focusPane(pane: EditorPane, path = paneActivePaths[pane]) {
    activePane.value = pane;
    paneActivePaths[pane] = path;
    const tab = tabs.value.find((item) => item.path === path);
    if (!tab) return;
    if (!tab.loadStarted) void options.onLoadTab(tab);
    recordNavigation(pane, path);
    options.onRevealActiveFile(path);
  }

  function pinTab(path: string) {
    const tab = tabs.value.find((item) => item.path === path);
    if (tab) tab.preview = false;
  }

  function moveTabToPane(tab: EditorTab, pane: EditorPane) {
    if (tab.pane === pane) {
      focusPane(pane, tab.path);
      return;
    }
    const sourcePane = tab.pane;
    const sourcePaneTabs = paneTabs(sourcePane);
    const sourceIndex = sourcePaneTabs.findIndex((item) => item.path === tab.path);
    const replacement = sourcePaneTabs[sourceIndex + 1] || sourcePaneTabs[sourceIndex - 1] || null;
    tab.pane = pane;
    const remainingTabs = tabs.value.filter((item) => item.path !== tab.path);
    const leftTabs = remainingTabs.filter((item) => item.pane === "left");
    const rightTabs = remainingTabs.filter((item) => item.pane === "right");
    if (pane === "left") leftTabs.push(tab);
    else rightTabs.push(tab);
    tabs.value = [...leftTabs, ...rightTabs];
    paneActivePaths[sourcePane] = replacement?.path || "";
    paneActivePaths[pane] = tab.path;
    if (pane === "right") splitOpen.value = true;
    activePane.value = pane;
  }

  function reorderTabs(sourceId: string, targetId: string, placement: "before" | "after") {
    if (sourceId === targetId) return;
    const source = tabs.value.find((tab) => tab.path === sourceId);
    const target = tabs.value.find((tab) => tab.path === targetId);
    if (!source || !target) return;
    if (source.pane !== target.pane) moveTabToPane(source, target.pane);
    const orderedPaneTabs = paneTabs(source.pane);
    const sourceIndex = orderedPaneTabs.findIndex((tab) => tab.path === sourceId);
    const [moved] = orderedPaneTabs.splice(sourceIndex, 1);
    if (!moved) return;
    const targetIndex = orderedPaneTabs.findIndex((tab) => tab.path === targetId);
    orderedPaneTabs.splice(targetIndex + (placement === "after" ? 1 : 0), 0, moved);
    const otherPaneTabs = tabs.value.filter((tab) => tab.pane !== source.pane);
    tabs.value =
      source.pane === "left" ? [...orderedPaneTabs, ...otherPaneTabs] : [...otherPaneTabs, ...orderedPaneTabs];
  }

  function moveTabToEdge(path: string, edge: "first" | "last") {
    const tab = tabs.value.find((item) => item.path === path);
    if (!tab) return;
    const orderedPaneTabs = paneTabs(tab.pane);
    const index = orderedPaneTabs.findIndex((item) => item.path === path);
    if (index < 0 || (edge === "first" && index === 0) || (edge === "last" && index === orderedPaneTabs.length - 1))
      return;
    const [source] = orderedPaneTabs.splice(index, 1);
    if (!source) return;
    if (edge === "first") orderedPaneTabs.unshift(source);
    else orderedPaneTabs.push(source);
    const otherPaneTabs = tabs.value.filter((item) => item.pane !== tab.pane);
    tabs.value = tab.pane === "left" ? [...orderedPaneTabs, ...otherPaneTabs] : [...otherPaneTabs, ...orderedPaneTabs];
  }

  function splitEditor(tab: EditorTab) {
    splitOpen.value = true;
    if (tab.pane === "left" && paneTabs("left").length > 1) {
      moveTabToPane(tab, "right");
      return;
    }
    activePane.value = "right";
    paneActivePaths.right ||= paneTabs("right")[0]?.path || "";
  }

  function closeSplitEditor() {
    const rightTabs = paneTabs("right");
    const rightActivePath = paneActivePaths.right;
    for (const tab of rightTabs) tab.pane = "left";
    if (activePane.value === "right" && rightActivePath) paneActivePaths.left = rightActivePath;
    paneActivePaths.right = "";
    splitOpen.value = false;
    activePane.value = "left";
  }

  async function openFileInPane(
    entry: SftpFileEntry,
    path: string,
    pane: EditorPane,
    moveExisting = false,
    preview = false
  ) {
    const existing = tabs.value.find((tab) => tab.path === path);
    if (existing) {
      if (!preview) existing.preview = false;
      if (existing.pane !== pane && moveExisting) moveTabToPane(existing, pane);
      else if (existing.pane !== pane) focusPane(existing.pane, path);
      else focusPane(pane, path);
      return;
    }
    if (preview) {
      const replaceable = tabs.value.find(
        (tab) => tab.pane === pane && tab.preview && !dirty(tab) && !tab.saving && !tab.loading
      );
      if (replaceable) closeTabsNow([replaceable], false);
    }
    if (pane === "right") splitOpen.value = true;
    const tab = createEditorTab(entry, path, pane);
    tab.preview = preview;
    tabs.value.push(tab);
    const loading = options.onLoadTab(tab);
    focusPane(pane, path);
    await loading;
  }

  async function reopenLastClosed() {
    const closed = recentlyClosed.value.at(-1);
    if (!closed) return;
    recentlyClosed.value = recentlyClosed.value.slice(0, -1);
    const existing = tabs.value.find((tab) => tab.path === closed.path);
    if (existing) {
      existing.preview = false;
      focusPane(existing.pane, existing.path);
      return;
    }
    await openFileInPane(closed.entry, closed.path, closed.pane, false, false);
    const tab = tabs.value.find((item) => item.path === closed.path);
    if (!tab) return;
    tab.lineWrapping = closed.lineWrapping;
    tab.language = closed.language;
  }

  function navigateEditorHistory(offset: -1 | 1) {
    const nextIndex = navigationIndex.value + offset;
    const location = navigationHistory.value[nextIndex];
    if (!location) return;
    navigationIndex.value = nextIndex;
    navigatingHistory.value = true;
    try {
      const existing = tabs.value.find((tab) => tab.path === location.path);
      if (existing) {
        focusPane(existing.pane, existing.path);
      } else {
        void openFileInPane(location.entry, location.path, location.pane, false, false);
      }
    } finally {
      navigatingHistory.value = false;
    }
  }

  function beginTabDrag(path: string) {
    const tab = tabs.value.find((item) => item.path === path);
    if (!tab) return;
    draggedEditorItem.value = { entry: tab.entry, path, source: "tab" };
  }

  function beginTreeDrag(entry: SftpFileEntry, path: string, event: DragEvent) {
    if (entry.is_dir || !event.dataTransfer) {
      event.preventDefault();
      return;
    }
    draggedEditorItem.value = { entry, path, source: "tree" };
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(editorDragMime, JSON.stringify({ path, source: "tree" }));
    event.dataTransfer.setData("text/plain", path);
  }

  function endEditorDrag() {
    draggedEditorItem.value = null;
    editorDropPane.value = null;
  }

  function entryForPath(path: string) {
    const tab = tabs.value.find((item) => item.path === path);
    if (tab) return tab.entry;
    const parent = parentPath(path);
    const name = path.slice(path.lastIndexOf("/") + 1);
    return options.getTree()[parent]?.entries.find((entry) => !entry.is_dir && entry.name === name) || null;
  }

  function draggedItemFromEvent(event: DragEvent) {
    if (draggedEditorItem.value) return draggedEditorItem.value;
    const payload = event.dataTransfer?.getData(editorDragMime);
    if (!payload) return null;
    try {
      const parsed = JSON.parse(payload) as { path?: string; source?: "tab" | "tree" };
      if (!parsed.path) return null;
      const entry = entryForPath(parsed.path);
      return entry ? { entry, path: parsed.path, source: parsed.source || "tree" } : null;
    } catch {
      return null;
    }
  }

  function paneAtPointer(event: DragEvent): EditorPane {
    if (!editorGroups.value) return activePane.value;
    const bounds = editorGroups.value.getBoundingClientRect();
    const offset = Math.min(bounds.width, Math.max(0, event.clientX - bounds.left));
    if (!splitOpen.value) return offset >= bounds.width * 0.68 ? "right" : "left";
    return offset < (bounds.width * splitRatio.value) / 100 ? "left" : "right";
  }

  function updateEditorDropTarget(event: DragEvent) {
    if (!draggedItemFromEvent(event)) return;
    event.preventDefault();
    editorDropPane.value = paneAtPointer(event);
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = draggedEditorItem.value?.source === "tab" ? "move" : "copy";
    }
  }

  function leaveEditorDropTarget(event: DragEvent) {
    const container = event.currentTarget as HTMLElement;
    const relatedTarget = event.relatedTarget as Node | null;
    if (relatedTarget && container.contains(relatedTarget)) return;
    editorDropPane.value = null;
  }

  function dropEditorItem(event: DragEvent) {
    const item = draggedItemFromEvent(event);
    if (!item) return;
    event.preventDefault();
    const pane = editorDropPane.value || paneAtPointer(event);
    endEditorDrag();
    const tab = tabs.value.find((candidate) => candidate.path === item.path);
    if (item.source === "tab" && tab) {
      moveTabToPane(tab, pane);
      return;
    }
    void openFileInPane(item.entry, item.path, pane, true);
  }

  function openTabContextMenu(path: string, event: MouseEvent) {
    const tab = tabs.value.find((item) => item.path === path);
    if (tab) focusPane(tab.pane, tab.path);
    tabContextPath.value = path;
    tabContextMenuPosition.value = { x: event.clientX, y: event.clientY };
    tabContextMenuVisible.value = true;
  }

  function hideTabContextMenu() {
    tabContextMenuVisible.value = false;
  }

  const tabContextMenuItems = computed(() => {
    const tab = tabs.value.find((item) => item.path === tabContextPath.value);
    if (!tab) return [];
    const currentPaneTabs = paneTabs(tab.pane);
    const index = currentPaneTabs.findIndex((item) => item.path === tab.path);
    const closeTargets = (targets: EditorTab[]) => {
      hideTabContextMenu();
      requestCloseTabs(targets);
    };
    return [
      ...(tab.preview
        ? [
            {
              label: t("koko.sftpEditor.pinTab"),
              icon: "i-lucide-pin",
              onSelect: () => {
                hideTabContextMenu();
                pinTab(tab.path);
              }
            },
            { type: "separator" as const }
          ]
        : []),
      {
        label: t("koko.sftpEditor.moveTabFirst"),
        icon: "i-lucide-chevrons-left",
        disabled: index === 0,
        onSelect: () => {
          hideTabContextMenu();
          moveTabToEdge(tab.path, "first");
        }
      },
      {
        label: t("koko.sftpEditor.moveTabLast"),
        icon: "i-lucide-chevrons-right",
        disabled: index === currentPaneTabs.length - 1,
        onSelect: () => {
          hideTabContextMenu();
          moveTabToEdge(tab.path, "last");
        }
      },
      {
        label: tab.pane === "left" ? t("koko.sftpEditor.moveToRightEditor") : t("koko.sftpEditor.moveToLeftEditor"),
        icon: tab.pane === "left" ? "i-lucide-panel-right-open" : "i-lucide-panel-left-open",
        onSelect: () => {
          hideTabContextMenu();
          moveTabToPane(tab, tab.pane === "left" ? "right" : "left");
        }
      },
      { type: "separator" as const },
      {
        label: t("koko.sftpEditor.closeTab"),
        icon: "i-lucide-x",
        onSelect: () => {
          hideTabContextMenu();
          closeTab(tab);
        }
      },
      {
        label: t("koko.sftpEditor.closeOtherTabs"),
        icon: "i-lucide-gallery-horizontal-end",
        disabled: currentPaneTabs.length < 2,
        onSelect: () => closeTargets(currentPaneTabs.filter((item) => item.path !== tab.path))
      },
      {
        label: t("koko.sftpEditor.closeTabsToLeft"),
        icon: "i-lucide-panel-left-close",
        disabled: index === 0,
        onSelect: () => closeTargets(currentPaneTabs.slice(0, index))
      },
      {
        label: t("koko.sftpEditor.closeTabsToRight"),
        icon: "i-lucide-panel-right-close",
        disabled: index === currentPaneTabs.length - 1,
        onSelect: () => closeTargets(currentPaneTabs.slice(index + 1))
      },
      {
        label: t("koko.sftpEditor.closeAllTabs"),
        icon: "i-lucide-copy-x",
        onSelect: () => closeTargets(currentPaneTabs)
      },
      { type: "separator" as const },
      {
        label: t("koko.sftpEditor.reopenClosedEditor"),
        icon: "i-lucide-rotate-ccw",
        disabled: recentlyClosed.value.length === 0,
        onSelect: () => {
          hideTabContextMenu();
          void reopenLastClosed();
        }
      }
    ];
  });

  const editorHistoryMenuItems = computed(() => [
    {
      label: t("koko.sftpEditor.navigateBack"),
      icon: "i-lucide-arrow-left",
      disabled: !canNavigateBack.value,
      onSelect: () => void navigateEditorHistory(-1)
    },
    {
      label: t("koko.sftpEditor.navigateForward"),
      icon: "i-lucide-arrow-right",
      disabled: !canNavigateForward.value,
      onSelect: () => void navigateEditorHistory(1)
    },
    { type: "separator" as const },
    {
      label: t("koko.sftpEditor.reopenClosedEditor"),
      icon: "i-lucide-rotate-ccw",
      disabled: recentlyClosed.value.length === 0,
      onSelect: () => void reopenLastClosed()
    }
  ]);

  useEventListener(window, "pointermove", resizeSplit);
  useEventListener(window, "pointerup", endSplitResize);

  return {
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
    navigationIndex,
    dirtyTabs,
    savingTabs,
    canNavigateBack,
    canNavigateForward,
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
    requestCloseTabs,
    forgetPaths,
    focusPane,
    pinTab,
    moveTabToPane,
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
  };
}
