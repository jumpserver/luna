<script setup lang="ts">
import type { VideoPlayerItem } from "~/composables/useVideoPlayerParser";

definePageMeta({
  layout: "default"
});

const toast = useToast();
const { addErrorToast } = useErrorToast();
const fileInputRef = ref<HTMLInputElement | null>(null);
const isImporting = ref(false);
const items = ref<VideoPlayerItem[]>([]);
// selectedId 立即跟随点击,用于播放列表高亮;activeId 经防抖后才更新,
// 真正驱动播放器组件的挂载/加载。快速来回切换时,只有停手后的最后一次
// 才会触发销毁旧播放器 + fetch + 全量解析,避免多个 part 的解析结果在
// GC 回收前叠加导致内存飙升甚至 OOM。
const selectedId = ref<string | null>(null);
const activeId = ref<string | null>(null);
const commitActiveId = useDebounceFn((id: string | null) => {
  activeId.value = id;
}, 250);
const importMessage = ref("");
const playlistCollapsed = ref(false);

const { parseFiles, parsePaths } = useVideoPlayerParser();
const { removeRecording } = useVideoPlayerTauri();
let unlistenFileDrop: (() => void) | null = null;

const currentItem = computed(() => items.value.find((item) => item.id === activeId.value) || null);

const playerComponent = computed(() => {
  switch (currentItem.value?.type) {
    case "cast":
      return resolveComponent("VideoPlayerPlayersAsciinemaPlayer");
    case "gua":
    case "part":
      return resolveComponent("VideoPlayerPlayersGuaPlayer");
    case "mp4":
      return resolveComponent("VideoPlayerPlayersMp4Player");
    default:
      return null;
  }
});

function cleanupItem(item: VideoPlayerItem) {
  if (item.source.startsWith("blob:")) {
    URL.revokeObjectURL(item.source);
  }
}

function selectItem(item: VideoPlayerItem) {
  // 高亮立即响应,加载防抖,兼顾手感与内存安全。
  selectedId.value = item.id;
  commitActiveId(item.id);
}

async function removeItem(item: VideoPlayerItem) {
  cleanupItem(item);
  items.value = items.value.filter((entry) => entry.id !== item.id);

  if (selectedId.value === item.id) {
    // 删除当前项:直接切到下一项,无需防抖(不是快速切换场景)。
    const nextId = items.value[0]?.id || null;
    selectedId.value = nextId;
    activeId.value = nextId;
  }

  const recordingStillUsed = items.value.some((entry) => entry.recordingId === item.recordingId);

  if (isTauriRuntime() && !recordingStillUsed) {
    try {
      await removeRecording(item.recordingId);
    } catch {
      // stale recording directories are cleaned on the next application startup
    }
  }
}

async function appendParsedItems(parsed: VideoPlayerItem[]) {
  if (parsed.length === 0) {
    importMessage.value = "";
    toast.add({
      title: "未识别到可播放文件",
      description: "请导入 mp4、cast.gz、replay.gz、part.gz 或包含这些文件的 tar 包。",
      color: "warning"
    });
    return;
  }

  const existingNames = new Set(items.value.map((item) => item.name));
  const incoming = parsed.filter((item) => !existingNames.has(item.name));
  const duplicates = parsed.length - incoming.length;

  if (isTauriRuntime()) {
    const retainedRecordingIds = new Set(incoming.map((item) => item.recordingId));
    const unusedRecordingIds = new Set(
      parsed.filter((item) => !retainedRecordingIds.has(item.recordingId)).map((item) => item.recordingId)
    );

    await Promise.allSettled([...unusedRecordingIds].map((recordingId) => removeRecording(recordingId)));
  }

  items.value.push(...incoming);

  if (!activeId.value && incoming[0]) {
    // 首次导入自动选中第一项:两个状态一起设,立即加载。
    selectedId.value = incoming[0].id;
    activeId.value = incoming[0].id;
  }

  importMessage.value = "";

  if (duplicates > 0) {
    toast.add({
      title: "部分文件已跳过",
      description: `有 ${duplicates} 个同名条目已存在，未重复导入。`,
      color: "neutral"
    });
  }
}

async function importFiles(files: File[]) {
  if (files.length === 0 || isImporting.value) return;

  isImporting.value = true;
  importMessage.value = `正在导入 ${files.length} 个文件…`;

  try {
    await appendParsedItems(await parseFiles(files));
  } catch (error: any) {
    importMessage.value = "";
    addErrorToast({
      title: "导入失败",
      description: error?.message || String(error)
    });
  } finally {
    isImporting.value = false;
  }
}

async function importPaths(filePaths: string[]) {
  if (filePaths.length === 0 || isImporting.value) return;

  isImporting.value = true;
  importMessage.value = `正在导入 ${filePaths.length} 个文件…`;

  try {
    await appendParsedItems(await parsePaths(filePaths));
  } catch (error: any) {
    importMessage.value = "";
    addErrorToast({
      title: "导入失败",
      description: error?.message || String(error)
    });
  } finally {
    isImporting.value = false;
  }
}

