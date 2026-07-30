<script setup lang="ts">
import type { ConnectorSessionContext } from "@jumpserver/connectors-core";
import type { SftpFileEntry } from "#koko/composables/sftp/useSftpFileManager";
import type { FileTransferEndpointRef } from "~/shared/file-transfer/types";
import prettyBytes from "pretty-bytes";

import { useSftpFileManager } from "#koko/composables/sftp/useSftpFileManager";
import { registerFileTransferEndpoint } from "~/shared/file-transfer/registry";
import { useFileTransferStore } from "~/store/modules/fileTransfer";

const props = defineProps<{
  context: ConnectorSessionContext | null;
  title?: string;
  transferEndpoint?: FileTransferEndpointRef;
}>();

const emit = defineEmits<{
  select: [entry: SftpFileEntry | null];
  transferDrop: [payload: SftpTransferDropPayload];
}>();

interface SftpTransferDropPayload {
  sourceEndpoint: FileTransferEndpointRef;
  sourcePath: string;
  entries: Array<Pick<SftpFileEntry, "name" | "size">>;
  destinationPath: string;
}

const { t } = useI18n();
const toast = useToast();
const { addErrorToast } = useErrorToast();
const contextRef = computed(() => props.context);
const manager = useSftpFileManager(contextRef, props.transferEndpoint);
const transferStore = useFileTransferStore();

let unregisterTransferEndpoint: (() => void) | undefined;

const search = ref("");
const uploadInput = ref<HTMLInputElement | null>(null);
const selectedEntry = ref<SftpFileEntry | null>(null);
const hoveredEntryName = ref<string | null>(null);

const promptOpen = ref(false);
const promptName = ref("");
const promptTarget = ref<SftpFileEntry | null>(null);
const promptKind = ref<"folder" | "file">("folder");

const alertOpen = ref(false);
const alertTarget = ref<{ kind: "delete" | "download"; entry: SftpFileEntry } | null>(null);

const visibleEntries = computed(() => {
  const query = search.value.toLowerCase();
  const entries = manager.entries.value.filter((entry) => entry.name.toLowerCase().includes(query));

  return entries.sort((left, right) => {
    if (left.name === "..") return -1;
    if (right.name === "..") return 1;
    return Number(right.is_dir) - Number(left.is_dir);
  });
});
const pathSegments = computed(() => manager.currentPath.value.split("/").filter(Boolean));

function navigateToPath(segmentIndex: number) {
  const path = segmentIndex < 0 ? "/" : `/${pathSegments.value.slice(0, segmentIndex + 1).join("/")}`;
  if (path === manager.currentPath.value) return;
  void manager.loadCurrentDirectory(path);
}

function formatFileSize(value: string) {
  const bytes = Number(value);
  return Number.isFinite(bytes) && bytes >= 0 ? prettyBytes(bytes) : value || "—";
}

function formatModifiedTime(value: string) {
  if (!value) return "—";
  const timestamp = Number(value);
  const date = Number.isFinite(timestamp)
    ? new Date(timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp)
    : new Date(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;

  const twoDigits = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())} ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

