<script setup lang="ts">
import type { ReplayWatermarkSettings } from "#online-player/types";

const props = defineProps<{
  settings: ReplayWatermarkSettings;
}>();

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
</script>

<template>
  <Watermark
    class="pointer-events-none absolute inset-0 z-10 overflow-hidden"
    :options="options"
    :model-value="settings.enabled"
    :is-body="false"
  >
    <div class="h-full w-full" />
  </Watermark>
</template>