async function handleFileInputClick(event: MouseEvent) {
  if (!isTauriRuntime()) return;

  event.preventDefault();

  try {
    const selected = await useTauriDialogOpen({
      multiple: true,
      filters: [
        {
          name: "录像文件",
          extensions: ["mp4", "cast", "gz", "tar"]
        }
      ]
    });
    const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];

    await importPaths(paths);
  } catch (error: any) {
    addErrorToast({
      title: "选择文件失败",
      description: error?.message || String(error)
    });
  }
}

function handleInputChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const files = Array.from(target.files || []);
  target.value = "";
  void importFiles(files);
}

watch(
  () => items.value.length,
  (len, prevLen) => {
    if (prevLen === 0 && len > 0) {
      playlistCollapsed.value = false;
    }
  }
);

onMounted(async () => {
  document.title = "JumpServer Video Player";

  try {
    const currentWindow = useTauriWindowGetCurrentWindow();
    await currentWindow.setTitle("JumpServer Video Player");

    unlistenFileDrop = await currentWindow.onDragDropEvent(({ payload }) => {
      if (payload.type === "drop") {
        void importPaths(payload.paths);
      }
    });
  } catch {
    // ignore when running in browser
  }
});

onBeforeUnmount(() => {
  unlistenFileDrop?.();
  items.value.forEach(cleanupItem);

  if (isTauriRuntime()) {
    const recordingIds = new Set(items.value.map((item) => item.recordingId));
    void Promise.allSettled([...recordingIds].map((recordingId) => removeRecording(recordingId)));
  }
});
</script>

<template>
  <div
    class="flex h-full min-h-0 flex-col overflow-hidden py-4 pl-4"
    :class="items.length > 0 && playlistCollapsed ? 'pr-0' : 'pr-4'"
  >
    <input
      id="videoplayer-file-input"
      ref="fileInputRef"
      class="sr-only"
      type="file"
      multiple
      accept=".mp4,.gz,.tar,.json,.cast"
      @click="handleFileInputClick"
      @change="handleInputChange"
    />

    <p v-if="importMessage && items.length === 0" class="shrink-0 text-sm text-muted">
      {{ importMessage }}
    </p>

    <div class="flex min-h-0 flex-1 overflow-hidden" :class="importMessage && items.length === 0 ? 'pt-3' : ''">
      <section
        class="flex min-h-0 min-w-0 flex-1 flex-col"
        :class="items.length > 0 && !playlistCollapsed ? 'pr-3' : ''"
      >
        <div v-if="playerComponent && currentItem" class="flex min-h-0 flex-1 flex-col overflow-hidden bg-black">
          <component
            :is="playerComponent"
            :key="currentItem.id"
            :source="currentItem.source"
            :cast-data="currentItem.castData"
          />
        </div>
        <div
          v-else
          class="flex min-h-0 flex-1 items-center justify-center border border-dashed border-default px-6 py-6 text-center text-sm text-muted"
        >
          <button
            type="button"
            class="group flex cursor-pointer flex-col items-center gap-4 rounded-lg px-8 py-6 transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            @click="fileInputRef?.click()"
          >
            <span
              class="flex h-16 w-16 items-center justify-center rounded-xl border border-default bg-muted text-3xl text-primary"
            >
              <UIcon name="line-md:upload-loop" />
            </span>
            <span class="max-w-xl">
              <span class="block text-xl font-semibold tracking-tight text-highlighted">导入录像文件</span>
              <span class="mt-2 block text-sm leading-6 text-muted">
                将录像拖入播放区，或点击这里选择 `.mp4`、`.gz`、`.tar` 文件。
              </span>
            </span>
            <span class="rounded-full bg-muted px-4 py-2 text-sm text-toned transition group-hover:bg-accented">
              选择文件
            </span>
          </button>
        </div>
      </section>

      <aside
        v-if="items.length > 0"
        class="flex shrink-0 flex-col border-l border-default transition-[width] duration-200 ease-out"
        :class="playlistCollapsed ? 'w-9 items-center' : 'w-52 pl-3'"
      >
        <UTooltip v-if="playlistCollapsed" text="展开播放列表">
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-panel-left"
            class="mx-auto mb-1 shrink-0"
            @click="playlistCollapsed = false"
          />
        </UTooltip>

        <VideoPlayerPlaylist
          v-if="!playlistCollapsed"
          class="min-h-0 flex-1"
          :active-id="selectedId"
          :items="items"
          @play="selectItem"
          @remove="removeItem"
          @collapse="playlistCollapsed = true"
        />

        <div v-else class="flex flex-col items-center gap-2 pt-1">
          <UIcon name="i-lucide-list-music" class="size-4 text-dimmed" />
          <span class="rounded-full bg-(--ui-primary)/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {{ items.length }}
          </span>
        </div>
      </aside>
    </div>
  </div>
</template>
