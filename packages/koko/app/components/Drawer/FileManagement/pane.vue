<script setup lang="ts">
import type { ConnectorSessionContext } from "@jumpserver/connectors-core";
import type { TableColumn, TableRow } from "@nuxt/ui";
import type { SftpFileEntry } from "#koko/composables/sftp/useSftpFileManager";
import prettyBytes from "pretty-bytes";

import { useSftpFileManager } from "#koko/composables/sftp/useSftpFileManager";

const props = defineProps<{
  context: ConnectorSessionContext | null;
  title?: string;
}>();

const emit = defineEmits<{
  select: [entry: SftpFileEntry | null];
}>();

const { t } = useI18n();
const toast = useToast();
const { addErrorToast } = useErrorToast();
const contextRef = computed(() => props.context);
const manager = useSftpFileManager(contextRef);
const search = ref("");
const uploadInput = ref<HTMLInputElement | null>(null);
const selectedEntry = ref<SftpFileEntry | null>(null);
const hoveredEntryName = ref<string | null>(null);
const promptOpen = ref(false);
const promptName = ref("");
const promptTarget = ref<SftpFileEntry | null>(null);
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

const columns: TableColumn<SftpFileEntry>[] = [
  {
    id: "select",
    header: "",
    meta: { class: { th: "w-[38px] px-3.5", td: "w-[38px] px-3.5" } }
  },
  {
    accessorKey: "name",
    header: t("koko.fileManagement.name"),
    meta: { class: { th: "min-w-0", td: "min-w-0" } }
  },
  {
    accessorKey: "size",
    header: t("koko.fileManagement.size"),
    meta: { class: { th: "w-[110px] text-right", td: "w-[110px] text-right" } }
  },
  {
    accessorKey: "mod_time",
    header: t("koko.fileManagement.modifiedTime"),
    meta: { class: { th: "hidden w-[168px] text-right md:table-cell", td: "hidden w-[168px] text-right md:table-cell" } }
  },
  {
    accessorKey: "perm",
    header: t("koko.fileManagement.permissions"),
    meta: { class: { th: "hidden w-[128px] text-right md:table-cell", td: "hidden w-[128px] text-right md:table-cell" } }
  }
];
const tableMeta = {
  class: {
    tr: (row: TableRow<SftpFileEntry>) =>
      selectedEntry.value?.name === row.original.name && row.original.name !== ".." ? "bg-(--app-selected-soft)" : ""
  }
};

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

const toggleSelection = (entry: SftpFileEntry) => {
  if (entry.name === "..") return;
  selectedEntry.value = selectedEntry.value?.name === entry.name ? null : entry;
};

