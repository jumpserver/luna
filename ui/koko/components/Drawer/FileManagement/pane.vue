<script setup lang="ts">
import type { ConnectorSessionContext } from "~/shared/connectors/types/session";
import type { SftpFileEntry } from "~/koko/composables/useSftpFileManager";
import { useSftpFileManager } from "~/koko/composables/useSftpFileManager";

const props = defineProps<{
  context: ConnectorSessionContext | null
  title?: string
}>();

const emit = defineEmits<{
  select: [entry: SftpFileEntry | null]
}>();

const { t } = useI18n();
const contextRef = computed(() => props.context);
const manager = useSftpFileManager(contextRef);
const search = ref("");
const uploadInput = ref<HTMLInputElement | null>(null);
const selectedEntry = ref<SftpFileEntry | null>(null);

const visibleEntries = computed(() =>
  manager.entries.value.filter((entry) => entry.name.toLowerCase().includes(search.value.toLowerCase()))
);

watch(selectedEntry, (entry) => emit("select", entry));

const selectEntry = (entry: SftpFileEntry) => {
  if (entry.name === "..") return;
  selectedEntry.value = entry;
};

const createFolder = () => {
  // eslint-disable-next-line no-alert -- compact native prompt keeps the file workflow self-contained
  const name = window.prompt(t("NewFolder") || "New folder");
  if (name?.trim()) manager.createDirectory(name.trim());
};

const rename = (entry: SftpFileEntry) => {
  // eslint-disable-next-line no-alert -- compact native prompt keeps the file workflow self-contained
  const name = window.prompt(t("Rename") || "Rename", entry.name);
  if (name?.trim() && name !== entry.name) manager.renameEntry(entry, name.trim());
};

const remove = (entry: SftpFileEntry) => {
  // eslint-disable-next-line no-alert -- destructive action requires explicit confirmation
  if (window.confirm(`${t("Delete") || "Delete"} ${entry.name}?`)) manager.removeEntry(entry);
};

const downloadSelected = () => {
  const entry = selectedEntry.value;
  if (!entry) return;
  if (entry.is_dir) {
    // eslint-disable-next-line no-alert -- confirm before downloading folders
    if (!window.confirm(t("FileManagement.DownloadFolderConfirm") || "Download this folder?")) return;
  }
  manager.downloadEntry(entry);
};

const uploadFromEvent = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) await manager.uploadFile(file);
  (event.target as HTMLInputElement).value = "";
};

defineExpose({ manager, selectedEntry });
</script>

<template>
  <div v-if="manager.error.value" class="grid h-full place-items-center p-4 text-sm text-muted">
    <div class="flex flex-col items-center gap-2 text-center">
      <UIcon name="i-lucide-circle-alert" class="size-6" />
      <p>{{ manager.error.value }}</p>
      <UButton size="xs" @click="manager.reconnect()">
        {{ t("Reconnect") }}
      </UButton>
    </div>
  </div>
  <div v-else class="flex h-full min-h-0 flex-col">
    <div v-if="title" class="border-b border-default px-2 py-1 text-[11px] font-medium text-muted">
      {{ title }}
    </div>
    <div class="flex shrink-0 flex-wrap items-center gap-1 border-b border-default p-2">
      <UButton
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        size="xs"
        :disabled="manager.currentPath.value === '/'"
        @click="manager.changeDirectory({ name: '..', is_dir: true } as SftpFileEntry)"
      />
      <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="xs" @click="manager.list()" />
      <div class="min-w-0 flex-1 truncate rounded bg-elevated px-2 py-1 font-ui-mono text-[11px]">
        {{ manager.currentPath.value || "/" }}
      </div>
      <UInput v-model="search" icon="i-lucide-search" size="xs" class="w-28 min-w-0" />
      <UButton
        icon="i-lucide-download"
        color="neutral"
        variant="soft"
        size="xs"
        :disabled="!selectedEntry"
        :title="t('Download') || 'Download'"
        @click="downloadSelected"
      />
      <UButton icon="i-lucide-folder-plus" color="neutral" variant="ghost" size="xs" @click="createFolder" />
      <UButton icon="i-lucide-upload" color="primary" variant="soft" size="xs" @click="uploadInput?.click()" />
      <input ref="uploadInput" type="file" class="hidden" @change="uploadFromEvent">
    </div>
    <div v-if="manager.uploadProgress.value > 0 && manager.uploadProgress.value < 100" class="px-2 py-1 text-[11px] text-muted">
      {{ t("UploadProgress") }}: {{ manager.uploadProgress.value }}%
    </div>
    <div v-if="manager.loading.value" class="grid flex-1 place-items-center">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
    </div>
    <div v-else class="min-h-0 flex-1 overflow-auto">
      <div class="grid grid-cols-[minmax(0,1fr)_64px_88px] border-b border-default px-2 py-1.5 text-[10px] text-muted">
        <span>{{ t("Name") }}</span><span>{{ t("Size") }}</span><span />
      </div>
      <div
        v-for="entry in visibleEntries"
        :key="entry.name"
        class="group grid grid-cols-[minmax(0,1fr)_64px_88px] items-center border-b border-default/60 px-2 py-1 text-xs hover:bg-elevated"
        :class="selectedEntry?.name === entry.name && entry.name !== '..' ? 'bg-primary/8' : ''"
        @click="selectEntry(entry)"
      >
        <button class="flex min-w-0 items-center gap-2 text-left" @dblclick.stop="entry.is_dir && manager.changeDirectory(entry)">
          <UIcon :name="entry.is_dir ? 'i-lucide-folder' : 'i-lucide-file'" class="size-4 shrink-0" />
          <span class="truncate">{{ entry.name }}</span>
        </button>
        <span class="text-muted">{{ entry.is_dir ? "—" : entry.size }}</span>
        <div v-if="entry.name !== '..'" class="flex justify-end opacity-0 group-hover:opacity-100">
          <UButton icon="i-lucide-download" size="xs" color="neutral" variant="ghost" @click.stop="manager.downloadEntry(entry)" />
          <UButton icon="i-lucide-pencil" size="xs" color="neutral" variant="ghost" @click.stop="rename(entry)" />
          <UButton icon="i-lucide-trash-2" size="xs" color="error" variant="ghost" @click.stop="remove(entry)" />
        </div>
      </div>
    </div>
  </div>
</template>
