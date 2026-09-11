<script setup lang="ts">
import type { VideoPlayerItem } from "~/composables/useVideoPlayerParser";

const props = defineProps<{
  activeId: string | null;
  items: VideoPlayerItem[];
}>();

const emit = defineEmits<{
  play: [VideoPlayerItem];
  remove: [VideoPlayerItem];
  collapse: [];
}>();

const { t } = useI18n();

interface PlaylistGroup {
  key: string;
  isPartGroup: boolean;
  representative: VideoPlayerItem;
  items: VideoPlayerItem[];
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

function displayValue(value: unknown) {
  const text =
    typeof value === "string"
      ? value
      : value && typeof value === "object" && "name" in value && typeof value.name === "string"
        ? value.name
        : "";
  if (!text) return "";
  const stripped = text.replace(/\s*\([^)]*\)/g, "").trim();
  return stripped || text;
}

function isPartSessionItem(item: VideoPlayerItem) {
  return (item.partTotal ?? 0) > 1;
}

function sessionGroupKey(item: VideoPlayerItem) {
  return `${item.type}:${item.meta?.id || item.recordingId}`;
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
    if (group.items[0]) group.representative = group.items[0];
  }

  return groups;
});

function partLabel(item: VideoPlayerItem) {
  if (item.partIndex != null && item.partTotal != null) {
    return t("VideoPlayer.PartIndex", { index: item.partIndex, total: item.partTotal });
  }
  return t("VideoPlayer.Part");
}

function groupHasActivePart(group: PlaylistGroup) {
  return group.items.some((item) => item.id === props.activeId);
}

function itemTypeIcon(type: VideoPlayerItem["type"]) {
  if (type === "cast") return "i-lucide-terminal";
  if (type === "gua") return "i-lucide-monitor";
  return "i-lucide-clapperboard";
}

function compactDuration(item: VideoPlayerItem) {
  const raw = formatDuration(item.meta?.duration, item.meta?.date_start, item.meta?.date_end);
  if (!raw || raw === "-") return "—";
  return raw.startsWith("00:") ? raw.slice(3) : raw;
}

function shortStamp(value?: string) {
  const full = formatLocalStartTime(value);
  if (full === "-") return "";
  const match = full.match(/(\d{2})\/(\d{2})\s+(\d{2}:\d{2})/);
  return match ? `${match[1]}-${match[2]} ${match[3]}` : full;
}

function itemSubline(item: VideoPlayerItem, active: boolean) {
  const bits: string[] = [];
  if (active) bits.push(t("VideoPlayer.Playing"));
  const user = displayValue(item.meta?.user);
  const account = displayValue(item.meta?.account);
  const protocol = typeof item.meta?.protocol === "string" ? item.meta.protocol.toUpperCase() : "";

  if (!user && !account && !protocol && !item.meta?.date_start) {
    bits.push(item.type === "mp4" ? t("VideoPlayer.LocalFile") : item.type.toUpperCase());
    if (item.type === "mp4") bits.push("MP4");
    return bits.join(" · ");
  }

  if (user) bits.push(user);
  if (account) bits.push(account);
  if (protocol) bits.push(protocol);
  if (!active) {
    const stamp = shortStamp(item.meta?.date_start);
    if (stamp) bits.push(stamp);
  }

  return bits.join(" · ");
}

function groupSubline(item: VideoPlayerItem) {
  const bits: string[] = [];
  if (item.meta?.user) bits.push(displayValue(item.meta.user));
  if (item.meta?.account) bits.push(displayValue(item.meta.account));
  if (typeof item.meta?.protocol === "string") bits.push(item.meta.protocol.toUpperCase());
  const stamp = shortStamp(item.meta?.date_start);
  if (stamp) bits.push(stamp);
  return bits.join(" · ") || t("VideoPlayer.Session");
}

