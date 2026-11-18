<script setup lang="ts">
import type { Player } from "asciinema-player";
import { create as createAsciinemaPlayer } from "asciinema-player";

const props = defineProps<{
  source: string;
  castData?: string;
}>();

const terminalRef = shallowRef<HTMLElement | null>(null);
const controlBar = shallowRef<HTMLElement | null>(null);
const speed = ref(1);
let playerInstance: Player | null = null;
let resizeObserver: ResizeObserver | null = null;
let resumeAt = 0;

function resolveCastSource() {
  if (props.castData) {
    return { data: props.castData };
  }

  if (props.source) {
    return props.source;
  }

  return null;
}

function destroyPlayer() {
  controlBar.value = null;
  resizeObserver?.disconnect();
  resizeObserver = null;
  playerInstance?.dispose?.();
  playerInstance = null;
}

function mountPlayer() {
  const mountTarget = terminalRef.value;
  const castSource = resolveCastSource();

  if (!mountTarget || !castSource || playerInstance) return;
  if (mountTarget.clientWidth === 0 || mountTarget.clientHeight === 0) return;

  playerInstance = createAsciinemaPlayer(castSource, mountTarget, {
    fit: "both",
    preload: true,
    autoplay: true,
    startAt: resumeAt,
    speed: speed.value
  });
  controlBar.value = mountTarget.querySelector(".ap-control-bar");
  void playerInstance.play();
}

watch(speed, (value) => {
  void playerInstance?.setPlaybackRate(value);
});

function scheduleMount() {
  destroyPlayer();

  const mountTarget = terminalRef.value;

  if (!mountTarget) return;

  const tryMount = () => {
    if (!terminalRef.value || playerInstance) return;

    mountPlayer();
  };

  resizeObserver = new ResizeObserver(() => {
    tryMount();
  });
  resizeObserver.observe(mountTarget);

  requestAnimationFrame(() => {
    requestAnimationFrame(tryMount);
  });
}

onMounted(() => {
  nextTick(scheduleMount);
});

onBeforeUnmount(destroyPlayer);
</script>

<template>
  <div class="terminal-root">
    <div ref="terminalRef" class="terminal-host" />
    <Teleport v-if="controlBar" :to="controlBar">
      <div class="terminal-speed-control" @keydown.stop>
        <VideoPlayerSpeedControl v-model="speed" :portal="false" />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.terminal-root,
.terminal-host {
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
}

.terminal-speed-control {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

:deep(.ap-kbd-button),
:deep(.ap-fullscreen-button) {
  order: 1;
}

:deep(.ap-control-bar:focus-within) {
  opacity: 1;
}

:deep(.ap-wrapper) {
  width: 100%;
  height: 100%;
}

:deep(.ap-player) {
  width: 100% !important;
  height: 100% !important;
}

:deep(.ap-search-button) {
  display: none;
}
</style>

<style>
@import "asciinema-player/dist/bundle/asciinema-player.css";
</style>
