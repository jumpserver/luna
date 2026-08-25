<script setup lang="ts">
import type { Component } from "vue";
import type { ReplayPlayerHandle } from "#online-player/types";
import AsciicastPlayer from "#online-player/components/players/AsciicastPlayer.vue";
import GuacamolePlayer from "#online-player/components/players/GuacamolePlayer.vue";
import Mp4Player from "#online-player/components/players/Mp4Player.vue";

const props = defineProps<{
  type: string;
  src: string;
  speed: number;
  startAtMs: number;
}>();

const emit = defineEmits<{
  playing: [boolean];
  position: [number];
  duration: [number];
  seeking: [boolean];
  error: [string];
}>();

const innerRef = useTemplateRef("inner");

const playerComponent = computed<Component | null>(() => {
  if (props.type === "asciicast") return AsciicastPlayer;
  if (props.type === "guacamole") return GuacamolePlayer;
  if (props.type === "mp4") return Mp4Player;
  return null;
});

const innerPlayer = (): ReplayPlayerHandle | null => {
  const instance = innerRef.value as ReplayPlayerHandle | null;
  if (!instance || typeof instance.play !== "function") return null;
  return instance;
};

const handle: ReplayPlayerHandle = {
  play() {
    innerPlayer()?.play();
  },
  pause() {
    innerPlayer()?.pause();
  },
  async seek(ms: number) {
    await innerPlayer()?.seek(ms);
  },
  cancelSeek() {
    innerPlayer()?.cancelSeek?.();
  }
};

defineExpose(handle);
</script>

<template>
  <component
    :is="playerComponent"
    v-if="playerComponent"
    :key="props.src"
    ref="inner"
    class="h-full w-full"
    :src="props.src"
    :speed="props.speed"
    :start-at-ms="props.startAtMs"
    @playing="emit('playing', $event)"
    @position="emit('position', $event)"
    @duration="emit('duration', $event)"
    @seeking="emit('seeking', $event)"
    @error="emit('error', $event)"
  />
</template>
