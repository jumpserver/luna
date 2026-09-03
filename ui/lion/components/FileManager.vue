<script lang="ts" setup>
import type { LionUploadCustomRequestOptions, LionUploadFileInfo } from "@/lion/types/upload";
import { useElementSize } from "@vueuse/core";
import prettyBytes from "pretty-bytes";
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";

interface RowData {
  name: string;
  is_dir: boolean;
  size?: number;
  [key: string]: any;
}

const props = defineProps<{
  files: RowData[];
  name: string;
  folder: any;
  loading: boolean;
  displayUploadingFiles: LionUploadFileInfo[];
  downloadDisabled?: boolean;
  uploadDisabled?: boolean;
  compact?: boolean;
}>();

const emit = defineEmits<{
  (event: "openFolder", folder: any): void;
  (event: "downloadFile", file: RowData): void;
  (event: "uploadFile", options: LionUploadCustomRequestOptions, folder: any): void;
  (event: "removeUploadFile", file: LionUploadFileInfo): void;
}>();

const { t } = useI18n();
const ROW_HEIGHT = 34;
const OVERSCAN = 6;
let uploadSequence = 0;

const storeBackFolders = ref<any[]>([]);
const searchValue = ref("");
const showContextMenu = ref(false);
const contextPos = ref({ x: 0, y: 0 });
const currentRowData = ref<RowData | null>(null);
const fileInputRef = shallowRef<HTMLInputElement | null>(null);
const contextMenuRef = shallowRef<HTMLElement | null>(null);
const viewportRef = shallowRef<HTMLElement | null>(null);
const transferOpen = ref(false);
const searchOpen = ref(false);
const scrollTop = ref(0);
const { height: viewportHeight } = useElementSize(viewportRef);

const createUploadId = () => {
  uploadSequence += 1;
  return globalThis.crypto?.randomUUID?.() || `lion-upload-${Date.now()}-${uploadSequence}`;
};

const handlePathBack = () => {
  if (!props.folder?.parent) return;
  storeBackFolders.value.push(props.folder);
  emit("openFolder", props.folder.parent);
};

const handlePathForward = () => {
  const nextFolder = storeBackFolders.value.pop();
  if (nextFolder) emit("openFolder", nextFolder);
};

const handlePathClick = (item: any) => {
  storeBackFolders.value.length = 0;
  emit("openFolder", item.row);
};

const filePathList = computed(() => {
  if (!props.folder) return [];
  const list = [];
  let currentFolder = props.folder;
  let parent = currentFolder?.parent;
  let index = 0;
  list.push({ id: index, active: true, name: currentFolder.name, row: currentFolder, showArrow: false });
  while (parent !== null && parent !== undefined) {
    currentFolder = parent;
    parent = currentFolder.parent;
    index += 1;
    list.unshift({ id: index, active: false, name: currentFolder.name, row: currentFolder, showArrow: true });
  }
  return list;
});

const dataList = computed(() => {
  const query = searchValue.value.trim().toLowerCase();
  if (!query) return props.files;
  return props.files.filter((file) =>
    String(file.name || "")
      .toLowerCase()
      .includes(query)
  );
});

const disabledBack = computed(() => !props.folder?.parent);
const disabledForward = computed(() => storeBackFolders.value.length === 0);
const totalHeight = computed(() => dataList.value.length * ROW_HEIGHT);
const startIndex = computed(() => Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - OVERSCAN));
const visibleCount = computed(() => Math.ceil((viewportHeight.value || 320) / ROW_HEIGHT) + OVERSCAN * 2);
const virtualRows = computed(() =>
  dataList.value.slice(startIndex.value, startIndex.value + visibleCount.value).map((row, offset) => ({
    row,
    index: startIndex.value + offset
  }))
);
const activeTransfer = computed(() =>
  [...props.displayUploadingFiles].reverse().find((file) => file.status === "pending" || file.status === "uploading")
);

watch([dataList, () => props.folder], () => {
  scrollTop.value = 0;
  if (viewportRef.value) viewportRef.value.scrollTop = 0;
});

