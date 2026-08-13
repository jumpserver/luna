<script lang="ts" setup>
import type { LionUploadCustomRequestOptions, LionUploadFileInfo } from "@/lion/types/upload";
import { useElementSize } from "@vueuse/core";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
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
}>();

const emit = defineEmits<{
  (event: "openFolder", folder: any): void;
  (event: "downloadFile", file: RowData): void;
  (event: "uploadFile", options: LionUploadCustomRequestOptions, folder: any): void;
  (event: "removeUploadFile", file: LionUploadFileInfo): void;
}>();

const { t } = useI18n();
const ROW_HEIGHT = 40;
const OVERSCAN = 6;
let uploadSequence = 0;

const storeBackFolders = ref<any[]>([]);
const searchValue = ref("");
const showContextMenu = ref(false);
const contextPos = ref({ x: 0, y: 0 });
const currentRowData = ref<RowData | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const contextMenuRef = ref<HTMLElement | null>(null);
const viewportRef = ref<HTMLElement | null>(null);
const transferOpen = ref(false);
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
const latestTransfer = computed(() => props.displayUploadingFiles.at(-1));

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
  if (status === "uploading") return t("Uploading");
  if (status === "finished") return t("UploadSuccess");
  if (status === "error") return t("UploadError");
  return t("Waiting");
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
  <div class="flex min-h-0 flex-col gap-4">
    <div class="flex items-center gap-2 overflow-x-auto">
      <UButton
        icon="i-lucide-chevron-left"
        color="neutral"
        variant="ghost"
        size="xs"
        :disabled="disabledBack"
        :aria-label="t('Back')"
        @click="handlePathBack"
      />
      <UButton
        icon="i-lucide-chevron-right"
        color="neutral"
        variant="ghost"
        size="xs"
        :disabled="disabledForward"
        :aria-label="t('Forward')"
        @click="handlePathForward"
      />

      <div class="flex min-w-0 items-center gap-1 overflow-x-auto">
        <template v-for="item of filePathList" :key="item.id">
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-folder"
            :class="item.active ? 'font-semibold' : ''"
            @click="handlePathClick(item)"
          >
            {{ item.name }}
          </UButton>
          <UIcon v-if="item.showArrow" name="i-lucide-chevron-right" class="size-3.5 shrink-0" />
        </template>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <UInput v-model="searchValue" :placeholder="t('PleaseInput')" class="min-w-40 flex-1">
        <template #leading>
          <UIcon name="i-lucide-search" class="size-4" />
        </template>
      </UInput>

      <input ref="fileInputRef" type="file" multiple class="hidden" @change="handleFileInput" />
      <UButton
        icon="i-lucide-upload"
        color="neutral"
        variant="soft"
        size="sm"
        :disabled="uploadDisabled"
        @click="fileInputRef?.click()"
      >
        {{ t("UploadFile") }}
      </UButton>
      <UButton
        icon="i-lucide-list-restart"
        color="neutral"
        variant="ghost"
        size="sm"
        :aria-label="t('TransferHistory')"
        @click="transferOpen = true"
      >
        {{ displayUploadingFiles.length }}
      </UButton>
      <UButton
        icon="i-lucide-refresh-ccw"
        color="neutral"
        variant="ghost"
        size="sm"
        :aria-label="t('Refresh')"
        @click="handleRefresh"
      />
    </div>

    <UCard :ui="{ body: 'p-0' }">
      <div v-if="loading" class="flex items-center justify-center p-8 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
      </div>
      <div v-else-if="!dataList.length" class="p-8 text-center text-sm text-muted">
        {{ t("NoData") }}
      </div>
      <div
        v-else
        ref="viewportRef"
        class="h-[clamp(240px,calc(100vh-420px),520px)] overflow-auto"
        @scroll="scrollTop = ($event.currentTarget as HTMLElement).scrollTop"
      >
        <div class="relative" :style="{ height: `${totalHeight}px` }">
          <button
            v-for="item in virtualRows"
            :key="`${item.row.name}-${item.index}`"
            type="button"
            class="absolute left-0 flex h-10 w-full items-center gap-2 border-b border-default px-3 text-left hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
            :style="{ transform: `translateY(${item.index * ROW_HEIGHT}px)` }"
            :title="item.row.name"
            @click="handleRowClick(item.row)"
            @contextmenu="openContextMenu($event, item.row)"
          >
            <UIcon :name="item.row.is_dir ? 'i-lucide-folder' : 'i-lucide-file'" class="size-4 shrink-0" />
            <span class="truncate">{{ item.row.name }}</span>
          </button>
        </div>
      </div>

      <div v-if="latestTransfer" class="flex items-center gap-3 border-t border-default p-3 text-sm">
        <UIcon
          :name="statusIcon(latestTransfer.status)"
          class="size-4 shrink-0"
          :class="latestTransfer.status === 'uploading' ? 'animate-spin' : ''"
        />
        <span class="min-w-0 flex-1 truncate">{{ latestTransfer.name }}</span>
        <span class="text-muted">{{ clampPercentage(latestTransfer.percentage) }}%</span>
        <UButton color="neutral" variant="link" size="xs" @click="transferOpen = true">
          {{ t("TransferHistory") }}
        </UButton>
      </div>
    </UCard>

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
        {{ t("Download") }}
      </UButton>
    </div>

    <UModal v-model:open="transferOpen" :title="t('TransferHistory')">
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
                :aria-label="t('Remove')"
                @click="removeUploadList(file)"
              />
            </div>
            <UProgress :model-value="clampPercentage(file.percentage)" :color="statusColor(file.status)" size="sm" />
          </div>
        </div>
        <div v-else class="py-8 text-center text-sm text-muted">
          {{ t("NoData") }}
        </div>
      </template>
    </UModal>
  </div>
</template>
