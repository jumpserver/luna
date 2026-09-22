import type { DropdownMenuItem } from "@nuxt/ui";
import type { Ref } from "vue";
import type { SftpFileEntry } from "#koko/composables/sftp/useSftpFileManager";
import type { ContextTarget, EntryTreeRow, TreeNode, TreeRow } from "./sftpIdeShared";
import { sortSftpEntries } from "#koko/composables/sftp/useSftpFileManager";
import { KeyboardKey } from "#koko/constants/keyboard";
import {
  DIRECTORY_CACHE_TTL_MS,
  joinPath,
  parentPath,
  pathHasPrefix,
  removeTreePaths,
  rewritePathPrefix,
  rewriteTreePaths
} from "./sftpIdeShared";

export interface SftpIdeExplorerExpose {
  scrollActiveRow: () => void;
  focusFocusedRow: () => void;
  focusPendingInput: () => void;
  openUploadPicker: () => void;
  scrollQuickOpenActive: () => void;
}

interface UseSftpIdeTreeOptions {
  manager: {
    operations: {
      listDirectory: (path: string, options?: { background?: boolean }) => Promise<SftpFileEntry[]>;
      createFileAt: (path: string) => Promise<unknown>;
      createDirectoryAt: (path: string) => Promise<unknown>;
      renamePath: (path: string, name: string) => Promise<unknown>;
      downloadPath: (path: string, isDir: boolean) => void;
      uploadFile: (file: File, dest: string) => Promise<unknown>;
    };
  };
  fileEditorSupported: Ref<boolean>;
  rootPath: Ref<string>;
  activePath: Ref<string>;
  explorerRef: Ref<SftpIdeExplorerExpose | null>;
  editorLayout: Ref<HTMLElement | null>;
  formatError: (cause: unknown) => string;
  onOpenEntry: (entry: SftpFileEntry, path: string) => void;
  onPinTab: (path: string) => void;
  onCreatedFile: (entry: SftpFileEntry, path: string) => void;
  onOpenToSide: (entry: SftpFileEntry, path: string) => void;
  onRenamed: (change: { from: string; to: string; name: string }) => void;
  onRequestDelete: (target: ContextTarget) => void;
}

