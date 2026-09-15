<script setup lang="ts">
import type { ReplayPlayerHandle } from "#online-player/types";
import type {
  GuacamoleDisplay,
  GuacamoleRecording,
  GuacamoleStatic,
  GuacamoleTunnel
} from "#online-player/types/guacamole";
import type { VisibleRect } from "#online-player/utils/guacamoleBounds";

import * as GuacamoleModule from "guacamole-common-js-jumpserver/dist/guacamole-common";
import { accumulateVisibleBounds, visibleBoundsFromAlpha } from "#online-player/utils/guacamoleBounds";
import { applyGuacamolePlaybackRate } from "#online-player/utils/guacamolePlayback";
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

const playerAreaRef = shallowRef<HTMLElement | null>(null);
const viewportRef = shallowRef<HTMLElement | null>(null);
const hostRef = shallowRef<HTMLElement | null>(null);
let recording: GuacamoleRecording | null = null;
let display: GuacamoleDisplay | null = null;
let sourceTunnel: GuacamoleTunnel | null = null;
let resizeObserver: ResizeObserver | null = null;
let scaleTimer: ReturnType<typeof setTimeout> | null = null;
let recordingLoaded = false;
let streamOpened = false;
let startApplied = false;
let loadFailed = false;
let playbackIntent = true;
let ignoreClick = false;
let touchStart: { x: number; y: number; t: number } | null = null;
let lastPosition = 0;
let loadController: AbortController | null = null;
let seekSequence = 0;
let visibleBounds: VisibleRect | null = null;
let boundsTimers: number[] = [];

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

const sampleVisibleBounds = () => {
  const layer = display?.getDefaultLayer?.();
  const canvas = layer?.getCanvas?.();
  const { width: fullWidth, height: fullHeight } = layerSize();
  if (!fullWidth || !fullHeight) return;

  let sampled: VisibleRect | null = null;
  if (canvas) {
    try {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context) {
        sampled = visibleBoundsFromAlpha(
          context.getImageData(0, 0, canvas.width || fullWidth, canvas.height || fullHeight).data,
          canvas.width || fullWidth,
          canvas.height || fullHeight
        );
      }
    } catch {
      // tainted or empty canvas: wait for a later sample
    }
  }
  if (!sampled) return;

  visibleBounds = accumulateVisibleBounds(visibleBounds, sampled, fullWidth, fullHeight);
};

const applyScale = () => {
  if (!recording || !display || !playerAreaRef.value || !viewportRef.value) return;
  const { width: fullWidth, height: fullHeight } = layerSize();
  if (!fullWidth || !fullHeight) return;

  const bounds = visibleBounds || { left: 0, top: 0, width: fullWidth, height: fullHeight };
  const visibleWidth = bounds.width || fullWidth;
  const visibleHeight = bounds.height || fullHeight;
  const width = playerAreaRef.value.clientWidth;
  const height = playerAreaRef.value.clientHeight;
  if (!width || !height) return;

  const scaleX = width / visibleWidth;
  const scaleY = height / visibleHeight;
  viewportRef.value.style.width = "100%";
  viewportRef.value.style.height = "100%";

  const element = display.getElement();
  element.style.position = "absolute";
  element.style.margin = "0";
  element.style.left = `${-bounds.left * scaleX}px`;
  element.style.top = `${-bounds.top * scaleY}px`;
  element.style.transformOrigin = "0 0";
  element.style.transform = `scale(${scaleX}, ${scaleY})`;
};

const sampleAndScale = () => {
  sampleVisibleBounds();
  applyScale();
};

const scheduleBoundsSampling = () => {
  boundsTimers.forEach((id) => window.clearTimeout(id));
  boundsTimers = [80, 220, 480, 900].map((delay) => window.setTimeout(sampleAndScale, delay));
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

  if (resumePlayback && playbackIntent && recording && !recording.isPlaying()) {
    recording.play();
  }
};

const tryStartPlayback = () => {
  if (playbackIntent && !activeSeek && !pendingSeek && recording && !recording.isPlaying()) {
    recording.play();
  }
};

