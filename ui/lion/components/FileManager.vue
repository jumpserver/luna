<script lang="ts" setup>
import { ref, computed } from 'vue';
import { ChevronLeft, ChevronRight, Download, Folder, File, RefreshCcw, Search, Upload } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useDebounceFn } from '@vueuse/core';
import type { LionUploadCustomRequestOptions, LionUploadFileInfo } from '@/lion/types/upload';

const { t } = useI18n();
const toast = useToast();

const emit = defineEmits(['open-folder', 'download-file', 'upload-file', 'remove-upload-file']);

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
}>();

const storeBackFolders = ref<any>([]);
const searchValue = ref('');
const showContextMenu = ref(false);
const contextPos = ref({ x: 0, y: 0 });
const currentRowData = ref<RowData | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

const handlePathBack = () => {
  if (!props.folder?.parent) return;
  storeBackFolders.value.push(props.folder);
  emit('open-folder', props.folder.parent);
};

const handlePathForward = () => {
  const nextFolder = storeBackFolders.value.pop();
  if (nextFolder) emit('open-folder', nextFolder);
};

const handlePathClick = (item: any) => {
  storeBackFolders.value.length = 0;
  emit('open-folder', item.row);
};

const filePathList = computed(() => {
  if (!props.folder) return [];
  const list = [];
  let currentFolder = props.folder;
  let parent = currentFolder?.parent;
  let index = 0;
  list.push({ id: index, active: true, name: currentFolder.name, row: currentFolder, showArrow: false });
  while (parent !== null) {
    currentFolder = parent;
    parent = currentFolder.parent;
    index++;
    list.unshift({ id: index, active: false, name: currentFolder.name, row: currentFolder, showArrow: true });
  }
  return list;
});

const dataList = computed(() =>
  props.files.filter((file) => file.name.toLowerCase().includes(searchValue.value.toLowerCase())),
);

const disabledBack = computed(() => !props.folder?.parent);
const disabledForward = computed(() => storeBackFolders.value.length === 0);

const handleSearch = useDebounceFn(() => {}, 300);

const openContextMenu = (event: MouseEvent, row: RowData) => {
  if (row.is_dir) return;
  event.preventDefault();
  currentRowData.value = row;
  contextPos.value = { x: event.clientX, y: event.clientY };
  showContextMenu.value = true;
};

const handleDownload = () => {
  showContextMenu.value = false;
  if (currentRowData.value) emit('download-file', currentRowData.value);
};

const handleRowClick = (row: RowData) => {
  if (row.is_dir) emit('open-folder', row);
};

const handleRefresh = () => emit('open-folder', props.folder);

const handleFileInput = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (!files?.length) return;

  Array.from(files).forEach((fileObj) => {
    const uploadOptions: LionUploadCustomRequestOptions = {
      file: {
        id: `batch-id-${fileObj.name}`,
        name: fileObj.name,
        batchId: `batch-id-${fileObj.name}`,
        percentage: 0,
        type: fileObj.type,
        status: 'pending',
        file: fileObj,
      },
    };
    emit('upload-file', uploadOptions, props.folder);
  });

  input.value = '';
};

const removeUploadList = (file: LionUploadFileInfo) => {
  emit('remove-upload-file', file);
};
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center gap-2 overflow-x-auto">
      <UButton color="neutral" variant="ghost" size="xs" :disabled="disabledBack" @click="handlePathBack">
        <ChevronLeft :size="16" />
      </UButton>
      <UButton color="neutral" variant="ghost" size="xs" :disabled="disabledForward" @click="handlePathForward">
        <ChevronRight :size="16" />
      </UButton>

      <div class="flex min-w-0 items-center gap-1 overflow-x-auto">
        <template v-for="item of filePathList" :key="item.id">
          <button type="button" class="inline-flex items-center gap-1 whitespace-nowrap text-sm" @click="handlePathClick(item)">
            <Folder :size="16" />
            <span :class="item.active ? 'font-semibold' : ''">{{ item.name }}</span>
          </button>
          <ChevronRight v-if="item.showArrow" :size="14" />
        </template>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <UInput
        v-model="searchValue"
        :placeholder="t('PleaseInput')"
        class="flex-1"
        @change="handleSearch"
      >
        <template #leading>
          <Search :size="16" />
        </template>
      </UInput>

      <input ref="fileInputRef" type="file" multiple class="hidden" @change="handleFileInput">
      <UButton color="neutral" variant="soft" size="sm" @click="fileInputRef?.click()">
        <Upload :size="14" />
        {{ t('UploadFile') }}
      </UButton>
      <UButton color="neutral" variant="ghost" size="sm" @click="handleRefresh">
        <RefreshCcw :size="14" />
      </UButton>
    </div>

    <UCard :ui="{ body: 'p-0' }">
      <div v-if="loading" class="flex items-center justify-center p-8 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
      </div>
      <div v-else-if="!dataList.length" class="p-8 text-center text-sm text-muted">
        {{ t('NoData') }}
      </div>
      <div v-else class="max-h-[calc(100vh-420px)] overflow-auto">
        <button
          v-for="row in dataList"
          :key="row.name"
          type="button"
          class="flex w-full items-center gap-2 border-b border-default px-3 py-2 text-left hover:bg-elevated"
          @click="handleRowClick(row)"
          @contextmenu="openContextMenu($event, row)"
        >
          <component :is="row.is_dir ? Folder : File" :size="16" />
          <span class="truncate">{{ row.name }}</span>
        </button>
      </div>

      <div v-if="displayUploadingFiles.length > 0" class="border-t border-default p-3">
        <div
          v-for="file in displayUploadingFiles"
          :key="file.id"
          class="flex items-center justify-between gap-2 py-1 text-sm"
        >
          <span class="truncate">{{ file.name }}</span>
          <div class="flex items-center gap-2">
            <span class="text-muted">{{ file.status }}</span>
            <UButton color="neutral" variant="ghost" size="xs" @click="removeUploadList(file)">
              {{ t('Remove') }}
            </UButton>
          </div>
        </div>
      </div>
    </UCard>

    <div
      v-if="showContextMenu"
      class="fixed z-50 min-w-32 rounded-md border border-default bg-default p-1 shadow-lg"
      :style="{ left: `${contextPos.x}px`, top: `${contextPos.y}px` }"
    >
      <UButton color="neutral" variant="ghost" block @click="handleDownload">
        <Download :size="14" />
        {{ t('Download') }}
      </UButton>
    </div>
  </div>
</template>
