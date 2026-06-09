<script setup lang="ts">
import type { VideoPlayerItem } from "~/composables/useVideoPlayerParser";

const props = defineProps<{
  activeId: string | null
  items: VideoPlayerItem[]
}>();

const emit = defineEmits<{
  play: [VideoPlayerItem]
  remove: [VideoPlayerItem]
}>();

interface PlaylistGroup {
  key: string
  isPartGroup: boolean
  representative: VideoPlayerItem
  items: VideoPlayerItem[]
}

function formatLocalStartTime(value?: string) {
  if (!value) return "-";

  const normalized = value
    .replace(/\//g, "-")
    .replace(" ", "T")
    .replace(/ ([+-]\d{2})(\d{2})$/, "$1:$2");

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return value.replace(/\s+[+-]\d{4}$/, "");
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

function formatDuration(duration?: string, startAt?: string, endAt?: string) {
  if (duration) return duration;
  if (!startAt || !endAt) return "-";

  const normalizedStart = startAt
    .replace(/\//g, "-")
    .replace(" ", "T")
    .replace(/ ([+-]\d{2})(\d{2})$/, "$1:$2");
  const normalizedEnd = endAt
    .replace(/\//g, "-")
    .replace(" ", "T")
    .replace(/ ([+-]\d{2})(\d{2})$/, "$1:$2");

  const start = new Date(normalizedStart);
  const end = new Date(normalizedEnd);
  const diff = end.getTime() - start.getTime();

  if (!Number.isFinite(diff) || diff < 0) return "-";

  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((value) => `${value}`.padStart(2, "0")).join(":");
}

function itemAssetLabel(item: VideoPlayerItem) {
  return item.meta?.asset || item.recordingLabel || item.name;
}

function stripParenthetical(value: string) {
  const stripped = value.replace(/\s*\([^)]*\)/g, "").trim();
  return stripped || value;
}

function displayValue(value: string) {
  return stripParenthetical(value);
}

function isPartSessionItem(item: VideoPlayerItem) {
  return item.type === "part" && (item.partTotal ?? 0) > 1;
}

function sessionGroupKey(item: VideoPlayerItem) {
  return item.meta?.id || item.recordingId;
}

const playlistGroups = computed<PlaylistGroup[]>(() => {
  const groups: PlaylistGroup[] = [];
  const partGroupMap = new Map<string, PlaylistGroup>();

  for (const item of props.items) {
    if (isPartSessionItem(item)) {
      const key = sessionGroupKey(item);
      let group = partGroupMap.get(key);

      if (!group) {
        group = { key, isPartGroup: true, representative: item, items: [] };
        partGroupMap.set(key, group);
        groups.push(group);
      }

      group.items.push(item);
      continue;
    }

    groups.push({ key: item.id, isPartGroup: false, representative: item, items: [item] });
  }

  for (const group of groups) {
    if (!group.isPartGroup) continue;
    group.items.sort((left, right) => (left.partIndex ?? 0) - (right.partIndex ?? 0));
  }

  return groups;
});

function sessionDetailFields(item: VideoPlayerItem) {
  return [
    { label: "账号", value: item.meta?.account || "-" },
    { label: "用户", value: item.meta?.user || "-" },
    { label: "协议", value: item.meta?.protocol || "-" }
  ];
}

function itemDetailFields(item: VideoPlayerItem) {
  return [
    ...sessionDetailFields(item),
    { label: "开始时间", value: formatLocalStartTime(item.meta?.date_start) },
    {
      label: "总时长",
      value: formatDuration(item.meta?.duration, item.meta?.date_start, item.meta?.date_end)
    }
  ];
}

function partDetailFields(item: VideoPlayerItem) {
  return [
    { label: "开始时间", value: formatLocalStartTime(item.meta?.date_start) },
    {
      label: "总时长",
      value: formatDuration(item.meta?.duration, item.meta?.date_start, item.meta?.date_end)
    }
  ];
}

function partLabel(item: VideoPlayerItem) {
  if (item.partIndex && item.partTotal) {
    return `片段 ${item.partIndex} / ${item.partTotal}`;
  }

  return "片段";
}

function groupHasActivePart(group: PlaylistGroup) {
  return group.items.some((item) => item.id === props.activeId);
}

</script>

<template>
  <div class="flex h-full min-h-0 flex-col rounded-xl border-2 border-(--ui-border) p-4">
    <div class="mb-3 flex items-center justify-between gap-3">
      <h3 class="min-w-0 text-sm font-semibold tracking-wide text-(--ui-text-highlighted)">
        播放列表
      </h3>
      <div class="flex shrink-0 items-center gap-2">
        <span class="rounded-full border border-(--ui-primary)/30 px-2.5 py-1 text-xs font-medium text-(--ui-primary)">
          {{ items.length }}
        </span>
        <label
          for="videoplayer-file-input"
          class="cursor-pointer rounded-full border border-(--ui-border) px-3 py-1 text-xs font-medium text-(--ui-text-toned) transition hover:border-(--ui-primary)/50 hover:text-(--ui-primary)"
        >
          添加录像
        </label>
      </div>
    </div>

    <div class="playlist-scroll flex h-[calc(100%-3.2rem)] flex-col gap-2 overflow-y-auto pr-1">
      <template v-for="group in playlistGroups" :key="group.key">
        <div
          v-if="group.isPartGroup"
          class="rounded-lg border border-(--ui-border) p-2"
          :class="groupHasActivePart(group) ? 'border-(--ui-primary)/40' : ''"
        >
          <div class="px-1 pb-2">
            <UTooltip
              arrow
              :text="itemAssetLabel(group.representative)"
              :disabled="displayValue(itemAssetLabel(group.representative)) === itemAssetLabel(group.representative)"
            >
              <p class="truncate text-sm font-medium text-(--ui-text-highlighted)">
                {{ displayValue(itemAssetLabel(group.representative)) }}
              </p>
            </UTooltip>
            <p
              v-for="field in sessionDetailFields(group.representative)"
              :key="field.label"
              class="mt-1 flex min-w-0 items-center text-[11px] text-(--ui-text-muted)"
            >
              <span class="shrink-0">{{ field.label }}&nbsp;</span>
              <span class="min-w-0 flex-1 overflow-hidden">
                <UTooltip
                  arrow
                  :text="field.value"
                  :disabled="displayValue(field.value) === field.value"
                >
                  <span class="block truncate">{{ displayValue(field.value) }}</span>
                </UTooltip>
              </span>
            </p>
          </div>

          <div class="flex flex-col gap-1 border-t border-(--ui-border) pt-2">
            <button
              v-for="part in group.items"
              :key="part.id"
              class="group flex items-start justify-between rounded-md px-2 py-2 text-left transition-colors duration-150"
              :class="part.id === activeId
                ? 'bg-(--ui-primary)/8'
                : 'hover:bg-(--ui-bg-accented)/60'"
              @click="emit('play', part)"
            >
              <div class="min-w-0 flex-1 overflow-hidden pr-1">
                <p class="text-[11px] font-medium uppercase tracking-[0.14em] text-(--ui-text-toned)">
                  {{ partLabel(part) }}
                </p>
                <p
                  v-for="field in partDetailFields(part)"
                  :key="field.label"
                  class="mt-1 flex min-w-0 items-center text-[11px] text-(--ui-text-muted)"
                >
                  <span class="shrink-0">{{ field.label }}&nbsp;</span>
                  <span class="min-w-0 flex-1 overflow-hidden">
                    <UTooltip
                      arrow
                      :text="field.value"
                      :disabled="displayValue(field.value) === field.value"
                    >
                      <span class="block truncate">{{ displayValue(field.value) }}</span>
                    </UTooltip>
                  </span>
                </p>
              </div>
              <UButton
                color="neutral"
                variant="ghost"
                icon="line-md:close-small"
                class="opacity-70 group-hover:opacity-100"
                @click.stop="emit('remove', part)"
              />
            </button>
          </div>
        </div>

        <template v-else>
          <button
            v-for="item in group.items"
            :key="item.id"
            class="group flex items-start justify-between rounded-lg px-2 py-2.5 text-left transition-colors duration-150"
            :class="item.id === activeId
              ? 'bg-(--ui-primary)/8'
              : 'hover:bg-(--ui-bg-accented)/60'"
            @click="emit('play', item)"
          >
            <div class="min-w-0 flex-1 overflow-hidden pr-1">
              <UTooltip
                arrow
                :text="itemAssetLabel(item)"
                :disabled="displayValue(itemAssetLabel(item)) === itemAssetLabel(item)"
              >
                <p class="truncate text-sm font-medium text-(--ui-text-highlighted)">
                  {{ displayValue(itemAssetLabel(item)) }}
                </p>
              </UTooltip>
              <p
                v-for="field in itemDetailFields(item)"
                :key="field.label"
                class="mt-1 flex min-w-0 items-center text-[11px] text-(--ui-text-muted)"
              >
                <span class="shrink-0">{{ field.label }}&nbsp;</span>
                <span class="min-w-0 flex-1 overflow-hidden">
                  <UTooltip
                    arrow
                    :text="field.value"
                    :disabled="displayValue(field.value) === field.value"
                  >
                    <span class="block truncate">{{ displayValue(field.value) }}</span>
                  </UTooltip>
                </span>
              </p>
            </div>
            <UButton
              color="neutral"
              variant="ghost"
              icon="line-md:close-small"
              class="opacity-70 group-hover:opacity-100"
              @click.stop="emit('remove', item)"
            />
          </button>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.playlist-scroll {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--ui-border) 85%, transparent) transparent;
}

.playlist-scroll::-webkit-scrollbar {
  width: 4px;
}

.playlist-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.playlist-scroll::-webkit-scrollbar-thumb {
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ui-border) 85%, transparent);
}

.playlist-scroll::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--ui-text-dimmed) 55%, transparent);
}
</style>
