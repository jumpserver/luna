<script setup lang="ts">
import type { VideoPlayerItem } from "~/composables/useVideoPlayerParser";

definePageMeta({
  layout: "default"
});

const toast = useToast();
const fileInputRef = ref<HTMLInputElement | null>(null);
const isImporting = ref(false);
const items = ref<VideoPlayerItem[]>([]);
const activeId = ref<string | null>(null);
const importMessage = ref("");
const playlistCollapsed = ref(false);

const { parseFiles } = useVideoPlayerParser();
const { deleteTempFile } = useVideoPlayerTauri();

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

watch(() => items.value.length, (len, prevLen) => {
  if (prevLen === 0 && len > 0) {
    playlistCollapsed.value = false;
  }
});

onMounted(async () => {
  document.title = "JumpServer Video Player";

  try {
    await useTauriWindowGetCurrentWindow().setTitle("JumpServer Video Player");
  } catch {
    // ignore when running in browser
  }
});

onBeforeUnmount(async () => {
  await Promise.all(items.value.map((item) => cleanupItem(item)));
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
      @change="handleInputChange"
    >

    <p v-if="importMessage && items.length === 0" class="shrink-0 text-sm text-(--ui-text-muted)">
      {{ importMessage }}
    </p>

    <div class="flex min-h-0 flex-1 overflow-hidden" :class="importMessage && items.length === 0 ? 'pt-3' : ''">
      <section
        class="flex min-h-0 min-w-0 flex-1 flex-col"
        :class="items.length > 0 && !playlistCollapsed ? 'pr-3' : ''"
      >
        <div
          v-if="playerComponent && currentItem"
          class="flex min-h-0 flex-1 flex-col overflow-hidden bg-black"
        >
          <component
            :is="playerComponent"
            :key="currentItem.id"
            :source="currentItem.source"
            :cast-data="currentItem.castData"
          />
        </div>
        <div
          v-else
          class="flex min-h-0 flex-1 items-center justify-center border border-dashed border-(--ui-border) px-6 py-6 text-center text-sm text-(--ui-text-muted)"
        >
          <button
            type="button"
            class="group flex cursor-pointer flex-col items-center gap-4 rounded-lg px-8 py-6 transition hover:bg-(--ui-bg-muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ui-primary)"
            @click="fileInputRef?.click()"
          >
            <span
              class="flex h-16 w-16 items-center justify-center rounded-xl border border-(--ui-border) bg-(--ui-bg-muted) text-3xl text-(--ui-primary)"
            >
              <UIcon name="line-md:upload-loop" />
            </span>
            <span class="max-w-xl">
              <span class="block text-xl font-semibold tracking-tight text-(--ui-text-highlighted)">导入录像文件</span>
              <span class="mt-2 block text-sm leading-6 text-(--ui-text-muted)">
                将录像拖入播放区，或点击这里选择 `.mp4`、`.gz`、`.tar` 文件。
              </span>
            </span>
            <span
              class="rounded-full bg-(--ui-bg-muted) px-4 py-2 text-sm text-(--ui-text-toned) transition group-hover:bg-(--ui-bg-accented)"
            >
              选择文件
            </span>
          </button>
        </div>
      </section>

      <aside
        v-if="items.length > 0"
        class="flex shrink-0 flex-col border-l border-(--ui-border) transition-[width] duration-200 ease-out"
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
          :active-id="activeId"
          :items="items"
          @play="selectItem"
          @remove="removeItem"
          @collapse="playlistCollapsed = true"
        />

        <div v-else class="flex flex-col items-center gap-2 pt-1">
          <UIcon name="i-lucide-list-music" class="size-4 text-(--ui-text-dimmed)" />
          <span class="rounded-full bg-(--ui-primary)/10 px-1.5 py-0.5 text-[10px] font-medium text-(--ui-primary)">
            {{ items.length }}
          </span>
        </div>
      </aside>
    </div>
  </div>
</template>
