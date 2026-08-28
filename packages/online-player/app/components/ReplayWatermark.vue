<script setup lang="ts">
import type { ReplayWatermarkSettings } from "#online-player/types";

const props = defineProps<{
  settings: ReplayWatermarkSettings;
}>();

const hostRef = useTemplateRef<HTMLElement>("host");
const enabled = computed(() => props.settings.enabled);
const options = computed<Record<string, unknown>>(() => ({
  content: props.settings.content,
  contentType: "multi-line-text",
  width: props.settings.width,
  height: props.settings.height,
  rotate: props.settings.rotate,
  fontSize: `${props.settings.fontSize}px`,
  fontColor: props.settings.fontColor,
  fontFamily: "JetBrains Mono, SF Mono, Menlo, monospace",
  globalAlpha: 1
}));

useDomWatermark(hostRef, enabled, options);
</script>

<template>
  <div v-show="settings.enabled" ref="host" class="pointer-events-none absolute inset-0 z-10 overflow-hidden" />
</template>