const openContextMenu = (event: MouseEvent, row: RowData) => {
  if (row.is_dir || props.downloadDisabled) return;
  event.preventDefault();
  currentRowData.value = row;
  contextPos.value = {
    x: Math.min(event.clientX, window.innerWidth - 150),
    y: Math.min(event.clientY, window.innerHeight - 56)
  };
  showContextMenu.value = true;
};

const closeContextMenu = (event?: Event) => {
  if (event?.target instanceof Node && contextMenuRef.value?.contains(event.target)) return;
  showContextMenu.value = false;
};

const handleDocumentKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape") showContextMenu.value = false;
};

const handleDownload = () => {
  showContextMenu.value = false;
  if (currentRowData.value) emit("downloadFile", currentRowData.value);
};

const handleRowClick = (row: RowData) => {
  showContextMenu.value = false;
  if (row.is_dir) {
    storeBackFolders.value.length = 0;
    emit("openFolder", row);
  }
};

const handleRefresh = () => emit("openFolder", props.folder);
const closeSearchIfEmpty = () => {
  if (!searchValue.value) searchOpen.value = false;
};
const handleSearchKeydown = (event: KeyboardEvent) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  if (searchValue.value) searchValue.value = "";
  else searchOpen.value = false;
};
const formatFileSize = (row: RowData) => {
  if (row.is_dir) return "—";
  const size = Number(row.size);
  return Number.isFinite(size) && size >= 0 ? prettyBytes(size) : "—";
};

const handleFileInput = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (!files?.length) return;

  transferOpen.value = true;
  Array.from(files).forEach((fileObj) => {
    const id = createUploadId();
    emit(
      "uploadFile",
      {
        file: {
          id,
          name: fileObj.name,
          batchId: id,
          percentage: 0,
          type: fileObj.type,
          status: "pending",
          file: fileObj
        }
      },
      props.folder
    );
  });

  input.value = "";
};

const removeUploadList = (file: LionUploadFileInfo) => emit("removeUploadFile", file);
const clampPercentage = (value?: number | null) => Math.max(0, Math.min(100, Math.round(value || 0)));
const statusColor = (status?: LionUploadFileInfo["status"]): "neutral" | "info" | "success" | "error" => {
  if (status === "uploading") return "info";
  if (status === "finished") return "success";
  if (status === "error") return "error";
  return "neutral";
};
const statusIcon = (status?: LionUploadFileInfo["status"]) => {
  if (status === "uploading") return "i-lucide-loader-circle";
  if (status === "finished") return "i-lucide-circle-check";
  if (status === "error") return "i-lucide-circle-x";
  return "i-lucide-clock-3";
};
const statusLabel = (status?: LionUploadFileInfo["status"]) => {
  if (status === "uploading") return t("FileTransfer.Status.transferring");
  if (status === "finished") return t("FileTransfer.Status.completed");
  if (status === "error") return t("FileTransfer.Status.failed");
  return t("FileTransfer.Status.queued");
};

onMounted(() => {
  document.addEventListener("pointerdown", closeContextMenu);
  document.addEventListener("keydown", handleDocumentKeydown);
});

onUnmounted(() => {
  document.removeEventListener("pointerdown", closeContextMenu);
  document.removeEventListener("keydown", handleDocumentKeydown);
});
</script>

