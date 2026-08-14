import type { SftpFileEntry } from "#koko/composables/sftp/useSftpFileManager";

const LOCAL_ROOT_STORAGE_KEY = "jumpserver-client:file-manager-local-root";

interface UseLocalFileManagerOptions {
  translate: (key: string) => string;
  onPermissionRequired?: () => void;
}

export function useLocalFileManager(options: UseLocalFileManagerOptions) {
  const entries = ref<SftpFileEntry[]>([]);
  const currentPath = ref("");
  const rootPath = ref("");
  const loading = ref(true);
  const error = ref("");
  const activeScopedPath = ref("");
  const quickPaths = ref<Array<{ key: string; label: string; path: string; icon: string }>>([]);

  const isPermissionError = computed(() =>
    /forbidden path|not allowed on the scope|permission|operation not permitted/i.test(error.value)
  );

  function loadSavedRoot(): string {
    if (!import.meta.client) return "";
    return globalThis.localStorage?.getItem(LOCAL_ROOT_STORAGE_KEY)?.trim() || "";
  }

  function saveRoot(path: string): void {
    if (!import.meta.client) return;
    globalThis.localStorage?.setItem(LOCAL_ROOT_STORAGE_KEY, path);
  }

  function clearRoot(): void {
    if (!import.meta.client) return;
    globalThis.localStorage?.removeItem(LOCAL_ROOT_STORAGE_KEY);
  }

  async function fsModules() {
    const [fs, path] = await Promise.all([import("@tauri-apps/plugin-fs"), import("@tauri-apps/api/path")]);
    return { fs, path };
  }

  async function releaseSecurityScope(targetPath = activeScopedPath.value): Promise<void> {
    if (!targetPath || !isTauriRuntime()) return;
    try {
      const { fs } = await fsModules();
      await fs.stopAccessingSecurityScopedResource?.(targetPath);
    } catch {
      // Scope release is best-effort during teardown and root changes.
    } finally {
      if (targetPath === activeScopedPath.value) activeScopedPath.value = "";
    }
  }

  async function activateSecurityScope(targetPath: string): Promise<void> {
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

  async function resolveInitialRoot(): Promise<string> {
    const { path } = await fsModules();
    return loadSavedRoot() || (await path.homeDir());
  }

  async function refreshQuickPaths(): Promise<void> {
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
      const next: typeof quickPaths.value = [];
      if (home)
        next.push({
          key: "home",
          label: options.translate("koko.localFile.quickHome"),
          path: home,
          icon: "i-lucide-house"
        });
      if (desktop)
        next.push({
          key: "desktop",
          label: options.translate("koko.localFile.quickDesktop"),
          path: desktop,
          icon: "i-lucide-monitor"
        });
      if (download)
        next.push({
          key: "download",
          label: options.translate("koko.localFile.quickDownload"),
          path: download,
          icon: "i-lucide-download"
        });
      quickPaths.value = next;
    } catch {
      quickPaths.value = [];
    }
  }

  async function list(path?: string): Promise<void> {
    if (!isTauriRuntime()) return;
    loading.value = true;
    error.value = "";
    try {
      const { fs, path: pathApi } = await fsModules();
      if (!rootPath.value) rootPath.value = await resolveInitialRoot();
      const targetPath = path || currentPath.value || rootPath.value;
      await activateSecurityScope(rootPath.value || targetPath);
      const items = await fs.readDir(targetPath);
      const nextEntries = await Promise.all(
        items.map(async (item) => {
          const fullPath = await pathApi.join(targetPath, item.name);
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
      if (targetPath !== rootPath.value) {
        nextEntries.unshift({ name: "..", size: "", perm: "", mod_time: "", type: "", is_dir: true });
      }
      // Commit path + rows in the same tick so the table never paints a mixed state.
      currentPath.value = targetPath;
      entries.value = nextEntries;
      saveRoot(rootPath.value);
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      if (!currentPath.value && !rootPath.value) {
        rootPath.value = await resolveInitialRoot().catch(() => "");
      }
      if (isPermissionError.value) options.onPermissionRequired?.();
    } finally {
      loading.value = false;
    }
  }

  async function entryPath(entry: SftpFileEntry): Promise<string> {
    const { path } = await fsModules();
    return path.join(currentPath.value, entry.name);
  }

  async function changeDirectory(entry: SftpFileEntry): Promise<void> {
    const { path } = await fsModules();
    await list(entry.name === ".." ? await path.dirname(currentPath.value) : await entryPath(entry));
  }

  async function goToPath(target: string): Promise<void> {
    if (!target) return;
    rootPath.value = target;
    saveRoot(target);
    await activateSecurityScope(target);
    await list(target);
  }

  async function readFile(entry: SftpFileEntry, targetPath?: string): Promise<Blob> {
    const { fs } = await fsModules();
    const fullPath = targetPath || (await entryPath(entry));
    return new Blob([await fs.readFile(fullPath)]);
  }

  async function uploadBlob(fileName: string, blob: Blob, targetPath?: string): Promise<void> {
    const { fs, path } = await fsModules();
    const fullPath = targetPath || (await path.join(currentPath.value, fileName));
    await fs.writeFile(fullPath, new Uint8Array(await blob.arrayBuffer()));
    await list();
  }

  async function createDirectory(name: string): Promise<void> {
    const { fs, path } = await fsModules();
    await fs.mkdir(await path.join(currentPath.value, name));
    await list();
  }

  async function createFileAt(name: string): Promise<void> {
    await uploadBlob(name, new Blob([""]));
  }

  async function renameEntry(entry: SftpFileEntry, nextName: string): Promise<void> {
    const { fs, path } = await fsModules();
    await fs.rename(await entryPath(entry), await path.join(currentPath.value, nextName));
    await list();
  }

  async function removeEntry(entry: SftpFileEntry): Promise<void> {
    const { fs } = await fsModules();
    const fullPath = await entryPath(entry);
    if (entry.is_dir) await fs.remove(fullPath, { recursive: true });
    else await fs.remove(fullPath);
  }

  async function uploadFromEvent(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files || [])];
    input.value = "";
    for (const file of files) await uploadBlob(file.name, file);
  }

  async function chooseFolder(): Promise<boolean> {
    const selected = (await useTauriDialogOpen({
      directory: true,
      multiple: false,
      title: options.translate("koko.localFile.chooseFolder")
    })) as string | null;
    if (!selected) return false;
    await goToPath(selected);
    return true;
  }

  async function resetToDefaultRoot(): Promise<void> {
    const { path } = await fsModules();
    clearRoot();
    await goToPath(await path.homeDir());
  }

  async function revealInSystem(entry?: SftpFileEntry | null): Promise<void> {
    if (!isTauriRuntime()) return;
    const target = entry && entry.name !== ".." ? await entryPath(entry) : currentPath.value;
    const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
    await revealItemInDir(target);
  }

  return {
    entries,
    currentPath,
    rootPath,
    loading,
    error,
    quickPaths,
    isPermissionError,
    list,
    changeDirectory,
    goToPath,
    readFile,
    uploadBlob,
    createDirectory,
    createFileAt,
    renameEntry,
    removeEntry,
    uploadFromEvent,
    chooseFolder,
    resetToDefaultRoot,
    revealInSystem,
    refreshQuickPaths,
    releaseSecurityScope
  };
}
