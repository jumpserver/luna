<script setup lang="ts">
import type { ReplayPlayerHandle } from "#online-player/types";
import { isMediaTimeSeekable } from "#online-player/utils/mediaSeek";

const props = defineProps<{
  src: string;
  speed: number;
  startAtMs?: number;
}>();

const emit = defineEmits<{
  ready: [];
  playing: [boolean];
  position: [number];
  duration: [number];
  seeking: [boolean];
  seekWaiting: [boolean];
  error: [string];
}>();

const { t } = useI18n();
const videoRef = ref<HTMLVideoElement | null>(null);
let startApplied = false;
const SEEK_POLL_MS = 200;
const SEEK_RELOAD_AFTER_MS = 3000;
const SEEK_TIMEOUT_MS = 12_000;
const SEEK_ACCURACY_SECONDS = 0.25;

interface PendingSeek {
  targetSeconds: number;
  startedAt: number;
  lastAttemptAt: number;
  attempted: boolean;
  reloaded: boolean;
  resumePlayback: boolean;
  resolve: () => void;
  reject: (error: Error) => void;
}

let pendingSeek: PendingSeek | null = null;
let seekTimer: ReturnType<typeof setInterval> | null = null;

const clearSeekTimer = () => {
  if (seekTimer) clearInterval(seekTimer);
  seekTimer = null;
};

const emitState = () => {
  const video = videoRef.value;
  if (!video) return;
  if (!pendingSeek) emit("position", video.currentTime * 1000);
  emit("duration", video.duration * 1000 || 0);
};

const requestPlay = () => {
  void videoRef.value?.play().catch(() => emit("playing", false));
};

const stopPendingSeek = (reason?: Error) => {
  const request = pendingSeek;
  pendingSeek = null;
  clearSeekTimer();
  emit("seekWaiting", false);
  emit("seeking", false);
  if (reason) request?.reject(reason);
  else request?.resolve();
  return request;
};

const completeSeek = () => {
  const request = stopPendingSeek();
  if (!request) return;
  emitState();
  if (request.resumePlayback) requestPlay();
};

const failSeek = (message: string) => {
  if (!pendingSeek) return;
  stopPendingSeek(new Error(message));
  emit("playing", false);
  emit("error", message);
  emitState();
};

const attemptSeek = () => {
  const video = videoRef.value;
  const request = pendingSeek;
  if (!video || !request) return;

  const now = Date.now();
  const elapsed = now - request.startedAt;
  if (elapsed >= SEEK_TIMEOUT_MS) {
    failSeek(t("Replay.SeekUnavailable"));
    return;
  }

  if (!isMediaTimeSeekable(video.seekable, request.targetSeconds)) {
    emit("seekWaiting", true);
    if (elapsed >= SEEK_RELOAD_AFTER_MS && !request.reloaded) {
      request.reloaded = true;
      // Reopen the same authorized URL once. Some browsers do not publish a
      // seekable range for an MP4 until the media resource is loaded again.
      try {
        video.load();
      } catch {
        /* Keep waiting until the deadline. */
      }
    }
    return;
  }

  if (request.attempted && (video.seeking || now - request.lastAttemptAt < 1200)) return;
  emit("seekWaiting", false);
  if (Math.abs(video.currentTime - request.targetSeconds) <= SEEK_ACCURACY_SECONDS) {
    completeSeek();
    return;
  }

  request.attempted = true;
  request.lastAttemptAt = now;
  try {
    video.currentTime = request.targetSeconds;
  } catch {
    request.attempted = false;
    emit("seekWaiting", true);
  }
};

const beginSeek = (ms: number, initial = false): Promise<void> => {
  const video = videoRef.value;
  if (!video) return Promise.resolve();
  if (!Number.isFinite(ms)) return Promise.reject(new Error("Invalid seek time"));

  stopPendingSeek(new DOMException("Seek replaced", "AbortError"));
  const targetSeconds = Math.max(0, ms / 1000);
  const resumePlayback = initial || !video.paused;
  video.pause();
  emit("playing", false);

  if (targetSeconds === 0) {
    video.currentTime = 0;
    emitState();
    if (resumePlayback) requestPlay();
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    pendingSeek = {
      targetSeconds,
      startedAt: Date.now(),
      lastAttemptAt: 0,
      attempted: false,
      reloaded: false,
      resumePlayback,
      resolve,
      reject
    };
    emit("seeking", true);
    emit("seekWaiting", false);
    seekTimer = setInterval(attemptSeek, SEEK_POLL_MS);
    attemptSeek();
  });
};

const applyStart = () => {
  if (!videoRef.value || startApplied || !props.startAtMs) return;
  startApplied = true;
  void beginSeek(props.startAtMs, true).catch(() => {});
};

const handleLoadedMetadata = () => {
  emit("ready");
  applyStart();
  if (pendingSeek) videoRef.value?.pause();
  attemptSeek();
  emitState();
};

const handleSeeked = () => {
  const video = videoRef.value;
  const request = pendingSeek;
  if (!video || !request) {
    emit("seeking", false);
    emitState();
    return;
  }
  if (Math.abs(video.currentTime - request.targetSeconds) <= SEEK_ACCURACY_SECONDS) {
    completeSeek();
    return;
  }
  // A browser can emit seeked after resetting to 0 when the range was not
  // actually usable. Do not report that as a successful index jump.
  request.attempted = false;
  request.lastAttemptAt = Date.now();
  emit("seekWaiting", true);
};

const handleError = () => {
  const message = videoRef.value?.error?.message || "Unable to play video";
  if (pendingSeek) failSeek(message);
  else {
    emit("playing", false);
    emit("seeking", false);
    emit("seekWaiting", false);
    emit("error", message);
  }
};

const handle: ReplayPlayerHandle = {
  play() {
    if (!pendingSeek) requestPlay();
  },
  pause() {
    if (pendingSeek) pendingSeek.resumePlayback = false;
    videoRef.value?.pause();
  },
  seek(ms: number) {
    return beginSeek(ms);
  },
  cancelSeek() {
    const request = stopPendingSeek(new DOMException("Seek cancelled", "AbortError"));
    if (request?.resumePlayback) requestPlay();
  }
};

watch(
  () => props.src,
  () => {
    stopPendingSeek(new DOMException("Media source changed", "AbortError"));
    startApplied = false;
  }
);

watch(
  () => props.speed,
  (speed) => {
    if (videoRef.value) videoRef.value.playbackRate = speed;
  }
);

onMounted(() => {
  if (videoRef.value) videoRef.value.playbackRate = props.speed;
});

onBeforeUnmount(() => {
  stopPendingSeek(new DOMException("Player unmounted", "AbortError"));
});

defineExpose(handle);
</script>

<template>
  <video
    ref="videoRef"
    class="h-full w-full object-contain"
    :src="props.src"
    autoplay
    @playing="
      if (pendingSeek) {
        videoRef?.pause();
        emit('playing', false);
      } else emit('playing', true);
    "
    @waiting="emit('playing', false)"
    @stalled="emit('playing', false)"
    @pause="emit('playing', false)"
    @ended="emit('playing', false)"
    @loadedmetadata="handleLoadedMetadata"
    @progress="attemptSeek"
    @canplay="attemptSeek"
    @timeupdate="emitState"
    @durationchange="emitState"
    @seeking="
      emit('playing', false);
      emit('seeking', true);
    "
    @seeked="handleSeeked"
    @error="handleError"
  />
</template>