const selectTableRow = (_event: Event, row: TableRow<SftpFileEntry>) => selectEntry(row.original);
const hoverTableRow = (_event: Event, row: TableRow<SftpFileEntry> | null) => {
  hoveredEntryName.value = row?.original.name ?? null;
};

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
  if (!name || (target && name === target.name)) return;
  const success = await runFileOperation(
    () => target ? manager.operations.renameEntry(target, name) : manager.operations.createDirectory(name),
    target
      ? t("koko.fileManagement.entryRenamed", { name })
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
        disabled
        :title="t('koko.fileManagement.back')"
      />
      <UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" size="sm" disabled :title="t('koko.drawer.right')" />
      <UButton
        icon="i-lucide-arrow-up"
        color="neutral"
        variant="ghost"
        size="sm"
        :disabled="manager.currentPath.value === '/'"
        :title="t('koko.drawer.up')"
        @click="manager.changeDirectory({ name: '..', is_dir: true } as SftpFileEntry)"
      />
      <UButton icon="i-lucide-house" color="neutral" variant="ghost" size="sm" disabled :title="t('koko.fileManagement.home')" />
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
        <UButton icon="i-lucide-upload" color="primary" variant="solid" size="xs" @click="uploadInput?.click()">
          {{ t("koko.actions.upload") }}
        </UButton>
        <UButton icon="i-lucide-folder-plus" color="neutral" variant="soft" size="xs" @click="createFolder">
          {{ t("koko.fileManagement.newFolder") }}
        </UButton>
      </div>
      <UButton
        v-if="selectedEntry"
        icon="i-lucide-download"
        color="neutral"
        variant="soft"
        size="xs"
        :title="t('koko.actions.download')"
        @click="downloadSelected"
      />
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
      <UTable
        sticky
        :data="visibleEntries"
        :columns="columns"
        :meta="tableMeta"
        :empty="t('Common.NoData')"
        class="w-full table-fixed"
        :ui="{
          base: 'w-full table-fixed border-separate border-spacing-0',
          th: 'h-[35px] border-b border-(--app-border) bg-(--app-panel-bg) px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.05em] text-(--app-muted)',
          td: 'h-[38px] border-b border-(--app-border)/60 px-3.5 py-1.5 text-[12.5px] text-(--app-fg)',
          tr: 'group transition-colors hover:bg-(--app-hover-soft)'
        }"
        @select="selectTableRow"
        @hover="hoverTableRow"
      >
        <template #select-header>
          <span class="block size-3.75 rounded-[4px] border border-(--app-border-strong) bg-(--app-input-bg)" aria-hidden="true" />
        </template>
        <template #select-cell="{ row }">
          <button
            v-if="row.original.name !== '..'"
            type="button"
            class="grid size-3.75 place-items-center rounded-[4px] border border-(--app-border-strong) bg-(--app-input-bg)"
            :class="selectedEntry?.name === row.original.name ? 'border-primary bg-primary text-(--app-accent-foreground)' : 'text-transparent'"
            :aria-label="row.original.name"
            @click.stop="toggleSelection(row.original)"
          >
            <UIcon name="i-lucide-check" class="size-3" />
          </button>
        </template>
        <template #name-cell="{ row }">
          <div class="flex min-w-0 items-center gap-2">
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-2 rounded-[3px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--app-focus-ring)"
              @dblclick.stop="row.original.is_dir && manager.changeDirectory(row.original)"
            >
              <UIcon
                :name="row.original.is_dir ? 'i-lucide-folder' : 'i-lucide-file'"
                class="size-4 shrink-0 text-(--app-muted)"
                :class="row.original.is_dir ? 'text-primary' : ''"
              />
              <span class="truncate" :class="row.original.is_dir ? 'font-medium' : ''">{{ row.original.name }}</span>
            </button>
            <span
              v-if="row.original.name !== '..'"
              class="flex shrink-0 items-center gap-px text-(--app-muted) transition-opacity focus-within:opacity-100"
              :class="hoveredEntryName === row.original.name ? 'opacity-100' : 'opacity-0'"
            >
              <UButton
                icon="i-lucide-download"
                size="xs"
                color="neutral"
                variant="ghost"
                @click.stop="downloadEntry(row.original)"
              />
              <UButton icon="i-lucide-pencil" size="xs" color="neutral" variant="ghost" @click.stop="rename(row.original)" />
              <UButton icon="i-lucide-trash-2" size="xs" color="error" variant="ghost" @click.stop="remove(row.original)" />
            </span>
          </div>
        </template>
        <template #size-cell="{ row }">
          <span class="block truncate font-ui-mono text-[11px] text-(--app-muted)">
            {{ row.original.is_dir ? "—" : formatFileSize(row.original.size) }}
          </span>
        </template>
        <template #mod_time-cell="{ row }">
          <span class="block truncate font-ui-mono text-[11px] text-(--app-muted)">{{ formatModifiedTime(row.original.mod_time) }}</span>
        </template>
        <template #perm-cell="{ row }">
          <span class="block truncate font-ui-mono text-[10.5px] text-(--app-muted)">{{ row.original.perm || "—" }}</span>
        </template>
      </UTable>
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