<template>
  <div
    class="sftp-file-management flex min-h-0 flex-col bg-(--app-main-bg) text-(--app-fg)"
    :class="{ 'h-full sftp-file-management--compact': compact }"
  >
    <div
      class="sftp-file-management__toolbar sftp-file-management__toolbar--unified flex shrink-0 items-center gap-1 border-b border-(--app-border) bg-(--app-panel-bg) px-2"
    >
      <div class="flex shrink-0 items-center gap-0.5">
        <UTooltip :text="t('koko.fileManagement.back')">
          <UButton
            icon="i-lucide-chevron-left"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="disabledBack"
            :aria-label="t('koko.fileManagement.back')"
            @click="handlePathBack"
          />
        </UTooltip>
        <UTooltip :text="t('koko.fileManagement.forward')">
          <UButton
            icon="i-lucide-chevron-right"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="disabledForward"
            :aria-label="t('koko.fileManagement.forward')"
            @click="handlePathForward"
          />
        </UTooltip>
      </div>

      <UInput
        v-if="searchOpen || searchValue"
        v-model="searchValue"
        icon="i-lucide-search"
        size="sm"
        autofocus
        :placeholder="t('koko.fileManagement.filterCurrentDirectory')"
        class="min-w-18 flex-1"
        :ui="{ base: 'h-8 text-[12px]' }"
        @keydown="handleSearchKeydown"
        @blur="closeSearchIfEmpty"
      />
      <div
        v-else
        class="sftp-file-management__path-field flex h-8 min-w-18 flex-1 items-center overflow-x-auto rounded-[3px] border border-(--app-border) bg-(--app-input-bg) px-1 font-ui-mono text-[12px]"
        role="navigation"
        :aria-label="folder?.name || name"
      >
        <template v-for="item of filePathList" :key="item.id">
          <button
            type="button"
            class="max-w-28 shrink-0 truncate rounded px-1.5 hover:bg-accented focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--app-focus-ring)"
            :class="item.active ? 'font-semibold' : 'text-(--app-muted)'"
            :title="item.name"
            :aria-current="item.active ? 'page' : undefined"
            @click="handlePathClick(item)"
          >
            {{ item.name }}
          </button>
          <UIcon v-if="item.showArrow" name="i-lucide-chevron-right" class="size-3 shrink-0 text-(--app-muted)" />
        </template>
      </div>

      <div class="flex shrink-0 items-center gap-0.5">
        <UTooltip :text="t('koko.fileManagement.refresh')">
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="t('koko.fileManagement.refresh')"
            @click="handleRefresh"
          />
        </UTooltip>

        <UTooltip v-if="!searchOpen && !searchValue" :text="t('koko.fileManagement.filterCurrentDirectory')">
          <UButton
            icon="i-lucide-search"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="t('koko.fileManagement.filterCurrentDirectory')"
            @click="searchOpen = true"
          />
        </UTooltip>

        <UTooltip v-if="displayUploadingFiles.length" :text="t('FileTransfer.Title')">
          <UButton
            icon="i-lucide-list-restart"
            color="neutral"
            variant="ghost"
            size="sm"
            :label="displayUploadingFiles.length ? String(displayUploadingFiles.length) : undefined"
            :aria-label="t('FileTransfer.Title')"
            @click="transferOpen = true"
          />
        </UTooltip>

        <UTooltip :text="t('koko.actions.upload')">
          <UButton
            icon="i-lucide-upload"
            color="primary"
            variant="solid"
            size="xs"
            :disabled="uploadDisabled"
            :aria-label="t('koko.actions.upload')"
            @click="fileInputRef?.click()"
          />
        </UTooltip>
        <input ref="fileInputRef" type="file" multiple class="hidden" @change="handleFileInput" />
      </div>
    </div>

    <div v-if="activeTransfer" class="border-b border-(--app-border) bg-(--app-panel-bg) px-3 py-1.5">
      <div class="mb-1 flex items-center justify-between gap-2 text-[10px] text-(--app-muted)">
        <span class="truncate">{{ activeTransfer.name }}</span>
        <span>{{ clampPercentage(activeTransfer.percentage) }}%</span>
      </div>
      <UProgress :model-value="clampPercentage(activeTransfer.percentage)" size="xs" />
    </div>

    <div class="relative flex min-h-0 flex-1 flex-col bg-(--app-main-bg)">
      <div v-if="loading && files.length" class="sftp-file-table__refresh-bar" aria-hidden="true" />
      <div class="sftp-file-table flex min-h-0 flex-1 flex-col">
        <div class="sftp-file-table__head-wrap shrink-0">
          <div
            class="grid h-8.75 grid-cols-[minmax(0,1fr)_5.5rem] border-b border-(--app-border) bg-(--app-panel-bg) text-[10px] font-semibold uppercase tracking-[0.05em] text-muted"
          >
            <div class="min-w-0 px-3.5 py-2 text-left">{{ t("koko.fileManagement.name") }}</div>
            <div class="px-2.5 py-2 text-right">{{ t("koko.fileManagement.size") }}</div>
          </div>
        </div>

        <div
          ref="viewportRef"
          class="min-h-0 flex-1 overflow-y-auto select-none"
          @scroll="scrollTop = ($event.currentTarget as HTMLElement).scrollTop"
        >
          <div v-if="loading && !files.length" class="space-y-px px-3.5 py-2">
            <div v-for="row in 7" :key="row" class="flex h-8.5 items-center gap-2">
              <USkeleton class="size-4 shrink-0 rounded" />
              <USkeleton class="h-3" :class="row % 3 === 0 ? 'w-2/5' : row % 2 === 0 ? 'w-3/5' : 'w-1/2'" />
            </div>
          </div>
          <div v-else-if="!dataList.length" class="grid h-24 place-items-center text-sm text-muted">
            {{ t("Common.NoData") }}
          </div>
          <div v-else class="relative" :style="{ height: `${totalHeight}px` }">
            <button
              v-for="item in virtualRows"
              :key="`${item.row.name}-${item.index}`"
              type="button"
              class="absolute left-0 grid h-8.5 w-full grid-cols-[minmax(0,1fr)_5.5rem] border-b border-(--app-border)/60 text-left text-[12px] transition-colors hover:bg-(--app-hover-soft) focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--app-focus-ring)"
              :style="{ transform: `translateY(${item.index * ROW_HEIGHT}px)` }"
              :title="item.row.name"
              @click="handleRowClick(item.row)"
              @contextmenu="openContextMenu($event, item.row)"
            >
              <span class="flex min-w-0 items-center gap-2 px-3.5 py-1.5 text-(--app-fg)">
                <UIcon
                  :name="item.row.is_dir ? 'i-lucide-folder' : 'i-lucide-file'"
                  class="size-4 shrink-0 text-muted"
                />
                <span class="min-w-0 flex-1 truncate" :class="item.row.is_dir ? 'font-medium' : ''">
                  {{ item.row.name }}
                </span>
              </span>
              <span class="truncate px-2.5 py-1.5 text-right font-ui-mono text-[10px] text-muted">
                {{ formatFileSize(item.row) }}
              </span>
            </button>
          </div>
        </div>

        <div
          class="sftp-file-table__status flex h-8.75 shrink-0 items-center border-t border-(--app-border) bg-(--app-panel-bg) px-3.5 font-ui-mono text-[10.5px] text-(--app-muted)"
        >
          {{ t("koko.fileManagement.items", { count: dataList.length }) }}
        </div>
      </div>
    </div>

    <div
      v-if="showContextMenu"
      ref="contextMenuRef"
      class="fixed z-50 min-w-36 rounded-md border border-default bg-default p-1 shadow-lg"
      :style="{ left: `${contextPos.x}px`, top: `${contextPos.y}px` }"
    >
      <UButton
        icon="i-lucide-download"
        color="neutral"
        variant="ghost"
        block
        :disabled="downloadDisabled"
        @click="handleDownload"
      >
        {{ t("koko.actions.download") }}
      </UButton>
    </div>

    <UModal v-model:open="transferOpen" :title="t('FileTransfer.Title')">
      <template #body>
        <div v-if="displayUploadingFiles.length" class="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          <div v-for="file in displayUploadingFiles" :key="file.id" class="rounded-md border border-default p-3">
            <div class="mb-2 flex items-center gap-2">
              <UIcon
                :name="statusIcon(file.status)"
                class="size-4 shrink-0"
                :class="file.status === 'uploading' ? 'animate-spin' : ''"
              />
              <span class="min-w-0 flex-1 truncate text-sm" :title="file.name">{{ file.name }}</span>
              <UBadge :color="statusColor(file.status)" variant="subtle" size="sm">
                {{ statusLabel(file.status) }}
              </UBadge>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="xs"
                :disabled="file.status === 'uploading'"
                :aria-label="t('Common.Remove')"
                @click="removeUploadList(file)"
              />
            </div>
            <UProgress :model-value="clampPercentage(file.percentage)" :color="statusColor(file.status)" size="sm" />
          </div>
        </div>
        <div v-else class="py-8 text-center text-sm text-muted">
          {{ t("Common.NoData") }}
        </div>
      </template>
    </UModal>
  </div>
</template>
