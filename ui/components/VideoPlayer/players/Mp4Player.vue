<script setup lang="ts">
defineProps<{
  source: string;
}>();

const videoRef = ref<HTMLVideoElement | null>(null);
const speed = ref(1);

watch(speed, (value) => {
  if (videoRef.value) videoRef.value.playbackRate = value;
});

onMounted(() => {
  if (videoRef.value) videoRef.value.playbackRate = speed.value;
});
</script>

<template>
  <div class="relative h-full w-full">
    <video ref="videoRef" class="h-full w-full bg-black object-contain" controls autoplay playsinline>
      <source :src="source" type="video/mp4" />
    </video>
    <div class="absolute right-3 bottom-14 z-20">
      <VideoPlayerSpeedControl v-model="speed" />
    </div>
  </div>
</template>
