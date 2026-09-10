<script setup lang="ts">
import type { VideoPlayerItem } from "~/composables/useVideoPlayerParser";
import { useVideoPlayerTour, videoPlayerTourDemo, videoPlayerTourFilled } from "~/composables/useVideoPlayerTour";
import { desktopDialog, desktopWindow } from "~/shared/desktop/bridge";
import {
  buildVideoPlayerTourDemoItems,
  isVideoPlayerTourDemoItem,
  VIDEO_PLAYER_TOUR_DEMO_ACTIVE_ID
} from "~/utils/videoPlayerTour";

definePageMeta({
  layout: "default"
});

const { t } = useI18n();
const toast = useToast();
const { addErrorToast } = useErrorToast();
const fileInputRef = ref<HTMLInputElement | null>(null);
const isImporting = ref(false);
const items = ref<VideoPlayerItem[]>([]);

useHead({ title: "JumpServer Video Player" });
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
const isDragOver = ref(false);
let dragDepth = 0;

const { modernIsland } = useSettingManager();
const isNarrowScreen = useMediaQuery("(max-width: 767px)");
const useIslandLayout = computed(() => modernIsland.value && !isNarrowScreen.value);
const PLAYLIST_MAX_WIDTH = 420;
const PLAYLIST_DEFAULT_WIDTH = 288;
const PLAYLIST_COLLAPSED_WIDTH = 40;
const { setOpen: setRightPanelOpen, setPanelWidth, setPanelBounds, resetPanelBounds } = useRightPanel();

const { parseFiles, parsePaths } = useVideoPlayerParser();
const { removeRecording } = useOfflineRecording();
const { destroy: destroyTour, startOnce: startTourOnce } = useVideoPlayerTour();
const playlistItems = computed(() =>
  videoPlayerTourDemo.value ? [...buildVideoPlayerTourDemoItems(), ...items.value] : items.value
);

const currentItem = computed(() => items.value.find((item) => item.id === activeId.value) || null);

const playerComponent = computed(() => {
  switch (currentItem.value?.type) {
    case "cast":
      return resolveComponent("VideoPlayerPlayersAsciinemaPlayer");
    case "gua":
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

  if (isDesktopRuntime() && !recordingStillUsed) {
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
      title: t("VideoPlayer.UnrecognizedTitle"),
      description: t("VideoPlayer.UnrecognizedHint"),
      color: "warning"
    });
    return;
  }

  const existingNames = new Set(items.value.map((item) => item.name));
  const incoming = parsed.filter((item) => !existingNames.has(item.name));
  const duplicates = parsed.length - incoming.length;

  if (isDesktopRuntime()) {
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
      title: t("VideoPlayer.SkippedTitle"),
      description: t("VideoPlayer.SkippedHint", { count: duplicates }),
      color: "neutral"
    });
  }
}

async function importFiles(files: File[]) {
  if (files.length === 0 || isImporting.value) return;

  isImporting.value = true;
  importMessage.value = t("VideoPlayer.Importing", { count: files.length });

  try {
    await appendParsedItems(await parseFiles(files));
  } catch (error: any) {
    importMessage.value = "";
    addErrorToast({
      title: t("VideoPlayer.ImportFailed"),
      description: error?.message || String(error)
    });
  } finally {
    isImporting.value = false;
  }
}

async function importPaths(filePaths: string[]) {
  if (filePaths.length === 0 || isImporting.value) return;

  isImporting.value = true;
  importMessage.value = t("VideoPlayer.Importing", { count: filePaths.length });

  try {
    await appendParsedItems(await parsePaths(filePaths));
  } catch (error: any) {
    importMessage.value = "";
    addErrorToast({
      title: t("VideoPlayer.ImportFailed"),
      description: error?.message || String(error)
    });
  } finally {
    isImporting.value = false;
  }
}

