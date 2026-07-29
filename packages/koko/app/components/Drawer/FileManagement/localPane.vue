<script setup lang="ts">
import type { SftpFileEntry } from "#koko/composables/useSftpFileManager";

const emit = defineEmits<{ select: [entry: SftpFileEntry | null] }>();
const LOCAL_ROOT_STORAGE_KEY = "jumpserver-client:file-manager-local-root";
const { t } = useI18n();

const entries = ref<SftpFileEntry[]>([]);
const currentPath = ref("");
const rootPath = ref("");
const loading = ref(true);
const error = ref("");
const setupOpen = ref(false);
const selectedEntry = ref<SftpFileEntry | null>(null);
const uploadInput = ref<HTMLInputElement | null>(null);
const activeScopedPath = ref("");

const isPermissionError = computed(() =>
  /forbidden path|not allowed on the scope|permission|operation not permitted/i.test(error.value)
);

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
    if (targetPath === activeScopedPath.value) {
      activeScopedPath.value = "";
    }
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
    // Some platforms and unsigned/dev builds do not expose security-scoped
    // access; continue and let the regular fs call decide.
  }
}

async function resolveInitialRoot() {
  const { path } = await fsModules();
  return loadSavedRoot() || (await path.homeDir());
}

async function list(path?: string) {
  if (!isTauriRuntime()) return;
  loading.value = true;
  error.value = "";
  try {
    const { fs, path: pathApi } = await fsModules();
    if (!rootPath.value) {
      rootPath.value = await resolveInitialRoot();
    }
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
    if (isPermissionError.value) {
      setupOpen.value = true;
    }
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
  selectedEntry.value = null;
}

async function readFile(entry: SftpFileEntry) {
  const { fs } = await fsModules();
  return new Blob([await fs.readFile(await entryPath(entry))]);
}

async function uploadBlob(fileName: string, blob: Blob) {
  const { fs, path } = await fsModules();
  await fs.writeFile(await path.join(currentPath.value, fileName), new Uint8Array(await blob.arrayBuffer()));
  await list();
}

async function uploadFromEvent(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) await uploadBlob(file.name, file);
  (event.target as HTMLInputElement).value = "";
}

async function chooseFolder() {
  try {
    const selected = (await useTauriDialogOpen({
      directory: true,
      multiple: false,
      title: t("koko.localFile.chooseFolder")
    })) as string | null;

    if (!selected) return;

    rootPath.value = selected;
    currentPath.value = selected;
    saveRoot(selected);
    setupOpen.value = false;
    await activateSecurityScope(selected);
    await list(selected);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}

async function resetToDefaultRoot() {
  const { path } = await fsModules();
  const home = await path.homeDir();
  clearRoot();
  rootPath.value = home;
  currentPath.value = home;
  setupOpen.value = false;
  await list(home);
}

function openSetup() {
  setupOpen.value = true;
}

function closeSetup() {
  setupOpen.value = false;
}

function selectEntry(entry: SftpFileEntry) {
  if (entry.name === "..") return;
  selectedEntry.value = entry;
}

watch(selectedEntry, (entry) => emit("select", entry));
onMounted(() => list());
onBeforeUnmount(() => {
  void releaseSecurityScope();
});

const manager = { readFile, uploadBlob };
defineExpose({ manager, selectedEntry });
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-(--app-main-bg)">
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
      <UButton icon="i-lucide-folder-cog" color="neutral" variant="ghost" size="xs" @click="openSetup" />
      <UButton icon="i-lucide-upload" color="primary" variant="soft" size="xs" @click="uploadInput?.click()" />
      <input ref="uploadInput" type="file" class="hidden" @change="uploadFromEvent" />
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
              {{
                isPermissionError
                  ? t("koko.localFile.permissionHint")
                  : error
              }}
            </p>
            <p
              v-if="isPermissionError"
              class="break-all rounded-md bg-default/70 px-2 py-1 font-ui-mono text-[11px] text-muted"
            >
              {{ error }}
            </p>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton size="sm" color="primary" icon="i-lucide-folder-open" @click="chooseFolder">{{ t("koko.localFile.chooseFolder") }}</UButton>
          <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-house" @click="resetToDefaultRoot">
            {{ t("koko.localFile.resetDefault") }}
          </UButton>
          <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-refresh-cw" @click="list()">{{ t("koko.actions.retry") }}</UButton>
        </div>
      </div>
    </div>
    <div v-else-if="loading" class="grid flex-1 place-items-center">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
    </div>
    <div v-else class="min-h-0 flex-1 overflow-auto">
      <button
        v-for="entry in entries"
        :key="entry.name"
        type="button"
        class="grid w-full grid-cols-[minmax(0,1fr)_80px] items-center border-b border-default/60 px-2 py-1.5 text-left text-xs hover:bg-(--app-hover-soft)"
        :class="selectedEntry?.name === entry.name && entry.name !== '..' ? 'bg-(--app-selected-soft)' : ''"
        @click="selectEntry(entry)"
        @dblclick="entry.is_dir && changeDirectory(entry)"
      >
        <span class="flex min-w-0 items-center gap-2">
          <UIcon :name="entry.is_dir ? 'i-lucide-folder' : 'i-lucide-file'" class="size-4 shrink-0" />
          <span class="truncate">{{ entry.name }}</span>
        </span>
        <span class="text-right text-muted">{{ entry.is_dir ? "—" : entry.size }}</span>
      </button>
    </div>

    <UModal v-model:open="setupOpen" :title="t('koko.localFile.title')" :ui="{ content: 'max-w-lg' }">
      <template #body>
        <div class="space-y-4 text-sm">
          <div class="rounded-xl border border-default bg-elevated/60 p-4">
            <p class="font-medium text-highlighted">{{ t("koko.localFile.setupDescription") }}</p>
            <p class="mt-2 leading-6 text-muted">
              {{ t("koko.localFile.setupHint") }}
            </p>
          </div>
          <div class="space-y-2 rounded-xl border border-default/80 p-4">
            <p class="font-medium text-highlighted">{{ t("koko.localFile.recommendedSteps") }}</p>
            <ol class="list-decimal space-y-1 pl-5 text-muted">
              <li>{{ t("koko.localFile.stepChooseFolder") }}</li>
              <li>{{ t("koko.localFile.stepSelectDirectory") }}</li>
              <li>{{ t("koko.localFile.stepResetDefault") }}</li>
            </ol>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full flex-wrap justify-end gap-2">
          <UButton color="neutral" variant="outline" @click="closeSetup">{{ t("koko.actions.close") }}</UButton>
          <UButton color="neutral" variant="soft" icon="i-lucide-house" @click="resetToDefaultRoot">
            {{ t("koko.localFile.resetDefault") }}
          </UButton>
          <UButton color="primary" icon="i-lucide-folder-open" @click="chooseFolder">{{ t("koko.localFile.chooseFolder") }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
