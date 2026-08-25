<script setup lang="ts">
import type { ReplayPlayerHandle } from "#online-player/types";
import type { GuacamoleDisplay, GuacamoleRecording, GuacamoleStatic } from "#online-player/types/guacamole";

import * as GuacamoleModule from "guacamole-common-js-jumpserver/dist/guacamole-common";
import { fitDisplayScale } from "#online-player/utils/guacamoleBounds";
import { applyGuacamolePlaybackRate } from "#online-player/utils/guacamolePlayback";
import { fetchRecordingText } from "#online-player/utils/recordingSource";
import { interpretTouchGesture } from "#online-player/utils/touchSeek";

const props = defineProps<{
  src: string;
  speed?: number;
  startAtMs?: number;
}>();

const emit = defineEmits<{
  ready: [];
  playing: [boolean];
  position: [number];
  duration: [number];
  seeking: [boolean];
  error: [string];
}>();

const Guacamole = GuacamoleModule as unknown as GuacamoleStatic;

const playerAreaRef = ref<HTMLElement | null>(null);
const viewportRef = ref<HTMLElement | null>(null);
const hostRef = ref<HTMLElement | null>(null);
let recording: GuacamoleRecording | null = null;
let display: GuacamoleDisplay | null = null;
let resizeObserver: ResizeObserver | null = null;
let scaleTimer: ReturnType<typeof setTimeout> | null = null;
let recordingLoaded = false;
let playbackIntent = true;
let ignoreClick = false;
let touchStart: { x: number; y: number; t: number } | null = null;
let lastPosition = 0;
let loadController: AbortController | null = null;
let seekSequence = 0;

const applySpeed = () => {
  applyGuacamolePlaybackRate(recording, props.speed);
};

interface SeekRequest {
  id: number;
  targetMs: number;
  resolve: () => void;
}

let pendingSeek: SeekRequest | null = null;
let activeSeek: SeekRequest | null = null;

const layerSize = () => {
  const layer = display?.getDefaultLayer?.();
  return {
    width: layer?.width || display?.getWidth() || 0,
    height: layer?.height || display?.getHeight() || 0
  };
};

const applyScale = () => {
  if (!recording || !display || !playerAreaRef.value || !viewportRef.value) return;
  const { width: fullWidth, height: fullHeight } = layerSize();
  if (!fullWidth || !fullHeight) return;

  const scale = fitDisplayScale(
    playerAreaRef.value.clientWidth,
    playerAreaRef.value.clientHeight,
    fullWidth,
    fullHeight
  );
  display.scale(scale);

  viewportRef.value.style.width = `${Math.round(fullWidth * scale)}px`;
  viewportRef.value.style.height = `${Math.round(fullHeight * scale)}px`;

  const element = display.getElement();
  element.style.position = "absolute";
  element.style.margin = "0";
  element.style.left = "0";
  element.style.top = "0";
  element.style.transformOrigin = "0 0";
};

const applyScaleWithRetry = (delay = 100, retries = 5) => {
  if (scaleTimer) clearTimeout(scaleTimer);
  const attempt = (left: number) => {
    applyScale();
    if (left <= 0 || !display) return;
    if (layerSize().width > 0) return;
    scaleTimer = setTimeout(attempt, delay, left - 1);
  };
  scaleTimer = setTimeout(attempt, delay, retries);
};

const settleSeek = (request: SeekRequest | null) => {
  if (!request) return;
  if (pendingSeek?.id === request.id) pendingSeek = null;
  if (activeSeek?.id === request.id) activeSeek = null;
  request.resolve();
};

const abortSeek = (resumePlayback: boolean) => {
  const inProgress = activeSeek;
  const request = inProgress || pendingSeek;
  pendingSeek = null;
  activeSeek = null;

  if (inProgress && recording) recording.pause();
  if (request) request.resolve();
  emit("seeking", false);

  if (resumePlayback && playbackIntent && recordingLoaded && recording && !recording.isPlaying()) {
    recording.play();
  }
};

const performSeek = (request: SeekRequest) => {
  if (!recording || !recordingLoaded) {
    pendingSeek = request;
    return;
  }

  const targetMs = Math.min(request.targetMs, recording.getDuration());
  if (recording.getDuration() <= 0) {
    lastPosition = 0;
    emit("position", 0);
    emit("seeking", false);
    settleSeek(request);
    return;
  }

  activeSeek = request;
  recording.seek(targetMs, () => {
    if (!recording || activeSeek?.id !== request.id) return;
    lastPosition = recording.getPosition();
    emit("position", lastPosition);
    emit("seeking", false);
    applyScaleWithRetry();
    settleSeek(request);
    if (playbackIntent && recording && !recording.isPlaying()) recording.play();
  });
};