const promptTitle = computed(() =>
  promptTarget.value
    ? t("koko.actions.rename")
    : promptKind.value === "file"
      ? t("koko.fileManagement.newFile")
      : t("koko.fileManagement.newFolder")
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

watch(manager.connected, (connected) => {
  if (connected) transferStore.kick();
});

onMounted(() => {
  if (manager.transferEndpoint) unregisterTransferEndpoint = registerFileTransferEndpoint(manager.transferEndpoint);
});

onUnmounted(() => {
  unregisterTransferEndpoint?.();
  if (props.transferEndpoint) transferStore.pauseEndpoint(props.transferEndpoint);
});

const selectEntry = (entry: SftpFileEntry) => {
  if (entry.name === "..") return;
  selectedEntry.value = entry;
};

function isSelected(entry: SftpFileEntry) {
  return selectedEntry.value?.name === entry.name;
}

function onDragStart(event: DragEvent, entry: SftpFileEntry) {
  if (entry.is_dir || entry.name === ".." || !props.transferEndpoint) {
    event.preventDefault();
    return;
  }

  selectEntry(entry);

  const payload = {
    sourceEndpoint: props.transferEndpoint,
    sourcePath: manager.currentPath.value,
    entries: [{ name: entry.name, size: entry.size }]
  };

  event.dataTransfer?.setData("application/x-jumpserver-sftp-files", JSON.stringify(payload));
  event.dataTransfer?.setData("text/plain", payload.entries.map((item) => item.name).join("\n"));

  if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
}

function onTransferDrop(event: DragEvent) {
  const encoded = event.dataTransfer?.getData("application/x-jumpserver-sftp-files");
  if (!encoded) return;

  try {
    const payload = JSON.parse(encoded) as Omit<SftpTransferDropPayload, "destinationPath">;
    if (!payload.sourceEndpoint?.id || !payload.sourcePath || !Array.isArray(payload.entries) || !props.transferEndpoint) return;

    emit("transferDrop", { ...payload, destinationPath: manager.currentPath.value });
  } catch {
    // Ignore drops from an unrelated or malformed drag source.
  }
}

async function refreshCurrentDirectory() {
  const refreshed = await manager.loadCurrentDirectory();
  if (refreshed) return;
  addErrorToast({ title: t("koko.fileManagement.refreshFailed"), error: manager.error.value });
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

const createFolder = () => {
  promptTarget.value = null;
  promptKind.value = "folder";
  promptName.value = "";
  promptOpen.value = true;
};

const createFile = () => {
  promptTarget.value = null;
  promptKind.value = "file";
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

const downloadEntry = (entry: SftpFileEntry) => {
  void runFileOperation(
    () => manager.operations.downloadEntry(entry),
    t("koko.fileManagement.entryDownloaded", { name: entry.name })
  );
};

const downloadSelected = () => {
  const entry = selectedEntry.value;
  if (!entry) return;
  if (entry.is_dir) {
    alertTarget.value = { kind: "download", entry };
    alertOpen.value = true;
    return;
  }
  downloadEntry(entry);
};

const submitPrompt = async () => {
  const name = promptName.value.trim();
  const target = promptTarget.value;
  const isNewFile = promptKind.value === "file";
  if (!name || (target && name === target.name)) return;
  const success = await runFileOperation(
    () => {
      if (target) return manager.operations.renameEntry(target, name);
      if (isNewFile) {
        const directory = manager.currentPath.value.replace(/\/$/, "") || "/";
        return manager.operations.createFileAt(`${directory}/${name}`.replace(/\/+/g, "/"));
      }
      return manager.operations.createDirectory(name);
    },
    target
      ? t("koko.fileManagement.entryRenamed", { name })
      : isNewFile
        ? t("koko.fileManagement.fileCreated", { name })
        : t("koko.fileManagement.folderCreated", { name }),
    true
  );
  if (success) {
    selectedEntry.value = null;
    promptOpen.value = false;
  }
};

const confirmAlert = async () => {
  const target = alertTarget.value;
  if (!target) return;
  const success = target.kind === "delete"
    ? await runFileOperation(
        () => manager.operations.removeEntry(target.entry),
        t("koko.fileManagement.entryDeleted", { name: target.entry.name }),
        true
      )
    : await runFileOperation(
        () => manager.operations.downloadEntry(target.entry),
        t("koko.fileManagement.entryDownloaded", { name: target.entry.name })
      );
  if (success) {
    if (target.kind === "delete") selectedEntry.value = null;
    alertOpen.value = false;
  }
};

const uploadFromEvent = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files || [])];
  input.value = "";

  if (!files.length) return;

  const results = await Promise.allSettled(files.map((file) => manager.operations.uploadFile(file)));
  const success = results.filter((result) => result.status === "fulfilled").length;

  if (success) {
    toast.add({
      title:
        success === files.length
          ? t("koko.fileManagement.uploadedFiles", { count: success })
          : t("koko.fileManagement.uploadedFilesPartial", { success, total: files.length }),
      color: success === files.length ? "success" : "warning"
    });
    await refreshCurrentDirectory();
  }

  if (success !== files.length) {
    const failure = results.find((result) => result.status === "rejected");
    addErrorToast({
      title: t("koko.fileManagement.operationFailed"),
      error: failure && failure.status === "rejected" ? failure.reason : ""
    });
  }
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
      class="flex h-8 shrink-0 items-center border-b border-(--app-border) bg-(--app-header-bg) px-3 text-[11px] font-medium text-(--app-muted)"
    >
      {{ title }}
    </div>
    <div class="flex h-11.5 shrink-0 items-center gap-1.5 border-b border-(--app-border) bg-(--app-panel-bg) px-3">
      <UButton
        icon="i-lucide-chevron-left"
        color="neutral"
        variant="ghost"
        size="sm"
        :disabled="!manager.canGoBack.value"
        :title="t('koko.fileManagement.back')"
        @click="manager.goBack()"
      />
      <UButton
        icon="i-lucide-chevron-right"
        color="neutral"
        variant="ghost"
        size="sm"
        :disabled="!manager.canGoForward.value"
        :title="t('koko.fileManagement.forward')"
        @click="manager.goForward()"
      />
      <UButton
        icon="i-lucide-arrow-up"
        color="neutral"
        variant="ghost"
        size="sm"
        :disabled="manager.currentPath.value === '/'"
        :title="t('koko.drawer.up')"
        @click="manager.changeDirectory({ name: '..', is_dir: true } as SftpFileEntry)"
      />
      <UButton
        icon="i-lucide-house"
        color="neutral"
        variant="ghost"
        size="sm"
        :disabled="!manager.canGoHome.value"
        :title="t('koko.fileManagement.home')"
        @click="manager.goHome()"
      />
      <UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="ghost"
        size="sm"
        :title="t('koko.fileManagement.refresh')"
        @click="manager.loadCurrentDirectory()"
      />
      <div
        class="flex h-8 min-w-0 flex-1 items-center overflow-x-auto rounded-[3px] border border-(--app-border) bg-(--app-input-bg) px-1 font-ui-mono text-[12px] text-(--app-fg)"
      >
        <button
          type="button"
          class="shrink-0 rounded-[3px] px-1.5 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--app-focus-ring)"
          aria-label="/"
          :aria-current="pathSegments.length === 0 ? 'page' : undefined"
          @click="navigateToPath(-1)"
        >
          /
        </button>
        <template v-for="(segment, index) in pathSegments" :key="`${segment}:${index}`">
          <UIcon name="i-lucide-chevron-right" class="size-3 shrink-0 text-(--app-muted)" />
          <button
            type="button"
            class="shrink-0 rounded px-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--app-focus-ring)"
            :class="index === pathSegments.length - 1 ? 'font-semibold' : 'text-(--app-muted)'"
            :aria-label="`/${pathSegments.slice(0, index + 1).join('/')}`"
            :aria-current="index === pathSegments.length - 1 ? 'page' : undefined"
            @click="navigateToPath(index)"
          >
            {{ segment }}
          </button>
        </template>
      </div>
      <UInput
        v-model="search"
        icon="i-lucide-search"
        size="sm"
        :placeholder="t('koko.actions.search')"
        class="w-47.5 shrink-0 max-w-[38%]"
        :ui="{ base: 'h-8 text-[12px]' }"
      />
    </div>
    <div class="flex h-10.5 shrink-0 items-center justify-between gap-2 border-b border-(--app-border) bg-(--app-panel-bg) px-3">
      <div class="flex min-w-0 items-center gap-1.5">
        <UButton icon="i-lucide-folder-plus" color="neutral" variant="soft" size="xs" @click="createFolder">
          {{ t("koko.fileManagement.newFolder") }}
        </UButton>
        <UButton icon="i-lucide-file-plus-2" color="neutral" variant="soft" size="xs" @click="createFile">
          {{ t("koko.fileManagement.newFile") }}
        </UButton>
      </div>
      <div class="flex shrink-0 items-center gap-1.5">
        <UButton
          v-if="selectedEntry"
          icon="i-lucide-download"
          color="neutral"
          variant="soft"
          size="xs"
          :title="t('koko.actions.download')"
          @click="downloadSelected"
        />
        <UButton icon="i-lucide-upload" color="primary" variant="solid" size="xs" @click="uploadInput?.click()">
          {{ t("koko.actions.upload") }}
        </UButton>
      </div>
      <input ref="uploadInput" type="file" multiple class="hidden" @change="uploadFromEvent" />
    </div>
    <div v-if="manager.currentUploadName.value" class="border-b border-(--app-border) bg-(--app-panel-bg) px-3 py-1.5">
      <div class="mb-1 flex items-center justify-between gap-2 text-[10px] text-(--app-muted)">
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
      <div class="relative min-h-full select-none" @dragover.prevent @drop.prevent="onTransferDrop">
        <table class="w-full table-fixed border-separate border-spacing-0">
          <thead>
            <tr>
              <th class="h-[35px] min-w-0 border-b border-(--app-border) bg-(--app-panel-bg) px-3.5 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.05em] text-(--app-muted)">{{ t("koko.fileManagement.name") }}</th>
              <th class="h-[35px] w-[110px] border-b border-(--app-border) bg-(--app-panel-bg) px-3.5 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.05em] text-(--app-muted)">{{ t("koko.fileManagement.size") }}</th>
              <th class="hidden h-[35px] w-[168px] border-b border-(--app-border) bg-(--app-panel-bg) px-3.5 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.05em] text-(--app-muted) md:table-cell">{{ t("koko.fileManagement.modifiedTime") }}</th>
              <th class="hidden h-[35px] w-[128px] border-b border-(--app-border) bg-(--app-panel-bg) px-3.5 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.05em] text-(--app-muted) md:table-cell">{{ t("koko.fileManagement.permissions") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="entry in visibleEntries"
              :key="entry.name"
              class="group h-[38px] transition-colors hover:bg-(--app-hover-soft)"
              :class="isSelected(entry) ? 'bg-(--app-selected-soft)' : ''"
              @mouseenter="hoveredEntryName = entry.name"
              @mouseleave="hoveredEntryName = null"
              @click="selectEntry(entry)"
            >
              <td class="h-[38px] min-w-0 border-b border-(--app-border)/60 px-3.5 py-1.5 text-[12.5px] text-(--app-fg)">
                <div class="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    class="flex min-w-0 flex-1 items-center gap-2 rounded-[3px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--app-focus-ring)"
                    :class="!entry.is_dir && entry.name !== '..' ? 'cursor-grab active:cursor-grabbing' : ''"
                    :draggable="!entry.is_dir && entry.name !== '..'"
                    :title="!entry.is_dir && entry.name !== '..' ? t('koko.fileManagement.transferToRemote') : undefined"
                    @dblclick.stop="entry.is_dir && manager.changeDirectory(entry)"
                    @dragstart="onDragStart($event, entry)"
                  >
                    <UIcon :name="entry.is_dir ? 'i-lucide-folder' : 'i-lucide-file'" class="size-4 shrink-0 text-(--app-muted)" :class="entry.is_dir ? 'text-primary' : ''" />
                    <span class="truncate" :class="entry.is_dir ? 'font-medium' : ''">{{ entry.name }}</span>
                  </button>
                  <span v-if="entry.name !== '..'" data-file-action class="flex shrink-0 items-center gap-px text-(--app-muted) transition-opacity focus-within:opacity-100" :class="hoveredEntryName === entry.name ? 'opacity-100' : 'opacity-0'">
                    <UButton icon="i-lucide-download" size="xs" color="neutral" variant="ghost" @click.stop="downloadEntry(entry)" />
                    <UButton icon="i-lucide-pencil" size="xs" color="neutral" variant="ghost" @click.stop="rename(entry)" />
                    <UButton icon="i-lucide-trash-2" size="xs" color="error" variant="ghost" @click.stop="remove(entry)" />
                  </span>
                </div>
              </td>
              <td class="h-[38px] w-[110px] border-b border-(--app-border)/60 px-3.5 py-1.5 text-right"><span class="block truncate font-ui-mono text-[11px] text-(--app-muted)">{{ entry.is_dir ? "—" : formatFileSize(entry.size) }}</span></td>
              <td class="hidden h-[38px] w-[168px] border-b border-(--app-border)/60 px-3.5 py-1.5 text-right md:table-cell"><span class="block truncate font-ui-mono text-[11px] text-(--app-muted)">{{ formatModifiedTime(entry.mod_time) }}</span></td>
              <td class="hidden h-[38px] w-[128px] border-b border-(--app-border)/60 px-3.5 py-1.5 text-right md:table-cell"><span class="block truncate font-ui-mono text-[10.5px] text-(--app-muted)">{{ entry.perm || "—" }}</span></td>
            </tr>
            <tr v-if="visibleEntries.length === 0"><td colspan="4" class="h-24 border-b border-(--app-border)/60 px-3.5 text-center text-sm text-(--app-muted)">{{ t("Common.NoData") }}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="flex h-7 items-center border-t border-(--app-border) bg-(--app-panel-bg) px-3.5 font-ui-mono text-[10.5px] text-(--app-muted)">
        {{ t("koko.fileManagement.items", { count: visibleEntries.length }) }}
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
