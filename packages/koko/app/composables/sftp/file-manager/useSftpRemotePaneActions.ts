import type { DropdownMenuItem } from "@nuxt/ui";
import type { MaybeRefOrGetter, Ref } from "vue";
import type { SftpFileEntry, useSftpFileManager } from "#koko/composables/sftp/useSftpFileManager";

interface UseSftpRemotePaneActionsOptions {
  manager: ReturnType<typeof useSftpFileManager>;
  selectedEntries: Ref<SftpFileEntry[]>;
  selectedEntry: Readonly<Ref<SftpFileEntry | null>>;
  contextEntry: Ref<SftpFileEntry | null>;
  canTransferFiles: MaybeRefOrGetter<boolean>;
  transferableCount: MaybeRefOrGetter<number>;
  clearSelection: () => void;
  updateSelection: (entries: SftpFileEntry[]) => void;
  hideContextMenu: () => void;
  requestSend: () => void;
  translate: (key: string, params?: Record<string, unknown>) => string;
}

export function useSftpRemotePaneActions(options: UseSftpRemotePaneActionsOptions) {
  const toast = useToast();
  const { addErrorToast } = useErrorToast();
  const promptOpen = ref(false);
  const promptName = ref("");
  const promptTarget = ref<SftpFileEntry | null>(null);
  const promptKind = ref<"folder" | "file">("folder");
  const alertOpen = ref(false);
  const alertTarget = ref<{ kind: "delete" | "download"; entries: SftpFileEntry[] } | null>(null);
  const t = options.translate;

  const promptTitle = computed(() =>
    promptTarget.value
      ? t("koko.actions.rename")
      : t(promptKind.value === "file" ? "koko.fileManagement.newFile" : "koko.fileManagement.newFolder")
  );
  const promptConfirmLabel = computed(() =>
    promptTarget.value ? t("koko.actions.rename") : t("koko.actions.confirm")
  );
  const promptDisabled = computed(() => {
    const name = promptName.value.trim();
    return !name || (promptTarget.value !== null && name === promptTarget.value.name);
  });
  const alertTitle = computed(() =>
    alertTarget.value?.kind === "delete" ? t("koko.actions.delete") : t("koko.actions.download")
  );
  const alertDescription = computed(() => {
    if (!alertTarget.value) return "";
    if (alertTarget.value.kind !== "delete") return t("koko.fileManagement.downloadFolderConfirm");
    const entries = alertTarget.value.entries;
    return entries.length === 1
      ? t("koko.fileManagement.deleteConfirm", { name: entries[0]?.name })
      : `${t("koko.actions.delete")} ${t("koko.fileManagement.items", { count: entries.length })}?`;
  });

  async function refreshCurrentDirectory(): Promise<void> {
    if (await options.manager.loadCurrentDirectory()) return;
    addErrorToast({ title: t("koko.fileManagement.refreshFailed"), error: options.manager.error.value });
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

  function createFolder(): void {
    promptTarget.value = null;
    promptKind.value = "folder";
    promptName.value = "";
    promptOpen.value = true;
  }

  function createFile(): void {
    promptTarget.value = null;
    promptKind.value = "file";
    promptName.value = "";
    promptOpen.value = true;
  }

  function rename(entry: SftpFileEntry): void {
    options.hideContextMenu();
    promptTarget.value = entry;
    promptName.value = entry.name;
    promptOpen.value = true;
  }

  function requestDelete(entries = options.selectedEntries.value): void {
    const targets = entries.filter((entry) => entry.name !== "..");
    if (!targets.length) return;
    options.hideContextMenu();
    alertTarget.value = { kind: "delete", entries: targets };
    alertOpen.value = true;
  }

  function downloadEntry(entry: SftpFileEntry): void {
    options.hideContextMenu();
    void runFileOperation(
      () => options.manager.operations.downloadEntry(entry),
      t("koko.fileManagement.entryDownloaded", { name: entry.name })
    );
  }

  function downloadSelected(): void {
    const entry = options.selectedEntry.value;
    if (!entry || options.selectedEntries.value.length !== 1) return;
    if (!entry.is_dir) return downloadEntry(entry);
    options.hideContextMenu();
    alertTarget.value = { kind: "download", entries: [entry] };
    alertOpen.value = true;
  }

  const contextMenuItems = computed<DropdownMenuItem[]>(() => {
    const entry = options.contextEntry.value;
    if (!entry) return [];
    const singleSelection = options.selectedEntries.value.length === 1;
    const items: DropdownMenuItem[] = [];
    if (toValue(options.canTransferFiles)) {
      items.push(
        {
          label: t("koko.fileManagement.sendTo"),
          icon: "i-lucide-send",
          disabled: !toValue(options.transferableCount),
          onSelect: options.requestSend
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
      { label: t("koko.actions.delete"), icon: "i-lucide-trash-2", color: "error", onSelect: () => requestDelete() }
    );
    return items;
  });

  async function submitPrompt(): Promise<void> {
    const name = promptName.value.trim();
    const target = promptTarget.value;
    const isNewFile = promptKind.value === "file";
    if (!name || (target && name === target.name)) return;
    const success = await runFileOperation(
      () => {
        if (target) return options.manager.operations.renameEntry(target, name);
        if (!isNewFile) return options.manager.operations.createDirectory(name);
        const directory = options.manager.currentPath.value.replace(/\/$/, "") || "/";
        return options.manager.operations.createFileAt(`${directory}/${name}`.replace(/\/+/g, "/"));
      },
      target
        ? t("koko.fileManagement.entryRenamed", { name })
        : t(isNewFile ? "koko.fileManagement.fileCreated" : "koko.fileManagement.folderCreated", { name }),
      true
    );
    if (success) {
      options.clearSelection();
      promptOpen.value = false;
    }
  }

  async function removeEntries(entries: SftpFileEntry[], concurrency = 4): Promise<PromiseSettledResult<void>[]> {
    const results: PromiseSettledResult<void>[] = Array.from({ length: entries.length });
    let nextIndex = 0;
    await Promise.all(
      Array.from({ length: Math.min(concurrency, entries.length) }, async () => {
        while (nextIndex < entries.length) {
          const index = nextIndex++;
          const entry = entries[index];
          if (!entry) continue;
          try {
            await options.manager.operations.removeEntry(entry);
            results[index] = { status: "fulfilled", value: undefined };
          } catch (reason) {
            results[index] = { status: "rejected", reason };
          }
        }
      })
    );
    return results;
  }

  async function confirmAlert(): Promise<void> {
    const target = alertTarget.value;
    const entry = target?.entries[0];
    if (!target || !entry) return;
    if (target.kind === "download") {
      if (
        await runFileOperation(
          () => options.manager.operations.downloadEntry(entry),
          t("koko.fileManagement.entryDownloaded", { name: entry.name })
        )
      )
        alertOpen.value = false;
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
      options.updateSelection(failedEntries);
      alertOpen.value = false;
    }
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected")
      addErrorToast({ title: t("koko.fileManagement.operationFailed"), error: failure.reason });
  }

  async function uploadFromEvent(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files || [])];
    input.value = "";
    if (!files.length) return;
    const results = await Promise.allSettled(files.map((file) => options.manager.operations.uploadFile(file)));
    const success = results.filter((result) => result.status === "fulfilled").length;
    if (success) {
      toast.add({
        title: t(
          success === files.length ? "koko.fileManagement.uploadedFiles" : "koko.fileManagement.uploadedFilesPartial",
          { success, total: files.length, count: success }
        ),
        color: success === files.length ? "success" : "warning"
      });
      await refreshCurrentDirectory();
    }
    if (success !== files.length) {
      const failure = results.find((result) => result.status === "rejected");
      addErrorToast({
        title: t("koko.fileManagement.operationFailed"),
        error: failure?.status === "rejected" ? failure.reason : ""
      });
    }
  }

  return {
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
    rename,
    requestDelete,
    downloadSelected,
    submitPrompt,
    confirmAlert,
    uploadFromEvent,
    refreshCurrentDirectory
  };
}
