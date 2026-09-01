<script setup lang="ts">
import type { Player } from "asciinema-player";
import type { ReplayPlayerHandle } from "#online-player/types";

import { create as createAsciinemaPlayer } from "asciinema-player";
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

const hostRef = shallowRef<HTMLElement | null>(null);
let player: Player | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let resumeAtMs = props.startAtMs;
let mounting = false;
let loadController: AbortController | null = null;

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
  try {
    player?.dispose?.();
  } catch {
    // ignore
  }
  player = null;
};

const mount = async () => {
  if (!hostRef.value || !props.src || mounting) return;
  mounting = true;
  destroy();

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
        autoPlay: true,
        fit: "both",
        controls: false,
        theme: "auto/asciinema"
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
    void nextTick(mount);
  }
);

watch(
  () => props.speed,
  async () => {
    resumeAtMs = (await readTime("getCurrentTime")) || resumeAtMs;
    await nextTick(mount);
  }
);

onMounted(() => void mount());
onBeforeUnmount(destroy);
defineExpose(handle);
</script>

<template>
  <div class="ascii-root h-full min-h-0 w-full min-w-0 overflow-hidden" data-asciicast-root>
    <div ref="hostRef" class="ascii-host h-full min-h-0 w-full min-w-0" data-asciicast-host />
  </div>
</template>

<style>
@import "asciinema-player/dist/bundle/asciinema-player.css";
</style>

<style scoped>
:deep(.ap-wrapper) {
  width: 100%;
  align-items: center;
}

:deep(.ap-control-bar),
:deep(.ap-search-button) {
  display: none !important;
}
</style>
