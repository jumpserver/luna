<script setup lang="ts">
import type { VideoPlayerItem } from "~/composables/useVideoPlayerParser";

definePageMeta({
  layout: false
});

const toast = useToast();
const fileInputRef = ref<HTMLInputElement | null>(null);
const isImporting = ref(false);
const items = ref<VideoPlayerItem[]>([]);
const activeId = ref<string | null>(null);
const importMessage = ref("");
const VIDEO_PLAYER_MIN_WIDTH = 1320;
const VIDEO_PLAYER_MIN_HEIGHT = 860;
const VIDEO_PLAYER_TARGET_WIDTH = 1480;
const VIDEO_PLAYER_TARGET_HEIGHT = 920;

const { parseFiles } = useVideoPlayerParser();
const { deleteTempFile } = useVideoPlayerTauri();
const { userTheme, manualSetTheme } = useThemeAdapter();

const currentItem = computed(() => items.value.find((item) => item.id === activeId.value) || null);
const isDarkMode = computed(() => userTheme.value === "dark");

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

async function cleanupItem(item: VideoPlayerItem) {
  if (item.source.startsWith("blob:")) {
    URL.revokeObjectURL(item.source);
  }

  if (item.tempPath) {
    try {
      await deleteTempFile(item.tempPath);
    } catch {
      // ignore cleanup errors
    }
  }
}

function selectItem(item: VideoPlayerItem) {
  activeId.value = item.id;
}

async function removeItem(item: VideoPlayerItem) {
  await cleanupItem(item);
  items.value = items.value.filter((entry) => entry.id !== item.id);

  if (activeId.value === item.id) {
    activeId.value = items.value[0]?.id || null;
  }
}

async function importFiles(files: File[]) {
  if (files.length === 0) return;

  isImporting.value = true;
  importMessage.value = `正在导入 ${files.length} 个文件…`;

  try {
    const parsed = await parseFiles(files);

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

    items.value.push(...incoming);

    if (!activeId.value && incoming[0]) {
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
  } catch (error: any) {
    importMessage.value = "";
    toast.add({
      title: "导入失败",
      description: error?.message || String(error),
      color: "error"
    });
  } finally {
    isImporting.value = false;
  }
}

function handleInputChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const files = Array.from(target.files || []);
  target.value = "";
  void importFiles(files);
}

function toggleThemeMode() {
  manualSetTheme(isDarkMode.value ? "light" : "dark");
}

async function optimizeWindowForVideoPlayer() {
  try {
    const currentWindow = useTauriWindowGetCurrentWindow();
    const minSize = new useTauriWindowLogicalSize(VIDEO_PLAYER_MIN_WIDTH, VIDEO_PLAYER_MIN_HEIGHT);

    await currentWindow.setMinSize(minSize);

    const currentSize = await currentWindow.innerSize();
    const scaleFactor = await currentWindow.scaleFactor();
    const currentLogicalWidth = currentSize.width / scaleFactor;
    const currentLogicalHeight = currentSize.height / scaleFactor;
    const nextWidth = Math.max(currentLogicalWidth, VIDEO_PLAYER_TARGET_WIDTH);
    const nextHeight = Math.max(currentLogicalHeight, VIDEO_PLAYER_TARGET_HEIGHT);

    if (nextWidth !== currentLogicalWidth || nextHeight !== currentLogicalHeight) {
      await currentWindow.setSize(new useTauriWindowLogicalSize(nextWidth, nextHeight));
    }
  } catch (error) {
    console.debug("optimize video player window failed", error);
  }
}

onMounted(async () => {
  document.title = "JumpServer Video Player";

  try {
    const currentWindow = useTauriWindowGetCurrentWindow();
    await currentWindow.setTitle("JumpServer Video Player");
    await optimizeWindowForVideoPlayer();
  } catch {
    // ignore when running in browser
  }
});

onBeforeUnmount(async () => {
  await Promise.all(items.value.map((item) => cleanupItem(item)));

  try {
    await useTauriWindowGetCurrentWindow().setMinSize(null);
  } catch {
    // ignore when running in browser
  }
});
</script>