const performSeek = (request: SeekRequest) => {
  if (!recording) {
    pendingSeek = request;
    return;
  }

  const duration = recording.getDuration();
  if (duration <= 0 && !recordingLoaded) {
    pendingSeek = request;
    return;
  }
  if (!recordingLoaded && duration < request.targetMs) {
    pendingSeek = request;
    return;
  }

  const targetMs = Math.min(request.targetMs, duration);
  if (duration <= 0) {
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
    sampleAndScale();
    applyScaleWithRetry();
    settleSeek(request);
    tryStartPlayback();
  });
};

const seekRecording = async (ms: number) => {
  startApplied = true;
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

const flushStartOrPending = () => {
  if (!recording) return;

  if (pendingSeek) {
    const request = pendingSeek;
    const duration = recording.getDuration();
    if (!recordingLoaded && duration < request.targetMs) return;
    pendingSeek = null;
    performSeek(request);
    return;
  }

  const start = Math.max(0, props.startAtMs || 0);
  if (!startApplied && start > 0) {
    if (!recordingLoaded && recording.getDuration() < start) return;
    startApplied = true;
    void seekRecording(start);
    return;
  }

  tryStartPlayback();
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
  if (sourceTunnel) {
    sourceTunnel.onstatechange = null;
    sourceTunnel.onerror = null;
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

  boundsTimers.forEach((id) => window.clearTimeout(id));
  boundsTimers = [];
  visibleBounds = null;
  recording = null;
  display = null;
  sourceTunnel = null;
  recordingLoaded = false;
  streamOpened = false;
  startApplied = false;
  loadFailed = false;
  playbackIntent = true;
  lastPosition = 0;
  abortSeek(false);
};

const mount = () => {
  destroy();
  if (!hostRef.value || !props.src) return;

  const controller = new AbortController();
  loadController = controller;
  const tunnel = new Guacamole.StaticHTTPTunnel(props.src);
  sourceTunnel = tunnel;

  tunnel.onerror = (status) => {
    if (controller.signal.aborted) return;
    loadFailed = true;
    playbackIntent = false;
    startApplied = true;
    abortSeek(false);
    if (recording?.isPlaying()) recording.pause();
    emit("playing", false);
    emit("error", String(status?.message || "Failed to load recording"));
  };
  tunnel.onstatechange = (state) => {
    if (controller.signal.aborted || !recording) return;
    if (state === Guacamole.Tunnel.State.OPEN) streamOpened = true;
    if (state === Guacamole.Tunnel.State.CLOSED && streamOpened) {
      recordingLoaded = true;
      emit("duration", recording.getDuration());
      if (!loadFailed) flushStartOrPending();
    }
  };

  recording = new Guacamole.SessionRecording(tunnel);
  applySpeed();
  display = recording.getDisplay();
  const element = display.getElement();
  hostRef.value.appendChild(element);

  recording.onplay = () => {
    emit("playing", true);
    emit("ready");
    sampleAndScale();
    applyScaleWithRetry();
    scheduleBoundsSampling();
  };
  recording.onpause = () => emit("playing", false);
  recording.onseek = (millis: number) => {
    lastPosition = millis;
    emit("position", millis);
    sampleAndScale();
    scheduleBoundsSampling();
  };
  recording.onerror = (message: string) => emit("error", String(message || ""));
  recording.onprogress = (millis: number) => {
    emit("duration", millis);
    flushStartOrPending();
  };
  display.onresize = () => {
    applyScale();
  };

  if (playerAreaRef.value) {
    resizeObserver = new ResizeObserver(() => applyScale());
    resizeObserver.observe(playerAreaRef.value);
  }

  recording.connect("");
};

const handle: ReplayPlayerHandle = {
  play() {
    playbackIntent = true;
    if (activeSeek || pendingSeek) return;
    if (recording && !recording.isPlaying()) recording.play();
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
  () => nextTick(mount)
);

watch(
  () => props.speed,
  () => applySpeed()
);

onMounted(() => mount());
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
    <div ref="viewportRef" class="relative h-full w-full overflow-hidden" data-guacamole-viewport>
      <div ref="hostRef" class="absolute inset-0" />
    </div>
  </div>
</template>
