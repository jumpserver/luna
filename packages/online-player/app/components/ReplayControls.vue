<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { ReplayCommand, ReplayPartItem } from "#online-player/types";
import { REPLAY_SPEEDS } from "#online-player/types";
import { formatClock } from "#online-player/utils/time";

const props = defineProps<{
  playing: boolean;
  seeking: boolean;
  positionMs: number;
  durationMs: number;
  durationReady?: boolean;
  speed: number;
  commands: ReplayCommand[];
  parts: ReplayPartItem[];
  showParts?: boolean;
  activePartSrc?: string;
  activeCommandOffset?: number;
  showCommandRail?: boolean;
  commandRailOpen?: boolean;
  speedDisabled?: boolean;
  downloadUrl?: string;
}>();

const emit = defineEmits<{
  toggle: [];
  restart: [];
  seek: [number];
  selectCommand: [ReplayCommand];
  selectPart: [ReplayPartItem];
  toggleCommandRail: [];
  "update:speed": [number];
}>();

const { t } = useI18n();
const partsOpen = ref(false);

const activePartIndex = computed(() => {
  const index = props.parts.findIndex((item) => item.src === props.activePartSrc);
  return index >= 0 ? index : 0;
});

function onSelectPart(item: ReplayPartItem) {
  emit("selectPart", item);
  partsOpen.value = false;
}