async function handleFileInputClick(event: MouseEvent) {
  if (!isDesktopRuntime()) return;

  event.preventDefault();

  try {
    const selected = await desktopDialog.open({
      multiple: true,
      filters: [
        {
          name: t("VideoPlayer.FileFilter"),
          extensions: ["mp4", "cast", "gz", "tar"]
        }
      ]
    });
    const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];

    await importPaths(paths);
  } catch (error: any) {
    addErrorToast({
      title: t("VideoPlayer.SelectFailed"),
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

function fileNativePath(file: File) {
  return (file as File & { path?: string }).path || "";
}

function resetDragState() {
  dragDepth = 0;
  isDragOver.value = false;
}

function handleDragEnter(event: DragEvent) {
  event.preventDefault();
  dragDepth += 1;
  isDragOver.value = true;
}

function handleDragOver(event: DragEvent) {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
}

function handleDragLeave(event: DragEvent) {
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) isDragOver.value = false;
}

function handleDrop(event: DragEvent) {
  event.preventDefault();
  resetDragState();

  const files = Array.from(event.dataTransfer?.files || []);
  if (files.length === 0) return;

  const paths = files.map(fileNativePath).filter(Boolean);
  if (isDesktopRuntime() && paths.length === files.length) {
    void importPaths(paths);
    return;
  }

  void importFiles(files);
}

watch(videoPlayerTourDemo, (on) => {
  if (on) {
    selectedId.value = VIDEO_PLAYER_TOUR_DEMO_ACTIVE_ID;
    return;
  }
  if (isVideoPlayerTourDemoItem(selectedId.value || "")) {
    selectedId.value = items.value[0]?.id ?? null;
  }
});

watch(
  () => playlistItems.value.length,
  (len, prevLen) => {
    if (prevLen === 0 && len > 0) playlistCollapsed.value = false;
  }
);

watch(
  [() => playlistItems.value.length, playlistCollapsed],
  () => {
    if (playlistItems.value.length === 0) {
      setRightPanelOpen(false);
      return;
    }

    setPanelBounds(PLAYLIST_COLLAPSED_WIDTH, PLAYLIST_MAX_WIDTH);
    setRightPanelOpen(true);
    setPanelWidth(playlistCollapsed.value ? PLAYLIST_COLLAPSED_WIDTH : PLAYLIST_DEFAULT_WIDTH);
  },
  { immediate: true }
);

onMounted(async () => {
  try {
    await desktopWindow.setTitle("JumpServer Video Player");
  } catch {
    // ignore when running in browser
  }
  void startTourOnce();
});

onBeforeUnmount(() => {
  destroyTour();
  resetPanelBounds();
  setRightPanelOpen(false);
  items.value.forEach(cleanupItem);

  if (isDesktopRuntime()) {
    const recordingIds = new Set(items.value.map((item) => item.recordingId));
    void Promise.allSettled([...recordingIds].map((recordingId) => removeRecording(recordingId)));
  }
});
</script>

<template>
  <div
    class="relative flex h-full min-h-0 flex-col overflow-hidden"
    :class="useIslandLayout ? '' : 'py-4 pl-4 pr-0'"
    @dragenter.prevent="handleDragEnter"
    @dragover.prevent="handleDragOver"
    @dragleave.prevent="handleDragLeave"
    @drop.prevent="handleDrop"
  >
    <div
      v-if="isDragOver && items.length > 0"
      class="pointer-events-none absolute inset-4 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10 text-sm font-medium text-primary"
    >
      {{ $t("VideoPlayer.DropToImport") }}
    </div>
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

    <p v-if="importMessage && items.length === 0" class="shrink-0 px-4 text-sm text-muted">
      {{ importMessage }}
    </p>

    <Teleport defer to="#offline-playlist-host">
      <div v-if="playlistItems.length > 0" class="flex h-full min-h-0 flex-col">
        <UTooltip v-if="playlistCollapsed" :text="$t('VideoPlayer.ExpandPlaylist')">
          <UButton
            color="neutral"
            variant="ghost"
            class="flex h-full min-h-0 w-full flex-col items-center gap-2 px-0 py-3"
            @click="playlistCollapsed = false"
          >
            <UIcon name="i-lucide-list-music" class="size-4 text-[var(--app-text-muted)]" />
            <UBadge color="primary" variant="subtle" size="sm">{{ playlistItems.length }}</UBadge>
          </UButton>
        </UTooltip>
        <VideoPlayerPlaylist
          v-else
          class="min-h-0 flex-1 px-3"
          :active-id="selectedId"
          :items="playlistItems"
          @play="selectItem"
          @remove="removeItem"
          @collapse="playlistCollapsed = true"
        />
      </div>
    </Teleport>

    <div data-videoplayer-tour="stage" class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <section v-if="items.length > 0" class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-black">
        <component
          :is="playerComponent"
          v-if="playerComponent && currentItem"
          :key="currentItem.id"
          class="h-full w-full min-h-0"
          :source="currentItem.source"
          :cast-data="currentItem.castData"
        />
      </section>

      <section v-else-if="videoPlayerTourFilled" class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-black">
        <div
          class="m-4 flex min-h-0 flex-1 items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10 text-sm font-medium text-primary"
        >
          {{ $t("VideoPlayer.DropToImport") }}
        </div>
      </section>

      <div v-else class="flex min-h-0 flex-1 overflow-hidden" :class="useIslandLayout ? '' : 'pr-4'">
        <div
          data-videoplayer-tour="import"
          class="flex min-h-0 flex-1 items-center justify-center border border-dashed px-6 py-6 text-center text-sm text-muted transition-colors"
          :class="[
            isDragOver ? 'border-primary bg-primary/5' : 'border-default',
            useIslandLayout ? 'rounded-[length:var(--workspace-island-radius)]' : ''
          ]"
        >
          <UButton
            color="neutral"
            variant="ghost"
            class="group flex h-auto cursor-pointer flex-col items-center gap-4 rounded-lg px-8 py-6"
            @click="fileInputRef?.click()"
          >
            <span
              class="flex h-16 w-16 items-center justify-center rounded-xl border border-default bg-muted text-3xl text-primary"
            >
              <UIcon name="line-md:upload-loop" />
            </span>
            <span class="max-w-xl text-center">
              <span class="block text-xl font-semibold tracking-tight text-highlighted">
                {{ $t("VideoPlayer.ImportTitle") }}
              </span>
              <span class="mt-2 block text-sm leading-6 text-muted">
                {{ $t("VideoPlayer.ImportHint") }}
              </span>
            </span>
            <span class="rounded-full bg-muted px-4 py-2 text-sm text-toned transition group-hover:bg-accented">
              {{ $t("VideoPlayer.ChooseFiles") }}
            </span>
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>
