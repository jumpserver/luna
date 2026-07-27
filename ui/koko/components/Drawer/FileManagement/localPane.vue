<script setup lang="ts">
import type { SftpFileEntry } from "~/koko/composables/useSftpFileManager";

const emit = defineEmits<{ select: [entry: SftpFileEntry | null] }>();

const entries = ref<SftpFileEntry[]>([]);
const currentPath = ref("");
const rootPath = ref("");
const loading = ref(true);
const error = ref("");
const selectedEntry = ref<SftpFileEntry | null>(null);
const uploadInput = ref<HTMLInputElement | null>(null);

async function fsModules() {
  const [fs, path] = await Promise.all([
    import("@tauri-apps/plugin-fs"),
    import("@tauri-apps/api/path")
  ]);
  return { fs, path };
}

async function list(path?: string) {
  if (!isTauriRuntime()) return;
  loading.value = true;
  error.value = "";
  try {
    const { fs, path: pathApi } = await fsModules();
    rootPath.value ||= await pathApi.downloadDir();
    currentPath.value = path || currentPath.value || rootPath.value;
    const items = await fs.readDir(currentPath.value);
    entries.value = await Promise.all(items.map(async (item) => {
      const fullPath = await pathApi.join(currentPath.value, item.name);
      const info = await fs.stat(fullPath);
      return {
        name: item.name,
        size: info.isFile ? String(info.size) : "",
        perm: "",
        mod_time: info.mtime?.toISOString() || "",
        type: "",
        is_dir: info.isDirectory
      };
    }));
    if (currentPath.value !== rootPath.value) {
      entries.value.unshift({ name: "..", size: "", perm: "", mod_time: "", type: "", is_dir: true });
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
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

watch(selectedEntry, (entry) => emit("select", entry));
onMounted(() => list());

const manager = { readFile, uploadBlob };
defineExpose({ manager, selectedEntry });
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-[var(--app-main-bg)]">
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
      <div class="min-w-0 flex-1 truncate rounded bg-[var(--app-hover-soft)] px-2 py-1 font-ui-mono text-[11px]">
        {{ currentPath || "Downloads" }}
      </div>
      <UButton icon="i-lucide-upload" color="primary" variant="soft" size="xs" @click="uploadInput?.click()" />
      <input ref="uploadInput" type="file" class="hidden" @change="uploadFromEvent">
    </div>
    <div v-if="error" class="grid flex-1 place-items-center p-4 text-sm text-error">
      {{ error }}
    </div>
    <div v-else-if="loading" class="grid flex-1 place-items-center">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
    </div>
    <div v-else class="min-h-0 flex-1 overflow-auto">
      <button
        v-for="entry in entries"
        :key="entry.name"
        type="button"
        class="grid w-full grid-cols-[minmax(0,1fr)_80px] items-center border-b border-default/60 px-2 py-1.5 text-left text-xs hover:bg-[var(--app-hover-soft)]"
        :class="selectedEntry?.name === entry.name && entry.name !== '..' ? 'bg-[var(--app-selected-soft)]' : ''"
        @click="entry.name !== '..' && (selectedEntry = entry)"
        @dblclick="entry.is_dir && changeDirectory(entry)"
      >
        <span class="flex min-w-0 items-center gap-2">
          <UIcon :name="entry.is_dir ? 'i-lucide-folder' : 'i-lucide-file'" class="size-4 shrink-0" />
          <span class="truncate">{{ entry.name }}</span>
        </span>
        <span class="text-right text-muted">{{ entry.is_dir ? "—" : entry.size }}</span>
      </button>
    </div>
  </div>
</template>
