<script setup lang="ts">
import type { ReplayCommand, ReplayPartItem, ReplayPlayerHandle } from "#online-player/types";
import ReplayPlayerHost from "#online-player/components/players/ReplayPlayerHost.vue";
import ReplayControls from "#online-player/components/ReplayControls.vue";
import ReplayHeader from "#online-player/components/ReplayHeader.vue";
import ReplayRail from "#online-player/components/ReplayRail.vue";
import ReplayStateOverlay from "#online-player/components/ReplayStateOverlay.vue";
import ReplayWatermark from "#online-player/components/ReplayWatermark.vue";
import { useReplayCommands } from "#online-player/composables/useReplayCommands";
import { useReplayParts } from "#online-player/composables/useReplayParts";
import { useReplaySession } from "#online-player/composables/useReplaySession";
import { COMMAND_SEEK_LEAD_MS } from "#online-player/types";
import { createDurationGate } from "#online-player/utils/durationReady";
import { commandSeekLeadMs, resolveReplayOverlay, shouldShowReplayRail } from "#online-player/utils/replay";

const props = defineProps<{
  blocked?: boolean;
}>();

const { t } = useI18n();
const route = useRoute();
const sessionId = computed(() => String(route.params.sid || ""));
const queryStartMs = computed(() => {
  const raw = Number(route.query.timestamp);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.max(0, raw * 1000 - COMMAND_SEEK_LEAD_MS);
});

const { replay, status, errorMessage, watermark, reload } = useReplaySession(() =>
  props.blocked ? "" : sessionId.value
);
const {
  parts,
  current: currentPart,
  loading: partsLoading,
  preparing: partsPreparing,
  error: partsError,
  partType,
  selectPart
} = useReplayParts(
  () => replay.value,
  () => sessionId.value
);
const {
  commands,
  loading: commandsLoading,
  error: commandsError,
  loadMore,
  reload: reloadCommands
} = useReplayCommands(
  () => replay.value,
  () => currentPart.value?.date_start
);

const playerRef = useTemplateRef("player");
const playing = ref(false);
const seeking = ref(false);
const positionMs = ref(0);
const durationMs = ref(0);
const durationReady = ref(false);
const speed = ref(1);
const railCollapsed = ref(true);
const activeCommandOffset = ref<number | null>(null);
const playerError = ref("");
const durationGate = createDurationGate();

const playerApi = (): ReplayPlayerHandle | null => {
  const instance = playerRef.value as ReplayPlayerHandle | null;
  if (!instance || typeof instance.play !== "function") return null;
  return instance;
};

const playerType = computed(() => {
  if (replay.value?.type === "parts") return partType.value || currentPart.value?.type || "";
  return replay.value?.type || "";
});

const playerSrc = computed(() => {
  if (replay.value?.type === "parts") return currentPart.value?.src || "";
  return replay.value?.src || "";
});

const headerReplay = computed(() => currentPart.value || replay.value);
const downloadUrl = computed(() => headerReplay.value?.download_url || replay.value?.download_url || "");
const supportedType = computed(() => ["asciicast", "guacamole", "mp4"].includes(playerType.value));
const overlayKind = computed(() =>
  resolveReplayOverlay({
    blocked: props.blocked,
    status: status.value,
    partsPreparing: partsPreparing.value,
    isParts: replay.value?.type === "parts",
    partsEmpty: parts.value.length === 0,
    partsLoading: partsLoading.value,
    unsupported: status.value === "ready" && Boolean(playerType.value) && !supportedType.value
  })
);
const overlayMessage = computed(() => {
  if (overlayKind.value === "error" && partsError.value) return partsError.value;
  if (overlayKind.value === "error" && status.value === "ready" && playerType.value && !supportedType.value) {
    return t("Replay.UnsupportedHint");
  }
  return errorMessage.value;
});
const showRail = computed(() =>
  shouldShowReplayRail({
    overlay: Boolean(overlayKind.value),
    commandCount: commands.value.length,
    commandsLoading: commandsLoading.value,
    commandsError: Boolean(commandsError.value)
  })
);
const speedDisabled = computed(() => playerType.value === "guacamole");
const asciiBleed = computed(() => playerType.value === "asciicast");
const guacamoleFill = computed(() => playerType.value === "guacamole");

watch(
  () => [commands.value.length, commandsError.value, commandsLoading.value] as const,
  ([count, , loading]) => {
    if (count === 0 && !loading) railCollapsed.value = true;
  }
);

watch(playerSrc, () => {
  playerError.value = "";
  playing.value = Boolean(playerSrc.value);
  durationGate.reset();
  durationReady.value = false;
});

watch(durationMs, (value) => {
  durationGate.note(value);
});

useIntervalFn(() => {
  durationReady.value = durationGate.isSettled();
}, 250);

function togglePlayback() {
  const api = playerApi();
  if (!api) return;

  const nextPlaying = !playing.value;
  playing.value = nextPlaying;
  if (nextPlaying) api.play();
  else api.pause();
}

async function restart() {
  const api = playerApi();
  if (!api) return;

  activeCommandOffset.value = null;
  positionMs.value = 0;
  playing.value = true;
  await api.seek(0);
  api.play();
}

async function seekTo(ms: number) {
  positionMs.value = Math.max(0, ms);
  await playerApi()?.seek(positionMs.value);
}