function onSlide(value: number | number[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;
  if (typeof next !== "number") return;
  emit("seek", next);
}

const ticks = computed(() =>
  props.commands
    .filter((item) => props.durationMs > 0 && item.offsetMs <= props.durationMs)
    .map((item) => ({
      id: item.id || `${item.timestamp}`,
      left: `${(item.offsetMs / props.durationMs) * 100}%`,
      danger: (item.risk_level || 0) >= 4,
      active: item.offsetMs === props.activeCommandOffset,
      command: item
    }))
);

const speedItems = computed<DropdownMenuItem[][]>(() => [
  REPLAY_SPEEDS.map((item) => ({
    label: `${item.toFixed(1)}×`,
    icon: item === props.speed ? "i-lucide-check" : undefined,
    onSelect() {
      emit("update:speed", item);
    }
  }))
]);

const sliderReady = computed(() => Boolean(props.durationReady) && props.durationMs > 0 && !props.seeking);
</script>

<template>
  <div class="replay-controls relative z-20 flex shrink-0 flex-col" data-replay-controls>
    <div class="replay-progress-bar relative" data-replay-progress>
      <USlider
        :model-value="positionMs"
        :min="0"
        :max="Math.max(durationMs, 1)"
        :step="1"
        :disabled="!sliderReady"
        size="xs"
        :ui="{
          root: 'replay-progress-slider h-1.5 items-stretch',
          track: 'h-1.5 rounded-none bg-[var(--replay-border-strong)]',
          range: 'inset-y-0 h-full rounded-none bg-primary',
          thumb: sliderReady
            ? 'replay-progress-thumb z-10 size-3 border-0 bg-[var(--replay-fg)] opacity-0 shadow-[0_1px_4px_rgb(0_0_0_/_30%)] transition-opacity duration-150'
            : 'hidden'
        }"
        @update:model-value="onSlide"
      />
      <button
        v-for="tick in ticks"
        :key="tick.id"
        type="button"
        class="replay-command-marker"
        :class="{ 'is-danger': tick.danger, 'is-active': tick.active }"
        :style="{ left: tick.left }"
        :aria-label="`${tick.command.atime} ${tick.command.input}`"
        @click.stop="emit('selectCommand', tick.command)"
      >
        <span class="replay-command-marker-tick" />
        <span class="replay-command-marker-label">{{ tick.command.input }}</span>
      </button>
    </div>

    <div class="replay-controls-row flex h-16 items-center gap-4 px-5">
      <div class="flex items-center gap-1.5">
        <UButton
          color="neutral"
          variant="ghost"
          size="md"
          square
          class="replay-play-button replay-control-icon-button size-10 rounded-md p-0 text-[var(--replay-fg)]"
          :icon="playing ? 'i-lucide-pause' : 'i-lucide-play'"
          :ui="{ leadingIcon: 'm-0 size-5' }"
          :disabled="seeking"
          :aria-label="playing ? t('Replay.Pause') : t('Replay.Play')"
          @click="emit('toggle')"
        />
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          square
          class="replay-restart-button replay-control-icon-button size-[34px] rounded-[5px] p-0 text-[var(--replay-muted)]"
          icon="i-lucide-rotate-cw"
          :ui="{ leadingIcon: 'm-0 size-4' }"
          :disabled="seeking"
          :aria-label="t('Replay.Restart')"
          @click="emit('restart')"
        />
      </div>
      <span class="ml-1 flex items-center gap-2 font-mono text-xs tabular text-[var(--replay-muted)]">
        {{ formatClock(positionMs) }}
        <span class="opacity-45">/</span>
        {{ formatClock(durationMs) }}
      </span>

      <div class="flex-1" />

      <div class="replay-controls-actions flex h-8 shrink-0 items-center gap-1">
        <UPopover
          v-if="showParts && parts.length > 0"
          v-model:open="partsOpen"
          :content="{ align: 'end', side: 'top', sideOffset: 12 }"
          :ui="{ content: 'p-0' }"
        >
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-layout-grid"
            trailing-icon="i-lucide-chevron-down"
            class="replay-parts-button h-full max-w-48 font-mono text-[11.5px] font-normal text-[var(--replay-muted)]"
            :label="`${t('Replay.Playlist')} ${activePartIndex + 1}/${parts.length}`"
            data-replay-parts
          />

          <template #content>
            <div class="replay-parts-popover w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-lg">
              <div class="flex items-center justify-between border-b border-[var(--replay-border)] px-3.5 py-3">
                <span class="text-[11.5px] font-semibold tracking-[0.05em] text-[var(--replay-fg)] uppercase">
                  {{ t("Replay.Playlist") }}
                </span>
                <span
                  class="rounded-sm bg-[var(--replay-chip)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--replay-muted)]"
                >
                  {{ parts.length }}
                </span>
              </div>
              <div class="max-h-72 overflow-y-auto p-1.5">
                <button
                  v-for="(item, index) in parts"
                  :key="item.src || item.name"
                  type="button"
                  class="flex w-full items-center gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors"
                  :class="
                    item.src === activePartSrc
                      ? 'border-[color-mix(in_srgb,var(--ui-color-primary-500)_35%,transparent)] bg-[color-mix(in_srgb,var(--ui-color-primary-500)_10%,transparent)]'
                      : 'border-transparent hover:border-[var(--replay-border)] hover:bg-[var(--replay-hover)]'
                  "
                  data-replay-part
                  @click="onSelectPart(item)"
                >
                  <span
                    class="grid size-8 shrink-0 place-items-center rounded-md font-mono text-sm font-semibold"
                    :class="
                      item.src === activePartSrc
                        ? 'bg-primary text-[var(--app-accent-foreground)]'
                        : 'bg-[var(--replay-chip)] text-[var(--replay-muted)]'
                    "
                  >
                    {{ index + 1 }}
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-xs font-medium text-[var(--replay-fg)]">{{ item.name }}</span>
                    <span class="mt-0.5 block font-mono text-[10.5px] text-[var(--replay-muted)]">
                      {{ item.durationLabel }} · {{ item.sizeLabel }}
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </template>
        </UPopover>

        <UDropdownMenu :items="speedItems" :content="{ align: 'end' }">
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            class="replay-speed-button h-full min-w-[46px] justify-center font-mono text-[11.5px] font-normal tabular text-[var(--replay-muted)]"
            :disabled="speedDisabled || seeking"
            :label="`${speed.toFixed(1)}×`"
            data-replay-speed
          />
        </UDropdownMenu>
        <UButton
          v-if="downloadUrl"
          :href="downloadUrl"
          external
          color="neutral"
          variant="ghost"
          size="xs"
          square
          class="replay-control-icon-button replay-download-button size-8 shrink-0 p-0 text-[var(--replay-muted)]"
          icon="i-lucide-download"
          :ui="{ leadingIcon: 'm-0 size-4' }"
          :aria-label="t('Replay.Download')"
          data-replay-download
        />
        <UButton
          v-if="showCommandRail"
          color="neutral"
          variant="ghost"
          size="xs"
          square
          class="replay-control-icon-button replay-command-rail-button size-8 shrink-0 p-0 text-[var(--replay-muted)]"
          icon="i-solar-full-screen-square-broken"
          :ui="{ leadingIcon: 'm-0 size-4' }"
          :aria-label="commandRailOpen ? t('Replay.HideRail') : t('Replay.ShowRail')"
          data-replay-command-rail
          @click="emit('toggleCommandRail')"
        />
      </div>
    </div>
  </div>
</template>