function metaDetailRows(item: VideoPlayerItem) {
  const protocol = typeof item.meta?.protocol === "string" ? item.meta.protocol.toUpperCase() : "";
  return [
    { key: "user", label: t("Transcode.MetaUser"), value: displayValue(item.meta?.user) || "-" },
    {
      key: "asset",
      label: t("Transcode.MetaAsset"),
      value: displayValue(item.meta?.asset) || displayValue(itemAssetLabel(item)) || "-"
    },
    { key: "account", label: t("Transcode.MetaAccount"), value: displayValue(item.meta?.account) || "-" },
    { key: "addr", label: t("Transcode.MetaRemoteAddr"), value: item.meta?.remote_addr || "-" },
    { key: "protocol", label: t("Transcode.MetaProtocol"), value: protocol || "-" },
    { key: "start", label: t("Transcode.MetaDateStart"), value: formatLocalStartTime(item.meta?.date_start) },
    { key: "end", label: t("Transcode.MetaDateEnd"), value: formatLocalStartTime(item.meta?.date_end) }
  ];
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex items-center justify-between gap-2 py-2.5">
      <h3 class="min-w-0 truncate text-sm font-semibold text-[var(--app-text-primary)]">
        {{ $t("VideoPlayer.Playlist") }}
        <span class="font-medium text-[var(--app-text-muted)]">· {{ items.length }}</span>
      </h3>
      <div class="flex shrink-0 items-center">
        <UTooltip :text="$t('VideoPlayer.AddRecording')">
          <label for="videoplayer-file-input" data-videoplayer-tour="add" class="inline-flex">
            <UButton as="span" color="neutral" variant="ghost" size="xs" icon="i-lucide-plus" />
          </label>
        </UTooltip>
        <UTooltip :text="$t('VideoPlayer.CollapsePlaylist')">
          <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-panel-right" @click="emit('collapse')" />
        </UTooltip>
      </div>
    </div>

    <div class="playlist-scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pb-3">
      <template v-for="group in playlistGroups" :key="group.key">
        <UCollapsible
          v-if="group.isPartGroup"
          data-videoplayer-tour="parts"
          :default-open="true"
          class="my-1 overflow-hidden rounded-lg border border-[var(--app-border)]"
          :class="
            groupHasActivePart(group) ? 'border-[color-mix(in_srgb,var(--theme-accent)_38%,var(--app-border))]' : ''
          "
        >
          <template #default="{ open }">
            <div
              class="grid w-full grid-cols-[18px_minmax(0,1fr)_auto] gap-x-2 px-2.5 py-2 text-left hover:bg-[var(--app-hover-soft)]"
            >
              <UIcon
                name="i-lucide-chevron-right"
                class="size-4 self-center text-[var(--app-text-muted)] transition-transform"
                :class="open ? 'rotate-90' : ''"
              />
              <UPopover
                mode="hover"
                :open-delay="180"
                :close-delay="80"
                :arrow="true"
                :content="{ side: 'left', align: 'start', sideOffset: 8 }"
                class="min-w-0"
              >
                <div class="min-w-0">
                  <span class="block truncate text-sm font-medium text-[var(--app-text-primary)]">
                    {{ displayValue(itemAssetLabel(group.representative)) }}
                  </span>
                  <span class="block truncate text-[11px] text-[var(--app-text-muted)]">
                    {{ groupSubline(group.representative) }}
                  </span>
                </div>
                <template #content>
                  <dl class="grid min-w-[240px] grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 px-3 py-2.5 text-xs">
                    <template v-for="row in metaDetailRows(group.representative)" :key="row.key">
                      <dt class="text-[var(--app-text-muted)]">{{ row.label }}</dt>
                      <dd class="break-all text-[var(--app-text-primary)]">{{ row.value }}</dd>
                    </template>
                  </dl>
                </template>
              </UPopover>
              <span class="self-start font-mono text-[11px] tabular-nums text-[var(--app-text-muted)]">
                {{ $t("VideoPlayer.PartCount", { count: group.items.length }) }}
              </span>
            </div>
          </template>
          <template #content>
            <div class="flex flex-col gap-0.5 px-1.5 pb-1.5 pl-7">
              <div
                v-for="part in group.items"
                :key="part.id"
                role="button"
                tabindex="0"
                class="group relative grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-x-1.5 rounded-md px-2 py-1.5 text-left"
                :class="part.id === activeId ? 'bg-[var(--app-selected-soft)]' : 'hover:bg-[var(--app-hover-soft)]'"
                @click="emit('play', part)"
                @keydown.enter="emit('play', part)"
              >
                <span
                  class="size-1.5 justify-self-center rounded-full"
                  :class="
                    part.id === activeId
                      ? 'bg-primary shadow-[0_0_0_3px_color-mix(in_srgb,var(--theme-accent)_22%,transparent)]'
                      : 'bg-[var(--app-border)]'
                  "
                />
                <span class="min-w-0">
                  <span class="text-xs text-[var(--app-text-primary)]">{{ partLabel(part) }}</span>
                  <span class="text-[11px] text-[var(--app-text-muted)]">
                    ·
                    {{
                      part.id === activeId
                        ? $t("VideoPlayer.Playing")
                        : shortStamp(part.meta?.date_start) || compactDuration(part)
                    }}
                  </span>
                </span>
                <span class="font-mono text-[11px] tabular-nums text-[var(--app-text-muted)] group-hover:invisible">
                  {{ compactDuration(part) }}
                </span>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-x"
                  class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                  @click.stop="emit('remove', part)"
                />
              </div>
            </div>
          </template>
        </UCollapsible>

        <template v-else>
          <div
            v-for="item in group.items"
            :key="item.id"
            role="button"
            tabindex="0"
            class="group relative grid grid-cols-[18px_minmax(0,1fr)_auto] gap-x-2 rounded-md px-2.5 py-2 text-left"
            :class="item.id === activeId ? 'bg-[var(--app-selected-soft)]' : 'hover:bg-[var(--app-hover-soft)]'"
            @click="emit('play', item)"
            @keydown.enter="emit('play', item)"
          >
            <span v-if="item.id === activeId" class="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-primary" />
            <UIcon
              :name="itemTypeIcon(item.type)"
              class="size-4 self-center"
              :class="item.id === activeId ? 'text-primary' : 'text-[var(--app-text-muted)]'"
            />
            <UPopover
              mode="hover"
              :open-delay="180"
              :close-delay="80"
              :arrow="true"
              :content="{ side: 'left', align: 'start', sideOffset: 8 }"
              class="min-w-0"
            >
              <div data-videoplayer-tour="meta" class="min-w-0">
                <span class="block truncate text-sm font-medium text-[var(--app-text-primary)]">
                  {{ displayValue(itemAssetLabel(item)) }}
                </span>
                <span class="block truncate text-[11px] text-[var(--app-text-muted)]">
                  <span v-if="item.id === activeId" class="font-semibold text-primary">
                    {{ $t("VideoPlayer.Playing") }} ·
                  </span>
                  {{ itemSubline(item, false) }}
                </span>
              </div>
              <template #content>
                <dl class="grid min-w-[240px] grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 px-3 py-2.5 text-xs">
                  <template v-for="row in metaDetailRows(item)" :key="row.key">
                    <dt class="text-[var(--app-text-muted)]">{{ row.label }}</dt>
                    <dd class="break-all text-[var(--app-text-primary)]">{{ row.value }}</dd>
                  </template>
                </dl>
              </template>
            </UPopover>
            <span
              class="self-start font-mono text-[11px] tabular-nums text-[var(--app-text-muted)] group-hover:invisible"
            >
              {{ compactDuration(item) }}
            </span>
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-x"
              class="absolute top-1.5 right-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              @click.stop="emit('remove', item)"
            />
          </div>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.playlist-scroll {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--app-border) 85%, transparent) transparent;
}

.playlist-scroll::-webkit-scrollbar {
  width: 4px;
}

.playlist-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.playlist-scroll::-webkit-scrollbar-thumb {
  border-radius: 9999px;
  background: color-mix(in srgb, var(--app-border) 85%, transparent);
}
</style>
