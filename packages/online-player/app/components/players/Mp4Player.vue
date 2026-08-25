<script setup lang="ts">
import type { ReplayPlayerHandle } from "#online-player/types";

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
}>();

const videoRef = ref<HTMLVideoElement | null>(null);
let startApplied = false;

const emitState = () => {
  const video = videoRef.value;
  if (!video) return;
  emit("position", video.currentTime * 1000);
  emit("duration", video.duration * 1000 || 0);
};

const applyStart = () => {
  const video = videoRef.value;
  if (!video || startApplied || !props.startAtMs) return;
  video.currentTime = Math.max(0, props.startAtMs) / 1000;
  startApplied = true;
};

const handle: ReplayPlayerHandle = {
  play() {
    void videoRef.value?.play();
  },
  pause() {
    videoRef.value?.pause();
  },
  async seek(ms: number) {
    if (!videoRef.value) return;
    videoRef.value.currentTime = Math.max(0, ms) / 1000;
    emitState();
  }
};

watch(
  () => props.src,
  () => {
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

defineExpose(handle);
</script>

<template>
  <video
    ref="videoRef"
    class="h-full w-full object-contain"
    :src="props.src"
    autoplay
    @play="emit('playing', true)"
    @pause="emit('playing', false)"
    @loadedmetadata="
      emit('ready');
      applyStart();
      emitState();
    "
    @timeupdate="emitState"
    @durationchange="emitState"
  />
</template>