const seekRecording = async (ms: number) => {
  abortSeek(false);
  emit("seeking", true);
  await new Promise<void>((resolve) => {
    const request = {
      id: ++seekSequence,
      targetMs: Math.max(0, ms),
      resolve
    };
    performSeek(request);
  });
};

const destroy = () => {
  loadController?.abort();
  loadController = null;
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (scaleTimer) {
    clearTimeout(scaleTimer);
    scaleTimer = null;
  }
  if (recording) {
    recording.onplay = null;
    recording.onpause = null;
    recording.onseek = null;
    recording.onprogress = null;
    recording.onerror = null;
    try {
      recording.disconnect();
    } catch {
      // ignore
    }
  }

  if (display) {
    const element = display.getElement();
    element.parentNode?.removeChild(element);
  }

  recording = null;
  display = null;
  recordingLoaded = false;
  playbackIntent = true;
  lastPosition = 0;
  abortSeek(false);
};

const mount = async () => {
  destroy();
  if (!hostRef.value || !props.src) return;

  const controller = new AbortController();
  loadController = controller;
  const tunnel = new Guacamole.StaticHTTPTunnel();
  recording = new Guacamole.SessionRecording(tunnel);
  applySpeed();
  display = recording.getDisplay();
  const element = display.getElement();
  hostRef.value.appendChild(element);

  recording.onplay = () => {
    emit("playing", true);
    emit("ready");
    applyScaleWithRetry();
  };
  recording.onpause = () => emit("playing", false);
  recording.onseek = (millis: number) => {
    lastPosition = millis;
    emit("position", millis);
  };
  recording.onerror = (message: string) => emit("error", String(message || ""));
  recording.onprogress = (millis: number) => {
    emit("duration", millis);
  };
  display.onresize = () => {
    applyScale();
  };

  if (playerAreaRef.value) {
    resizeObserver = new ResizeObserver(() => applyScale());
    resizeObserver.observe(playerAreaRef.value);
  }

  try {
    const data = await fetchRecordingText(props.src, controller.signal);
    if (controller.signal.aborted || !recording) return;
    recording.connect(data);
    recordingLoaded = true;
    emit("duration", recording.getDuration());

    if (pendingSeek) {
      const request = pendingSeek;
      pendingSeek = null;
      performSeek(request);
      return;
    }

    const start = Math.max(0, props.startAtMs || 0);
    if (start > 0) {
      await seekRecording(start);
      return;
    }

    if (playbackIntent && !recording.isPlaying()) recording.play();
  } catch (error) {
    if (controller.signal.aborted) return;
    abortSeek(false);
    emit("error", error instanceof Error ? error.message : String(error || ""));
  }
};

const handle: ReplayPlayerHandle = {
  play() {
    playbackIntent = true;
    if (activeSeek || pendingSeek) return;
    if (recordingLoaded && recording && !recording.isPlaying()) recording.play();
  },
  pause() {
    playbackIntent = false;
    if (activeSeek || pendingSeek) {
      abortSeek(false);
      return;
    }
    if (recording?.isPlaying()) recording.pause();
  },
  async seek(ms: number) {
    await seekRecording(ms);
  },
  cancelSeek() {
    abortSeek(true);
  }
};

function toggle() {
  if (!recording) return;
  if (recording.isPlaying()) handle.pause();
  else handle.play();
}

function onClick() {
  if (ignoreClick) {
    ignoreClick = false;
    return;
  }
  toggle();
}

function onTouchStart(event: TouchEvent) {
  const touch = event.changedTouches[0];
  if (!touch) return;
  touchStart = { x: touch.clientX, y: touch.clientY, t: Date.now() };
}

function onTouchEnd(event: TouchEvent) {
  const touch = event.changedTouches[0];
  if (!touch || !touchStart || !recording) return;
  const gesture = interpretTouchGesture(touchStart, {
    x: touch.clientX,
    y: touch.clientY,
    t: Date.now()
  });
  touchStart = null;
  if (gesture.kind === "ignore") return;
  event.preventDefault();
  ignoreClick = true;
  if (gesture.kind === "tap") {
    toggle();
    return;
  }
  void handle.seek(Math.max(0, lastPosition + gesture.deltaMs));
}

watch(
  () => props.src,
  () => void nextTick(mount)
);

watch(
  () => props.speed,
  () => applySpeed()
);

onMounted(() => void mount());
onBeforeUnmount(destroy);
defineExpose(handle);
</script>

<template>
  <div
    ref="playerAreaRef"
    class="flex h-full min-h-0 w-full cursor-pointer items-center justify-center overflow-hidden bg-black"
    data-guacamole-root
    @click="onClick"
    @touchstart.passive="onTouchStart"
    @touchend="onTouchEnd"
  >
    <div ref="viewportRef" class="relative overflow-hidden" data-guacamole-viewport>
      <div ref="hostRef" class="absolute inset-0" />
    </div>
  </div>
</template>
