<script setup lang="ts">
import type { ConnectorSessionContext } from "@jumpserver/connectors-core";
import type { SftpFileEntry } from "#koko/composables/sftp/useSftpFileManager";
import { useSftpFileManager } from "#koko/composables/sftp/useSftpFileManager";

const props = defineProps<{
  context: ConnectorSessionContext | null;
  title?: string;
}>();

const emit = defineEmits<{
  select: [entry: SftpFileEntry | null];
}>();

const { t } = useI18n();
const contextRef = computed(() => props.context);
const manager = useSftpFileManager(contextRef);
const search = ref("");
const uploadInput = ref<HTMLInputElement | null>(null);
const selectedEntry = ref<SftpFileEntry | null>(null);
const promptOpen = ref(false);
const promptName = ref("");
const promptTarget = ref<SftpFileEntry | null>(null);
const alertOpen = ref(false);
const alertTarget = ref<{ kind: "delete" | "download"; entry: SftpFileEntry } | null>(null);

const visibleEntries = computed(() =>
  manager.entries.value.filter((entry) => entry.name.toLowerCase().includes(search.value.toLowerCase()))
);
const promptTitle = computed(() =>
  promptTarget.value ? t("koko.actions.rename") : t("koko.fileManagement.newFolder")
);
const promptConfirmLabel = computed(() => (promptTarget.value ? t("koko.actions.rename") : t("koko.actions.confirm")));
const promptDisabled = computed(() => {
  const name = promptName.value.trim();
  return !name || (promptTarget.value !== null && name === promptTarget.value.name);
});
const alertTitle = computed(() =>
  alertTarget.value?.kind === "delete" ? t("koko.actions.delete") : t("koko.actions.download")
);
const alertDescription = computed(() => {
  if (!alertTarget.value) return "";
  if (alertTarget.value.kind === "delete") return t("koko.fileManagement.deleteConfirm", { name: alertTarget.value.entry.name });
  return t("koko.fileManagement.downloadFolderConfirm");
});

watch(selectedEntry, (entry) => emit("select", entry));

const selectEntry = (entry: SftpFileEntry) => {
  if (entry.name === "..") return;
  selectedEntry.value = entry;
};

const createFolder = () => {
  promptTarget.value = null;
  promptName.value = "";
  promptOpen.value = true;
};

const rename = (entry: SftpFileEntry) => {
  promptTarget.value = entry;
  promptName.value = entry.name;
  promptOpen.value = true;
};

const remove = (entry: SftpFileEntry) => {
  alertTarget.value = { kind: "delete", entry };
  alertOpen.value = true;
};

const downloadSelected = () => {
  const entry = selectedEntry.value;
  if (!entry) return;
  if (entry.is_dir) {
    alertTarget.value = { kind: "download", entry };
    alertOpen.value = true;
    return;
  }
  void manager.operations.downloadEntry(entry);
};

const submitPrompt = () => {
  const name = promptName.value.trim();
  const target = promptTarget.value;
  if (!name || (target && name === target.name)) return;
  if (target) void manager.operations.renameEntry(target, name);
  else void manager.operations.createDirectory(name);
  promptOpen.value = false;
};

const confirmAlert = () => {
  const target = alertTarget.value;
  if (!target) return;
  if (target.kind === "delete") void manager.operations.removeEntry(target.entry);
  else void manager.operations.downloadEntry(target.entry);
  alertOpen.value = false;
};

const uploadFromEvent = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files || [])];
  input.value = "";
  if (!files.length) return;
  await Promise.allSettled(files.map((file) => manager.operations.uploadFile(file)));
};

defineExpose({ manager, selectedEntry });
</script>