export function useSftpIdeTree(options: UseSftpIdeTreeOptions) {
  const { t } = useI18n();
  const toast = useToast();
  const explorerRootPath = ref("");
  const selectedDirectory = ref("");
  const pendingCreate = ref<{ parent: string; kind: "file" | "directory" } | null>(null);
  const pendingName = ref("");
  const pendingError = ref("");
  const pendingSubmitting = ref(false);
  const uploadDirectory = ref("");
  const contextMenuVisible = ref(false);
  const contextMenuPosition = ref({ x: 0, y: 0 });
  const contextTarget = ref<ContextTarget | null>(null);
  const explorerWidth = ref(280);
  const isNarrowScreen = useMediaQuery("(max-width: 767px)");
  const explorerOpen = ref(true);
  const responsiveExplorerWidth = computed(() =>
    isNarrowScreen.value ? "min(280px, calc(100vw - 3rem))" : `${explorerWidth.value}px minmax(0, 1fr)`
  );
  const resizingExplorer = ref(false);
  const treeFocusedPath = ref("");
  const tree = ref<Record<string, TreeNode>>({});
  const expanded = ref(new Set<string>());
  const renameDialogOpen = ref(false);
  const renameTarget = ref<ContextTarget | null>(null);
  const renameValue = ref("");
  const renameError = ref("");
  const renameSubmitting = ref(false);
  const renameDisabled = computed(
    () => !renameValue.value.trim() || renameValue.value.trim() === renameTarget.value?.entry.name
  );

  watch(options.fileEditorSupported, (supported) => {
    if (supported) return;
    pendingCreate.value = null;
    uploadDirectory.value = "";
    contextMenuVisible.value = false;
    contextTarget.value = null;
    renameDialogOpen.value = false;
    renameTarget.value = null;
  });

  const treeRows = computed<TreeRow[]>(() => {
    const rows: TreeRow[] = [];
    const walk = (parent: string, depth: number) => {
      const node = tree.value[parent];
      if (pendingCreate.value?.parent === parent) {
        rows.push({ kind: "pending", path: `pending:${parent}`, depth, createKind: pendingCreate.value.kind });
      }
      for (const entry of node?.entries || []) {
        if (entry.name === "..") continue;
        const path = joinPath(parent, entry.name);
        rows.push({ kind: "entry", entry, path, depth, expanded: expanded.value.has(path) });
        if (entry.is_dir && expanded.value.has(path)) walk(path, depth + 1);
      }
      if (parent !== explorerRootPath.value && node?.loading) {
        rows.push({ kind: "loading", path: `loading:${parent}`, parent, depth });
      } else if (parent !== explorerRootPath.value && node?.error) {
        rows.push({ kind: "error", path: `error:${parent}`, parent, depth, error: node.error });
      }
    };
    if (explorerRootPath.value) {
      rows.push({
        kind: "entry",
        entry: { name: explorerRootPath.value, size: "", perm: "", mod_time: "", type: "", is_dir: true },
        path: explorerRootPath.value,
        depth: 0,
        expanded: expanded.value.has(explorerRootPath.value)
      });
      if (expanded.value.has(explorerRootPath.value)) walk(explorerRootPath.value, 1);
    }
    return rows;
  });

  async function loadDirectory(path: string, force = false) {
    const existing = tree.value[path];
    if (existing?.loading) return;
    if (existing && !force && Date.now() - (existing.updatedAt || 0) < DIRECTORY_CACHE_TTL_MS) return;
    tree.value = {
      ...tree.value,
      [path]: { entries: existing?.entries || [], loading: true, error: "", updatedAt: existing?.updatedAt }
    };
    try {
      const entries = await options.manager.operations.listDirectory(path, { background: true });
      tree.value = {
        ...tree.value,
        [path]: { entries: sortSftpEntries(entries), loading: false, error: "", updatedAt: Date.now() }
      };
    } catch (cause) {
      tree.value = {
        ...tree.value,
        [path]: {
          entries: existing?.entries || [],
          loading: false,
          error: options.formatError(cause),
          updatedAt: existing?.updatedAt
        }
      };
    }
  }

  async function revealActiveFile(path: string) {
    const root = explorerRootPath.value;
    if (!root || (path !== root && !path.startsWith(`${root.replace(/\/$/, "")}/`))) return;
    const directories: string[] = [];
    let current = parentPath(path);
    while (current !== root && current !== "/" && current.startsWith(root)) {
      directories.unshift(current);
      const parent = parentPath(current);
      if (parent === current) break;
      current = parent;
    }
    if (current !== root && parentPath(path) !== root) return;

    if (directories.length) {
      const next = new Set(expanded.value);
      directories.forEach((directory) => next.add(directory));
      expanded.value = next;
    }
    for (const directory of directories) {
      if (tree.value[directory]) void loadDirectory(directory);
      else await loadDirectory(directory);
    }
    await nextTick();
    options.explorerRef.value?.scrollActiveRow();
  }

  const entryTreeRows = computed(() => treeRows.value.filter((row): row is EntryTreeRow => row.kind === "entry"));

  function focusTreePath(path: string) {
    treeFocusedPath.value = path;
    void nextTick(() => options.explorerRef.value?.focusFocusedRow());
  }

  function handleTreeKeydown(row: EntryTreeRow, event: KeyboardEvent) {
    const rows = entryTreeRows.value;
    const index = rows.findIndex((item) => item.path === row.path);
    if (index < 0) return;
    const focusAt = (nextIndex: number) => {
      const next = rows[Math.min(rows.length - 1, Math.max(0, nextIndex))];
      if (next) focusTreePath(next.path);
    };
    if (event.key === KeyboardKey.ArrowDown) {
      event.preventDefault();
      focusAt(index + 1);
    } else if (event.key === KeyboardKey.ArrowUp) {
      event.preventDefault();
      focusAt(index - 1);
    } else if (event.key === KeyboardKey.Home) {
      event.preventDefault();
      focusAt(0);
    } else if (event.key === KeyboardKey.End) {
      event.preventDefault();
      focusAt(rows.length - 1);
    } else if (event.key === KeyboardKey.ArrowRight && row.entry.is_dir) {
      event.preventDefault();
      if (!row.expanded) toggleDirectory(row.path);
      else if (rows[index + 1]?.depth === row.depth + 1) focusAt(index + 1);
    } else if (event.key === KeyboardKey.ArrowLeft) {
      event.preventDefault();
      if (row.entry.is_dir && row.expanded) {
        toggleDirectory(row.path);
        return;
      }
      let parentIndex = -1;
      for (let candidateIndex = index - 1; candidateIndex >= 0; candidateIndex--) {
        const candidate = rows[candidateIndex];
        if (candidate?.depth === row.depth - 1 && candidate.entry.is_dir) {
          parentIndex = candidateIndex;
          break;
        }
      }
      if (parentIndex >= 0) focusAt(parentIndex);
    } else if (event.key === KeyboardKey.Enter) {
      event.preventDefault();
      options.onOpenEntry(row.entry, row.path);
    } else if (event.key === KeyboardKey.F2) {
      event.preventDefault();
      beginRenameTarget({ entry: row.entry, path: row.path });
    } else if (event.key === KeyboardKey.Delete) {
      event.preventDefault();
      contextTarget.value = { entry: row.entry, path: row.path };
      openDeleteDialog();
    }
  }

  function toggleDirectory(path: string) {
    const next = new Set(expanded.value);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
      void loadDirectory(path);
    }
    expanded.value = next;
  }

  function nameExists(parent: string, name: string) {
    return tree.value[parent]?.entries.some((entry) => entry.name === name) || false;
  }

  function focusPendingCreateInput() {
    void nextTick(() => {
      const focus = () => options.explorerRef.value?.focusPendingInput();
      if (typeof globalThis.requestAnimationFrame === "function") globalThis.requestAnimationFrame(focus);
      else focus();
    });
  }

  function confirmPendingCreate(event: KeyboardEvent) {
    if (event.isComposing) return;
    event.preventDefault();
    void commitCreate();
  }

  function beginCreate(kind: "file" | "directory") {
    const parent = selectedDirectory.value || explorerRootPath.value;
    pendingCreate.value = { parent, kind };
    pendingName.value = "";
    pendingError.value = "";
    const next = new Set(expanded.value);
    next.add(explorerRootPath.value);
    next.add(parent);
    expanded.value = next;
    if (parent !== explorerRootPath.value) void loadDirectory(parent);
    focusPendingCreateInput();
  }

  function cancelCreate() {
    if (pendingSubmitting.value) return;
    pendingCreate.value = null;
    pendingName.value = "";
    pendingError.value = "";
  }

  async function commitCreate() {
    if (!options.fileEditorSupported.value || !pendingCreate.value || pendingSubmitting.value) return;
    const { parent, kind } = pendingCreate.value;
    const name = pendingName.value.trim();
    pendingError.value = "";
    if (!name) {
      pendingError.value = t("koko.sftpEditor.nameRequired");
      return;
    }
    if (name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
      pendingError.value = t("koko.sftpEditor.nameCannotContainPathSeparator");
      return;
    }
    if (nameExists(parent, name)) {
      pendingError.value = t("koko.sftpEditor.nameAlreadyExists");
      return;
    }
    const path = joinPath(parent, name);
    pendingSubmitting.value = true;
    try {
      if (kind === "file") await options.manager.operations.createFileAt(path);
      else await options.manager.operations.createDirectoryAt(path);
      await loadDirectory(parent, true);
      if (kind === "file") {
        const entry =
          tree.value[parent]?.entries.find((item) => item.name === name) ||
          ({ name, size: "0", perm: "", mod_time: "", type: "", is_dir: false } satisfies SftpFileEntry);
        options.onCreatedFile(entry, path);
      }
      pendingCreate.value = null;
      pendingName.value = "";
    } catch (cause) {
      pendingError.value = options.formatError(cause);
      focusPendingCreateInput();
    } finally {
      pendingSubmitting.value = false;
    }
  }

  async function refreshTree() {
    const paths = [explorerRootPath.value, ...expanded.value].filter(Boolean);
    await Promise.all(paths.map((path) => loadDirectory(path, true)));
  }

  function setExplorerRoot(path: string) {
    hideContextMenu();
    explorerRootPath.value = path;
    selectedDirectory.value = path;
    expanded.value = new Set([path]);
    treeFocusedPath.value = path;
    void loadDirectory(path);
  }

  function setContextDirectoryAsRoot() {
    const target = contextTarget.value;
    if (!target?.entry.is_dir) return;
    setExplorerRoot(target.path);
  }

  function restoreExplorerRoot() {
    if (!options.rootPath.value) return;
    setExplorerRoot(options.rootPath.value);
  }

  function openContextMenu(entry: SftpFileEntry, path: string, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    contextTarget.value = { entry, path };
    contextMenuPosition.value = { x: event.clientX, y: event.clientY };
    contextMenuVisible.value = true;
    if (entry.is_dir) selectedDirectory.value = path;
  }

  function hideContextMenu() {
    contextMenuVisible.value = false;
    contextTarget.value = null;
  }

  function createFromContext(kind: "file" | "directory") {
    const target = contextTarget.value;
    if (!target?.entry.is_dir) return;
    selectedDirectory.value = target.path;
    hideContextMenu();
    beginCreate(kind);
  }

  function beginRenameTarget(target: ContextTarget | null) {
    if (!target || target.path === explorerRootPath.value) return;
    renameTarget.value = target;
    renameValue.value = target.entry.name;
    renameError.value = "";
    renameDialogOpen.value = true;
  }

  function openRenameDialog() {
    const target = contextTarget.value;
    hideContextMenu();
    beginRenameTarget(target);
  }

  async function submitRename() {
    const target = renameTarget.value;
    if (!options.fileEditorSupported.value || !target || renameSubmitting.value) return;
    const name = renameValue.value.trim();
    renameError.value = "";
    if (!name) {
      renameError.value = t("koko.sftpEditor.nameRequired");
      return;
    }
    if (name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
      renameError.value = t("koko.sftpEditor.nameCannotContainPathSeparator");
      return;
    }

    const parent = parentPath(target.path);
    if (nameExists(parent, name)) {
      renameError.value = t("koko.sftpEditor.nameAlreadyExists");
      return;
    }

    const nextPath = joinPath(parent, name);
    renameSubmitting.value = true;
    try {
      await options.manager.operations.renamePath(target.path, name);
      const rewritten = rewriteTreePaths(tree.value, expanded.value, target.path, nextPath);
      tree.value = rewritten.tree;
      expanded.value = rewritten.expanded;
      selectedDirectory.value = rewritePathPrefix(selectedDirectory.value, target.path, nextPath);
      treeFocusedPath.value = rewritePathPrefix(treeFocusedPath.value, target.path, nextPath);
      options.onRenamed({ from: target.path, to: nextPath, name });
      await loadDirectory(parent, true);
      renameDialogOpen.value = false;
    } catch (cause) {
      renameError.value = options.formatError(cause);
    } finally {
      renameSubmitting.value = false;
    }
  }

  function openDeleteDialog() {
    const target = contextTarget.value;
    if (!target || target.path === explorerRootPath.value) return;
    hideContextMenu();
    options.onRequestDelete(target);
  }

  async function removeEntry(path: string) {
    const removed = removeTreePaths(tree.value, expanded.value, path);
    tree.value = removed.tree;
    expanded.value = removed.expanded;
    if (pathHasPrefix(treeFocusedPath.value, path)) treeFocusedPath.value = "";
    if (pathHasPrefix(selectedDirectory.value, path)) selectedDirectory.value = explorerRootPath.value;
    await loadDirectory(parentPath(path), true);
  }

  function downloadContextTarget() {
    const target = contextTarget.value;
    if (!target) return;
    hideContextMenu();
    options.manager.operations.downloadPath(target.path, target.entry.is_dir);
  }

  function openContextTargetToSide() {
    const target = contextTarget.value;
    if (!target || target.entry.is_dir) return;
    hideContextMenu();
    options.onOpenToSide(target.entry, target.path);
  }

  function chooseUpload() {
    if (!contextTarget.value?.entry.is_dir) return;
    uploadDirectory.value = contextTarget.value.path;
    options.explorerRef.value?.openUploadPicker();
  }

  async function uploadFiles(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files || [])];
    const directory = uploadDirectory.value;
    hideContextMenu();
    uploadDirectory.value = "";
    input.value = "";
    if (!options.fileEditorSupported.value || !directory || files.length === 0) return;
    const results = await Promise.allSettled(
      files.map((file) => options.manager.operations.uploadFile(file, joinPath(directory, file.name)))
    );
    const succeeded = results.filter((result) => result.status === "fulfilled").length;
    if (succeeded) {
      toast.add({
        title:
          succeeded === files.length
            ? t("koko.fileManagement.uploadedFiles", { count: succeeded })
            : t("koko.fileManagement.uploadedFilesPartial", { success: succeeded, total: files.length }),
        color: succeeded === files.length ? "success" : "warning"
      });
    }
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") {
      toast.add({
        title: t("koko.fileManagement.operationFailed"),
        description: options.formatError(failure.reason),
        color: "error"
      });
    }
    await loadDirectory(directory, true);
  }

  const contextMenuItems = computed<DropdownMenuItem[]>(() => {
    const target = contextTarget.value;
    if (!target) return [];
    const directoryActions = target.entry.is_dir
      ? [
          {
            label: t("koko.sftpEditor.newFile"),
            icon: "i-lucide-file-plus-2",
            onSelect: () => createFromContext("file")
          },
          {
            label: t("koko.sftpEditor.newDirectory"),
            icon: "i-lucide-folder-plus",
            onSelect: () => createFromContext("directory")
          },
          { label: t("koko.actions.upload"), icon: "i-lucide-upload", onSelect: chooseUpload },
          target.path === explorerRootPath.value && explorerRootPath.value !== options.rootPath.value
            ? {
                label: t("koko.sftpEditor.restoreRootDirectory"),
                icon: "i-lucide-folder-up",
                onSelect: restoreExplorerRoot
              }
            : {
                label: t("koko.sftpEditor.setAsRootDirectory"),
                icon: "i-lucide-folder-tree",
                disabled: target.path === explorerRootPath.value,
                onSelect: setContextDirectoryAsRoot
              },
          { type: "separator" as const }
        ]
      : [];
    const fileActions = target.entry.is_dir
      ? []
      : [
          {
            label: t("koko.sftpEditor.openToSide"),
            icon: "i-lucide-columns-2",
            onSelect: openContextTargetToSide
          },
          { type: "separator" as const }
        ];
    return [
      ...directoryActions,
      ...fileActions,
      { label: t("koko.actions.download"), icon: "i-lucide-download", onSelect: downloadContextTarget },
      {
        label: t("koko.actions.rename"),
        icon: "i-lucide-pencil",
        disabled: target.path === explorerRootPath.value,
        onSelect: openRenameDialog
      },
      { type: "separator" as const },
      {
        label: t("koko.actions.delete"),
        icon: "i-lucide-trash-2",
        color: "error" as const,
        disabled: target.path === explorerRootPath.value,
        onSelect: openDeleteDialog
      }
    ];
  });

  function beginExplorerResize(event: PointerEvent) {
    if (isNarrowScreen.value) return;
    event.preventDefault();
    resizingExplorer.value = true;
  }

  function resizeExplorer(event: PointerEvent) {
    if (!resizingExplorer.value || !options.editorLayout.value) return;
    const left = options.editorLayout.value.getBoundingClientRect().left;
    explorerWidth.value = Math.min(480, Math.max(220, event.clientX - left));
  }

  function endExplorerResize() {
    resizingExplorer.value = false;
  }

  watch(
    entryTreeRows,
    (rows) => {
      if (rows.some((row) => row.path === treeFocusedPath.value)) return;
      treeFocusedPath.value = rows.find((row) => row.path === options.activePath.value)?.path || rows[0]?.path || "";
    },
    { immediate: true }
  );

  useEventListener(window, "pointermove", resizeExplorer);
  useEventListener(window, "pointerup", endExplorerResize);

  return {
    tree,
    expanded,
    explorerRootPath,
    selectedDirectory,
    pendingCreate,
    pendingName,
    pendingError,
    pendingSubmitting,
    contextMenuVisible,
    contextMenuPosition,
    contextTarget,
    explorerWidth,
    isNarrowScreen,
    explorerOpen,
    responsiveExplorerWidth,
    resizingExplorer,
    treeFocusedPath,
    treeRows,
    entryTreeRows,
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
    beginExplorerResize,
    setExplorerRoot
  };
}