function cancelSeek() {
  playerApi()?.cancelSeek?.();
  seeking.value = false;
}

function onSelectCommand(item: ReplayCommand) {
  activeCommandOffset.value = item.offsetMs;
  void seekTo(Math.max(0, item.offsetMs - commandSeekLeadMs(playerType.value)));
}

function onSelectPart(item: ReplayPartItem) {
  selectPart(item);
  playing.value = false;
  positionMs.value = 0;
  activeCommandOffset.value = null;
}

function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
  if (seeking.value) return;

  if (event.code === "Space") {
    event.preventDefault();
    togglePlayback();
    return;
  }

  if (event.code === "ArrowLeft") {
    event.preventDefault();
    void seekTo(positionMs.value - COMMAND_SEEK_LEAD_MS);
    return;
  }

  if (event.code === "ArrowRight") {
    event.preventDefault();
    void seekTo(positionMs.value + COMMAND_SEEK_LEAD_MS);
  }
}

useEventListener(window, "keydown", onKeydown);

watch(
  () => replay.value?.asset || replay.value?.id,
  (title) => {
    if (title) document.title = `${title} · ${t("Replay.Title")}`;
  }
);
</script>

<template>
  <div class="replay-shell flex h-full min-h-0 flex-col" data-replay-root>
    <ReplayHeader v-if="headerReplay && !overlayKind" :replay="headerReplay" />

    <div class="relative flex min-h-0 flex-1 flex-col md:flex-row">
      <ReplayStateOverlay v-if="overlayKind" :kind="overlayKind" :message="overlayMessage" @retry="reload" />

      <template v-else>
        <div class="replay-stage group relative flex min-h-0 min-w-0 flex-1 flex-col" data-replay-stage>
          <div class="relative z-10 min-h-0 flex-1">
            <div
              class="replay-frame h-full min-h-0 w-full overflow-hidden"
              :class="
                asciiBleed
                  ? ''
                  : guacamoleFill
                    ? 'flex items-center justify-center bg-black'
                    : 'flex items-center justify-center p-4 pb-16'
              "
            >
              <div
                class="relative h-full min-h-0 w-full overflow-hidden"
                :class="
                  asciiBleed
                    ? ''
                    : guacamoleFill
                      ? 'bg-black'
                      : 'max-h-[min(74%,680px)] max-w-[min(90%,1280px)] rounded-lg border border-[var(--replay-border)] bg-[var(--replay-viewport)]'
                "
              >
                <ReplayPlayerHost
                  v-if="playerSrc"
                  ref="player"
                  class="h-full w-full"
                  :type="playerType"
                  :src="playerSrc"
                  :speed="speed"
                  :start-at-ms="queryStartMs"
                  @playing="playing = $event"
                  @position="positionMs = $event"
                  @duration="durationMs = $event"
                  @seeking="seeking = $event"
                  @error="playerError = $event"
                />
                <ReplayWatermark v-if="watermark?.enabled" :settings="watermark" />
              </div>
            </div>
          </div>

          <ReplayControls
            v-if="playerSrc"
            :playing="playing"
            :seeking="seeking"
            :position-ms="positionMs"
            :duration-ms="durationMs"
            :duration-ready="durationReady"
            :speed="speed"
            :commands="commands"
            :parts="parts"
            :show-parts="replay?.type === 'parts'"
            :active-part-src="currentPart?.src"
            :active-command-offset="activeCommandOffset ?? undefined"
            :show-command-rail="showRail"
            :command-rail-open="showRail && !railCollapsed"
            :speed-disabled="speedDisabled"
            :download-url="downloadUrl"
            @toggle="togglePlayback"
            @restart="restart"
            @seek="seekTo"
            @select-command="onSelectCommand"
            @select-part="onSelectPart"
            @toggle-command-rail="railCollapsed = !railCollapsed"
            @update:speed="speed = $event"
          />

          <div
            v-if="seeking"
            class="replay-seek absolute top-1/2 left-1/2 z-30 -translate-x-1/2 -translate-y-1/2 text-center"
          >
            <UIcon name="i-lucide-loader-circle" class="mx-auto size-12 animate-spin text-primary" />
            <p class="mt-5 text-sm font-medium">{{ t("Replay.Seeking") }}</p>
            <UButton
              class="mt-4"
              color="neutral"
              variant="outline"
              size="xs"
              :label="t('Common.Cancel')"
              @click="cancelSeek"
            />
          </div>

          <UAlert
            v-if="playerError"
            class="absolute inset-x-4 top-4 z-20"
            color="error"
            variant="subtle"
            :title="t('Replay.PlayError')"
            :description="playerError"
            icon="i-lucide-circle-alert"
          />
        </div>

        <aside
          v-if="showRail"
          class="relative z-10 flex h-[42%] w-full shrink-0 flex-col border-t border-[var(--replay-border)] md:h-auto md:w-[360px] md:border-t-0 md:border-l"
          :class="railCollapsed ? 'hidden' : ''"
        >
          <ReplayRail
            :commands="commands"
            :parts="[]"
            :show-parts="false"
            :active-command-offset="activeCommandOffset ?? undefined"
            :loading="commandsLoading && commands.length === 0"
            :error="commandsError"
            @select-command="onSelectCommand"
            @load-more="loadMore"
            @retry="reloadCommands"
          />
        </aside>
      </template>
    </div>
  </div>
</template>