<template>
  <div
    v-if="manager.error.value"
    class="grid h-full place-items-center bg-(--app-main-bg) p-4 text-sm text-(--app-muted)"
  >
    <div class="flex flex-col items-center gap-2 text-center">
      <UIcon name="i-lucide-circle-alert" class="size-6" />
      <p>{{ manager.error.value }}</p>
      <UButton size="xs" @click="manager.retry.reconnect()">
        {{ t("koko.fileManagement.reconnect") }}
      </UButton>
    </div>
  </div>
  <div v-else class="flex h-full min-h-0 flex-col bg-(--app-main-bg) text-(--app-fg)">
    <div
      v-if="title"
      class="border-b border-(--app-border) bg-(--app-panel-bg) px-2 py-1 text-[11px] font-medium text-(--app-muted)"
    >
      {{ title }}
    </div>
    <div
      class="flex shrink-0 flex-wrap items-center gap-1 border-b border-(--app-border) bg-(--app-panel-bg) p-2"
    >
      <UButton
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        size="xs"
        :disabled="manager.currentPath.value === '/'"
        @click="manager.changeDirectory({ name: '..', is_dir: true } as SftpFileEntry)"
      />
      <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="xs" @click="manager.loadCurrentDirectory()" />
      <div
        class="min-w-0 flex-1 truncate rounded bg-(--app-hover-soft) px-2 py-1 font-ui-mono text-[11px] text-(--app-fg)"
      >
        {{ manager.currentPath.value || "/" }}
      </div>
      <UInput v-model="search" icon="i-lucide-search" size="xs" class="w-28 min-w-0" />
      <UButton
        icon="i-lucide-download"
        color="neutral"
        variant="soft"
        size="xs"
        :disabled="!selectedEntry"
        :title="t('koko.actions.download')"
        @click="downloadSelected"
      />
      <UButton icon="i-lucide-folder-plus" color="neutral" variant="ghost" size="xs" @click="createFolder" />
      <UButton icon="i-lucide-upload" color="primary" variant="soft" size="xs" @click="uploadInput?.click()" />
      <input ref="uploadInput" type="file" multiple class="hidden" @change="uploadFromEvent" />
    </div>
    <div v-if="manager.currentUploadName.value" class="border-b border-(--app-border) px-2 py-2">
      <div class="mb-1 flex items-center justify-between gap-2 text-[11px] text-(--app-muted)">
        <span class="truncate">{{ manager.currentUploadName.value }}</span>
        <span>{{ manager.uploadProgress.value }}%</span>
      </div>
      <div class="flex items-center gap-2">
        <UProgress :value="manager.uploadProgress.value" size="xs" class="flex-1" />
        <span v-if="manager.queuedUploadCount.value" class="shrink-0 text-[11px] text-(--app-muted)">
          +{{ manager.queuedUploadCount.value }}
        </span>
      </div>
    </div>
    <div v-if="manager.loading.value" class="grid flex-1 place-items-center">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
    </div>
    <div v-else class="min-h-0 flex-1 overflow-auto bg-(--app-main-bg)">
      <div
        class="grid grid-cols-[minmax(0,1fr)_64px_88px] border-b border-(--app-border) bg-(--app-panel-bg) px-2 py-1.5 text-[10px] text-(--app-muted)"
      >
        <span>{{ t("koko.fileManagement.name") }}</span>
        <span>{{ t("koko.fileManagement.size") }}</span>
        <span />
      </div>
      <div
        v-for="entry in visibleEntries"
        :key="entry.name"
        class="group grid grid-cols-[minmax(0,1fr)_64px_88px] items-center border-b border-(--app-border)/60 px-2 py-1 text-xs text-(--app-fg) hover:bg-(--app-hover-soft)"
        :class="selectedEntry?.name === entry.name && entry.name !== '..' ? 'bg-(--app-selected-soft)' : ''"
        @click="selectEntry(entry)"
      >
        <button
          class="flex min-w-0 items-center gap-2 text-left"
          @dblclick.stop="entry.is_dir && manager.changeDirectory(entry)"
        >
          <UIcon :name="entry.is_dir ? 'i-lucide-folder' : 'i-lucide-file'" class="size-4 shrink-0" />
          <span class="truncate">{{ entry.name }}</span>
        </button>
        <span class="text-(--app-muted)">{{ entry.is_dir ? "—" : entry.size }}</span>
        <div v-if="entry.name !== '..'" class="flex justify-end opacity-0 group-hover:opacity-100">
          <UButton
            icon="i-lucide-download"
            size="xs"
            color="neutral"
            variant="ghost"
            @click.stop="manager.operations.downloadEntry(entry)"
          />
          <UButton icon="i-lucide-pencil" size="xs" color="neutral" variant="ghost" @click.stop="rename(entry)" />
          <UButton icon="i-lucide-trash-2" size="xs" color="error" variant="ghost" @click.stop="remove(entry)" />
        </div>
      </div>
    </div>
    <ModalPromptDialog
      v-model:open="promptOpen"
      v-model="promptName"
      :title="promptTitle"
      :confirm-label="promptConfirmLabel"
      :disabled="promptDisabled"
      @confirm="submitPrompt"
    />
    <ModalAlertDialog
      v-model:open="alertOpen"
      :title="alertTitle"
      :description="alertDescription"
      :confirm-label="alertTitle"
      :confirm-color="alertTarget?.kind === 'delete' ? 'error' : 'primary'"
      @confirm="confirmAlert"
    />
  </div>
</template>