<template>
  <div class="videoplayer-page h-screen overflow-hidden">
    <input
      id="videoplayer-file-input"
      ref="fileInputRef"
      class="sr-only"
      type="file"
      multiple
      accept=".mp4,.gz,.tar,.json,.cast"
      @change="handleInputChange"
    />

    <div class="mx-auto flex h-full w-full max-w-[1700px] flex-col px-6 py-5 lg:px-8">
      <header data-tauri-drag-region class="mb-2 flex items-center justify-between gap-4">
        <div data-tauri-drag-region />

        <div class="flex items-center gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :icon="
              isDarkMode
                ? 'line-md:moon-filled-to-sunny-filled-loop-transition'
                : 'line-md:sunny-filled-loop-to-moon-filled-transition'
            "
            @click="toggleThemeMode"
          >
            {{ isDarkMode ? "切换浅色" : "切换暗色" }}
          </UButton>

          <UButton color="neutral" variant="ghost" to="/linux">返回主界面</UButton>
        </div>
      </header>

      <p v-if="importMessage && items.length === 0" class="mb-4 text-sm text-(--ui-text-muted)">
        {{ importMessage }}
      </p>

      <div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1.9fr)_minmax(280px,0.78fr)] gap-5">
        <section class="min-h-0 min-w-0 overflow-hidden rounded-xl border-2 border-(--ui-border)">
          <div class="flex h-full min-h-0 overflow-hidden bg-black">
            <div class="h-full min-w-0 flex-1 overflow-hidden bg-black">
              <component
                :is="playerComponent"
                v-if="playerComponent && currentItem"
                :key="currentItem.id"
                :source="currentItem.source"
                :cast-data="currentItem.castData"
              />
              <label
                v-else
                for="videoplayer-file-input"
                class="group flex h-full w-full cursor-pointer flex-col items-center justify-center gap-4 px-6 py-6 text-center"
              >
                <div
                  class="flex h-16 w-16 items-center justify-center rounded-xl bg-white/8 text-3xl text-(--ui-primary)"
                >
                  <UIcon name="line-md:upload-loop" />
                </div>
                <div class="max-w-xl">
                  <p class="text-xl font-semibold tracking-tight text-(--ui-text-highlighted)">导入录像文件</p>
                  <p class="mt-2 text-sm leading-6 text-(--ui-text-muted)">
                    将录像拖入播放区，或点击这里选择 `.mp4`、`.gz`、`.tar` 文件。
                  </p>
                </div>
                <div
                  class="rounded-full border-0 bg-(--ui-bg-muted) px-4 py-2 text-sm text-(--ui-text-toned) transition group-hover:bg-(--ui-bg-accented)"
                >
                  选择文件
                </div>
              </label>
            </div>
          </div>
        </section>

        <aside class="min-h-0 min-w-0 overflow-hidden">
          <VideoPlayerPlaylist
            v-if="items.length > 0"
            :active-id="activeId"
            :items="items"
            @play="selectItem"
            @remove="removeItem"
          />
          <div
            v-else
            class="flex h-full min-h-0 flex-col rounded-xl border-2 border-(--ui-border) p-4"
          >
            <p class="mb-3 text-[11px] uppercase tracking-[0.2em] text-(--ui-text-dimmed)">播放列表</p>

            <div
              class="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-(--ui-border) p-3"
            >
              <div class="flex max-w-[240px] flex-col items-center text-center">
                <div
                  class="flex h-12 w-12 items-center justify-center rounded-xl border border-(--ui-border) text-2xl text-(--ui-text-dimmed)"
                >
                  <UIcon name="line-md:list-3" />
                </div>
                <p class="mt-4 text-sm font-medium text-(--ui-text-highlighted)">暂无播放片段</p>
                <p class="mt-2 text-xs leading-5 text-(--ui-text-muted)">导入录像后，这里会显示可切换的片段列表。</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.videoplayer-page {
  color: var(--ui-text);
  background:
    radial-gradient(
      circle at top left,
      color-mix(in srgb, var(--ui-color-primary-500) 14%, transparent) 0%,
      transparent 30%
    ),
    radial-gradient(circle at right, color-mix(in srgb, var(--ui-bg-elevated) 65%, transparent) 0%, transparent 26%),
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--ui-bg) 90%, var(--ui-bg-elevated) 10%) 0%,
      color-mix(in srgb, var(--ui-bg) 98%, black 2%) 100%
    );
}
</style>
