<script setup lang="ts">
import type { ConnectorSessionContext } from "~/shared/connectors/types/session";
import { useSftpFileManager } from "~/koko/composables/useSftpFileManager";
import { connectorSessionKey } from "~/koko/composables/wsUrl";

const props = defineProps<{
  sftpToken?: string
  showEmpty?: boolean
}>();

const emit = defineEmits<{ reconnect: [] }>();
const { t } = useI18n();
const providedContext = inject(connectorSessionKey, ref(null));
const context = computed<ConnectorSessionContext | null>(() => {
  const value = unref(providedContext);
  if (!value || !props.sftpToken) return null;
  return { ...value, tokenId: props.sftpToken };
});
const manager = useSftpFileManager(context);
const search = ref("");
const uploadInput = ref<HTMLInputElement | null>(null);
const visibleEntries = computed(() => manager.entries.value.filter((entry) => entry.name.toLowerCase().includes(search.value.toLowerCase())));

const createFolder = () => {
  // eslint-disable-next-line no-alert -- compact native prompt keeps the file workflow self-contained
  const name = window.prompt(t("NewFolder") || "New folder");
  if (name?.trim()) manager.createDirectory(name.trim());
};
const rename = (entry: any) => {
  // eslint-disable-next-line no-alert -- compact native prompt keeps the file workflow self-contained
  const name = window.prompt(t("Rename") || "Rename", entry.name);
  if (name?.trim() && name !== entry.name) manager.renameEntry(entry, name.trim());
};
const remove = (entry: any) => {
  // eslint-disable-next-line no-alert -- destructive action requires explicit confirmation
  if (window.confirm(`${t("Delete") || "Delete"} ${entry.name}?`)) manager.removeEntry(entry);
};
const upload = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) await manager.uploadFile(file);
  (event.target as HTMLInputElement).value = "";
};
</script>

<template>
  <div v-if="showEmpty || manager.error.value" class="grid h-full place-items-center p-6 text-sm text-muted">
    <div class="flex flex-col items-center gap-3">
      <UIcon name="i-lucide-circle-alert" class="size-7" /><p>{{ manager.error.value || t("FileManagerExpired") }}</p><UButton size="sm" @click="manager.reconnect(); emit('reconnect')">
        {{ t("Reconnect") }}
      </UButton>
    </div>
  </div>
  <div v-else class="flex h-full min-h-0 flex-col">
    <div class="flex shrink-0 items-center gap-2 border-b border-default p-2">
      <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" size="xs" :disabled="manager.currentPath.value === '/'" @click="manager.changeDirectory({ name: '..', is_dir: true } as any)" />
      <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="xs" @click="manager.list()" />
      <div class="min-w-0 flex-1 truncate rounded bg-elevated px-2 py-1 font-ui-mono text-[11px]">
        {{ manager.currentPath.value || "/" }}
      </div>
      <UInput v-model="search" icon="i-lucide-search" size="xs" class="w-36" />
      <UButton icon="i-lucide-folder-plus" color="neutral" variant="ghost" size="xs" @click="createFolder" />
      <UButton icon="i-lucide-upload" color="primary" variant="soft" size="xs" @click="uploadInput?.click()" />
      <input ref="uploadInput" type="file" class="hidden" @change="upload">
    </div>
    <div v-if="manager.uploadProgress.value > 0 && manager.uploadProgress.value < 100" class="px-3 py-1 text-[11px] text-muted">
      {{ t("UploadProgress") }}: {{ manager.uploadProgress.value }}%
    </div>
    <div v-if="manager.loading.value" class="grid flex-1 place-items-center">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
    </div>
    <div v-else class="min-h-0 flex-1 overflow-auto">
      <div class="grid grid-cols-[minmax(0,1fr)_80px_96px] border-b border-default px-3 py-2 text-[11px] text-muted">
        <span>{{ t("Name") }}</span><span>{{ t("Size") }}</span><span />
      </div>
      <div v-for="entry in visibleEntries" :key="entry.name" class="group grid grid-cols-[minmax(0,1fr)_80px_96px] items-center border-b border-default/60 px-3 py-1.5 text-xs hover:bg-elevated">
        <button class="flex min-w-0 items-center gap-2 text-left" @dblclick="entry.is_dir && manager.changeDirectory(entry)">
          <UIcon :name="entry.is_dir ? 'i-lucide-folder' : 'i-lucide-file'" class="size-4 shrink-0" /><span class="truncate">{{ entry.name }}</span>
        </button>
        <span class="text-muted">{{ entry.is_dir ? "—" : entry.size }}</span>
        <div v-if="entry.name !== '..'" class="flex justify-end opacity-0 group-hover:opacity-100">
          <UButton icon="i-lucide-download" size="xs" color="neutral" variant="ghost" @click="manager.downloadEntry(entry)" /><UButton icon="i-lucide-pencil" size="xs" color="neutral" variant="ghost" @click="rename(entry)" /><UButton icon="i-lucide-trash-2" size="xs" color="error" variant="ghost" @click="remove(entry)" />
        </div>
      </div>
    </div>
  </div>
</template>
