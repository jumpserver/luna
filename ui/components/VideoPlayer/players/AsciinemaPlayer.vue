<script setup lang="ts">
import { create as createAsciinemaPlayer } from "@cyolosecurity/asciinema-player";

const props = defineProps<{
  source: string
  castData?: string
}>();

const terminalRef = ref<HTMLElement | null>(null);
let playerInstance: { dispose?: () => void } | null = null;
let resizeObserver: ResizeObserver | null = null;

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
    autoplay: true
  });
}

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
@import "@cyolosecurity/asciinema-player/dist/bundle/asciinema-player.css";
</style>
