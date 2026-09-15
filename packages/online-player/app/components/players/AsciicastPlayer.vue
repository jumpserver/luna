<script setup lang="ts">
import type { Player } from "asciinema-player";
import type { ReplayPlayerHandle } from "#online-player/types";

import { create as createAsciinemaPlayer } from "asciinema-player";
import { useI18n } from "vue-i18n";
import { fetchRecordingBuffer } from "#online-player/utils/recordingSource";

const props = defineProps<{
  src: string;
  speed: number;
  startAtMs: number;
}>();

const emit = defineEmits<{
  ready: [];
  playing: [boolean];
  position: [number];
  duration: [number];
}>();

const { t } = useI18n();

const hostRef = shallowRef<HTMLElement | null>(null);
let player: Player | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let resumeAtMs = props.startAtMs;
let mounting = false;
let loadController: AbortController | null = null;
let helpObserver: MutationObserver | null = null;
let resizeObserver: ResizeObserver | null = null;

// asciinema-player renders its "Keyboard shortcuts" help popup with hardcoded
// English strings and exposes no i18n option, so we translate the overlay text
// in place (keeping the <kbd> key labels) when it is shown via the `?` key.
const HELP_KEYS: Record<string, string> = {
  space: "Replay.ShortcutPlayPause",
  f: "Replay.ShortcutFullscreen",
  k: "Replay.ShortcutKeystrokeOverlay",
  "?": "Replay.ShortcutHelp"
};

function localizeHelpOverlay(root: HTMLElement) {
  const overlay = root.querySelector<HTMLElement>(".ap-overlay-help");
  if (!overlay) return;
  const title = overlay.querySelector("p");
  if (!title || title.textContent === t("Replay.ShortcutsTitle")) return;
  title.textContent = t("Replay.ShortcutsTitle");
  overlay.querySelectorAll("li").forEach((item) => {
    const key = item.querySelector("kbd")?.textContent?.trim();
    const translation = key ? HELP_KEYS[key] : undefined;
    if (!translation) return;
    // Replace the trailing description text (everything after the <kbd>) so the
    // key label stays untouched while the description is localized.
    [...item.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).forEach((node) => node.remove());
    item.appendChild(document.createTextNode(` - ${t(translation)}`));
  });
}

function observeHelpOverlay() {
  if (helpObserver || !hostRef.value) return;
  helpObserver = new MutationObserver(() => {
    if (hostRef.value) localizeHelpOverlay(hostRef.value);
  });
  helpObserver.observe(hostRef.value, { subtree: true, childList: true, characterData: true });
}

const clearTimer = () => {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
};

const readTime = async (method: "getCurrentTime" | "getDuration") => {
  if (!player) return 0;
  try {
    const value = await player[method]?.();
    return Number(value) * 1000 || 0;
  } catch {
    return 0;
  }
};

const tick = async () => {
  if (!player) return;
  emit("position", await readTime("getCurrentTime"));
  emit("duration", await readTime("getDuration"));
};

const startTimer = () => {
  clearTimer();
  timer = setInterval(() => void tick(), 250);
};

const destroy = () => {
  loadController?.abort();
  loadController = null;
  clearTimer();
  helpObserver?.disconnect();
  helpObserver = null;
  try {
    player?.dispose?.();
  } catch {
    // ignore
  }
  player = null;
};

const mount = async () => {
  if (!hostRef.value || !props.src || mounting || player) return;
  if (hostRef.value.clientWidth === 0 || hostRef.value.clientHeight === 0) return;
  mounting = true;
  destroy();
  observeHelpOverlay();

  try {
    const controller = new AbortController();
    loadController = controller;
    hostRef.value.innerHTML = "";
    player = createAsciinemaPlayer(
      {
        data: () => fetchRecordingBuffer(props.src, controller.signal),
        parser: "asciicast"
      },
      hostRef.value,
      {
        startAt: Math.max(0, resumeAtMs) / 1000,
        speed: props.speed,
        preload: true,
        autoplay: true,
        fit: "both",
        controls: false
      }
    );

    player.addEventListener("playing", () => {
      emit("playing", true);
      emit("ready");
      startTimer();
    });
    player.addEventListener("pause", () => {
      emit("playing", false);
      clearTimer();
    });
    void player.play?.();
    startTimer();
    await tick();
  } finally {
    mounting = false;
  }
};

const handle: ReplayPlayerHandle = {
  play() {
    player?.play?.();
  },
  pause() {
    player?.pause?.();
  },
  async seek(ms: number) {
    await player?.seek?.(Math.max(0, ms) / 1000);
    await tick();
  }
};

watch(
  () => props.src,
  () => {
    resumeAtMs = props.startAtMs;
    destroy();
    void nextTick(mount);
  }
);

watch(
  () => props.speed,
  (value) => void player?.setPlaybackRate(value)
);

onMounted(() => {
  const host = hostRef.value;
  if (host) {
    resizeObserver = new ResizeObserver(() => void mount());
    resizeObserver.observe(host);
  }
  void nextTick(mount);
});
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  destroy();
});
defineExpose(handle);
</script>

<template>
  <div class="ascii-root relative" data-asciicast-root>
    <div ref="hostRef" class="ascii-host" data-asciicast-host />
  </div>
</template>

<style>
@import "asciinema-player/dist/bundle/asciinema-player.css";

.ascii-root,
.ascii-host {
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
}

.ascii-root .ap-wrapper {
  width: 100%;
  height: 100%;
  justify-content: stretch;
}

.ascii-root .ap-player {
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  display: block !important;
}
</style>

<style scoped>
:deep(.ap-control-bar),
:deep(.ap-search-button) {
  display: none !important;
}
</style>
