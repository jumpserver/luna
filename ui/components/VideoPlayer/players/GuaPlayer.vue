<script setup lang="ts">
import { gunzipSync } from "fflate";
import * as Guacamole from "guacamole-common-js-jumpserver/dist/guacamole-common";

const props = defineProps<{
  source: string
}>();

const { streamTextFile } = useVideoPlayerTauri();

const playerAreaRef = ref<HTMLElement | null>(null);
const canvasRef = ref<HTMLElement | null>(null);
const displayViewportRef = ref<HTMLElement | null>(null);
const displayHostRef = ref<HTMLElement | null>(null);
const loading = ref(false);
const isPlaying = ref(false);
const isSeeking = ref(false);
const scale = ref(1);
const duration = ref(0);
const currentPosition = ref(0);
const errorMessage = ref("");

let tunnel: any = null;
let recording: any = null;
let display: any = null;
let visibleBounds: { left: number, top: number, width: number, height: number } | null = null;

function zeroPad(num: number) {
  return `${num}`.padStart(2, "0");
}

function formatTime(millis: number) {
  const totalSeconds = Math.floor(millis / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${zeroPad(hours)}:${zeroPad(minutes)}:${zeroPad(seconds)}`
    : `${zeroPad(minutes)}:${zeroPad(seconds)}`;
}

const currentLabel = computed(() => formatTime(currentPosition.value));
const durationLabel = computed(() => formatTime(duration.value));

function detectVisibleBounds() {
  const layer = display?.getDefaultLayer?.();
  const canvas = layer?.getCanvas?.() as HTMLCanvasElement | undefined;

  if (!canvas) {
    return {
      left: 0,
      top: 0,
      width: layer?.width || 1024,
      height: layer?.height || 768
    };
  }

  const width = canvas.width || layer?.width || 1024;
  const height = canvas.height || layer?.height || 768;

  try {
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      return { left: 0, top: 0, width, height };
    }

    const image = context.getImageData(0, 0, width, height).data;
    const xStep = Math.max(2, Math.floor(width / 240));
    const yStep = Math.max(2, Math.floor(height / 240));

    const rowHasContent = (y: number) => {
      for (let x = 0; x < width; x += xStep) {
        const index = (y * width + x) * 4;
        const a = image[index + 3];

        if (a > 0) {
          return true;
        }
      }

      return false;
    };

    const columnHasContent = (x: number, top: number, bottom: number) => {
      for (let y = top; y <= bottom; y += yStep) {
        const index = (y * width + x) * 4;
        const a = image[index + 3];

        if (a > 0) {
          return true;
        }
      }

      return false;
    };

    let top = 0;
    let bottom = height - 1;
    let left = 0;
    let right = width - 1;

    while (top < bottom && !rowHasContent(top)) {
      top += yStep;
    }

    while (bottom > top && !rowHasContent(bottom)) {
      bottom -= yStep;
    }

    while (left < right && !columnHasContent(left, top, bottom)) {
      left += xStep;
    }

    while (right > left && !columnHasContent(right, top, bottom)) {
      right -= xStep;
    }

    if (right <= left || bottom <= top) {
      return { left: 0, top: 0, width, height };
    }

    const paddingX = xStep * 2;
    const paddingY = yStep * 2;

    return {
      left: Math.max(0, left - paddingX),
      top: Math.max(0, top - paddingY),
      width: Math.min(width, right - left + paddingX * 2),
      height: Math.min(height, bottom - top + paddingY * 2)
    };
  } catch {
    return { left: 0, top: 0, width, height };
  }
}

function resetVisibleBounds() {
  visibleBounds = null;
}

function mergeVisibleBounds(nextBounds: { left: number, top: number, width: number, height: number }) {
  const layer = display?.getDefaultLayer?.();
  const fullWidth = layer?.width || 1024;
  const fullHeight = layer?.height || 768;
  const nextRight = Math.min(fullWidth, nextBounds.left + nextBounds.width);
  const nextBottom = Math.min(fullHeight, nextBounds.top + nextBounds.height);

  if (!visibleBounds) {
    visibleBounds = {
      left: Math.max(0, nextBounds.left),
      top: Math.max(0, nextBounds.top),
      width: Math.max(1, nextRight - Math.max(0, nextBounds.left)),
      height: Math.max(1, nextBottom - Math.max(0, nextBounds.top))
    };
    return;
  }

  const currentRight = visibleBounds.left + visibleBounds.width;
  const currentBottom = visibleBounds.top + visibleBounds.height;
  const left = Math.max(0, Math.min(visibleBounds.left, nextBounds.left));
  const top = Math.max(0, Math.min(visibleBounds.top, nextBounds.top));
  const right = Math.min(fullWidth, Math.max(currentRight, nextRight));
  const bottom = Math.min(fullHeight, Math.max(currentBottom, nextBottom));

  visibleBounds = {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  };
}

function sampleVisibleBounds() {
  const layer = display?.getDefaultLayer?.();

  if (!layer) return;

  const fullWidth = layer.width || 1024;
  const fullHeight = layer.height || 768;
  const nextBounds = detectVisibleBounds();

  if (!nextBounds.width || !nextBounds.height) return;

  const widthRatio = nextBounds.width / fullWidth;
  const heightRatio = nextBounds.height / fullHeight;

  if (widthRatio > 0.985 && heightRatio > 0.985) {
    visibleBounds = {
      left: 0,
      top: 0,
      width: fullWidth,
      height: fullHeight
    };
    return;
  }

  mergeVisibleBounds(nextBounds);
}

function scheduleBoundsSampling() {
  [80, 220, 480, 900].forEach((delay) => {
    window.setTimeout(() => {
      sampleVisibleBounds();
      recomputeScale();
    }, delay);
  });
}

function recomputeScale() {
  if (!display || !playerAreaRef.value || !displayHostRef.value || !displayViewportRef.value) return;

  const layer = display.getDefaultLayer?.();
  const displayElement = display.getElement?.() as HTMLElement | undefined;

  if (!layer || !displayElement) return;

  const bounds = visibleBounds || {
    left: 0,
    top: 0,
    width: layer.width || 1024,
    height: layer.height || 768
  };
  const fullWidth = layer.width || 1024;
  const fullHeight = layer.height || 768;
  const visibleWidth = bounds.width || fullWidth;
  const visibleHeight = bounds.height || fullHeight;
  const width = playerAreaRef.value.clientWidth;
  const height = playerAreaRef.value.clientHeight;

  if (!width || !height) return;

  const nextScale = Math.max(0.1, Math.min(2, Math.min(width / visibleWidth, height / visibleHeight)));
  scale.value = Number(nextScale.toFixed(3));
  display.scale(scale.value);

  displayViewportRef.value.style.width = `${Math.round(visibleWidth * scale.value)}px`;
  displayViewportRef.value.style.height = `${Math.round(visibleHeight * scale.value)}px`;

  displayElement.style.position = "absolute";
  displayElement.style.left = `${-bounds.left * scale.value}px`;
  displayElement.style.top = `${-bounds.top * scale.value}px`;
  displayElement.style.transformOrigin = "0 0";
}

function togglePlayback() {
  if (!recording) return;

  if (recording.isPlaying()) {
    recording.pause();
    isPlaying.value = false;
  } else {
    recording.play();
    isPlaying.value = true;
  }
}

function seek(event: Event) {
  if (!recording) return;

  const value = Number((event.target as HTMLInputElement).value);
  isSeeking.value = true;

  recording.seek(value, () => {
    currentPosition.value = value;
    isSeeking.value = false;
    window.setTimeout(recomputeScale, 50);
  });
}

async function loadRecording() {
  if (!canvasRef.value) return;

  loading.value = true;
  errorMessage.value = "";
  resetVisibleBounds();

  tunnel = new Guacamole.StaticHTTPTunnel();
  recording = new Guacamole.SessionRecording(tunnel);
  display = recording.getDisplay();

  displayHostRef.value!.innerHTML = "";
  displayHostRef.value!.appendChild(display.getElement());

  let chunks = "";

  recording.onerror = (message: string) => {
    errorMessage.value = message;
    loading.value = false;
  };
  recording.onplay = () => {
    isPlaying.value = true;
  };
  recording.onpause = () => {
    isPlaying.value = false;
  };
  recording.onseek = (position: number) => {
    currentPosition.value = position;
    sampleVisibleBounds();
    window.setTimeout(recomputeScale, 30);
    scheduleBoundsSampling();
  };

  if (props.source.startsWith("blob:")) {
    try {
      const response = await fetch(props.source);
      const compressed = new Uint8Array(await response.arrayBuffer());
      const output = gunzipSync(compressed);
      chunks = new TextDecoder("utf-8").decode(output);

      loading.value = false;
      recording.connect(chunks);
      duration.value = recording.getDuration?.() || 0;
      recording.play();
      currentPosition.value = 0;
      sampleVisibleBounds();
      window.setTimeout(recomputeScale, 80);
      window.setTimeout(recomputeScale, 240);
      scheduleBoundsSampling();
    } catch (error: any) {
      loading.value = false;
      errorMessage.value = error?.message || String(error);
    }
    return;
  }

  await streamTextFile(props.source, {
    onChunk(chunk) {
      chunks += chunk;
    },
    onEnd() {
      loading.value = false;
      recording.connect(chunks);
      duration.value = recording.getDuration?.() || 0;
      recording.play();
      currentPosition.value = 0;
      sampleVisibleBounds();
      window.setTimeout(recomputeScale, 80);
      window.setTimeout(recomputeScale, 240);
      scheduleBoundsSampling();
    },
    onError(message) {
      loading.value = false;
      errorMessage.value = message;
    }
  });
}

function cleanup() {
  try {
    recording?.pause?.();
    recording?.disconnect?.();
  } catch {
    // ignore cleanup errors
  }

  if (displayHostRef.value) {
    displayHostRef.value.innerHTML = "";
  }

  tunnel = null;
  recording = null;
  display = null;
  resetVisibleBounds();
  isPlaying.value = false;
  currentPosition.value = 0;
  duration.value = 0;
}

function handleResize() {
  recomputeScale();
}

onMounted(async () => {
  const originalToCanvas = Guacamole.Layer.prototype.toCanvas;
  Guacamole.Layer.prototype.toCanvas = function () {
    if (this.width === 0 || this.height === 0) {
      const fallback = document.createElement("canvas");
      fallback.width = Math.max(this.width || 1, 1);
      fallback.height = Math.max(this.height || 1, 1);
      return fallback;
    }

    try {
      return originalToCanvas.call(this);
    } catch {
      const fallback = document.createElement("canvas");
      fallback.width = Math.max(this.width || 1, 1);
      fallback.height = Math.max(this.height || 1, 1);
      return fallback;
    }
  };

  window.addEventListener("resize", handleResize);
  await loadRecording();
});

watch(() => props.source, async () => {
  cleanup();
  await nextTick();
  await loadRecording();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
  cleanup();
});
</script>

<template>
  <div class="relative isolate flex h-full min-w-0 flex-col gap-0 overflow-hidden">
    <div ref="playerAreaRef" class="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-black/70">
      <div
        v-if="loading"
        class="absolute inset-0 z-10 flex items-center justify-center bg-black/40 text-sm text-white/80"
      >
        正在解析录像…
      </div>

      <div
        v-if="errorMessage"
        class="absolute inset-0 z-10 flex items-center justify-center bg-black/65 px-6 text-center text-sm text-red-200"
      >
        {{ errorMessage }}
      </div>

      <div ref="canvasRef" class="relative flex h-full w-full items-center justify-center overflow-hidden">
        <div
          ref="displayViewportRef"
          class="relative shrink-0 overflow-hidden"
        >
          <div ref="displayHostRef" class="relative h-full w-full overflow-hidden" />
        </div>
      </div>
    </div>

    <div class="gua-controls flex items-center gap-3 rounded-none px-3 py-2">
      <button
        class="gua-play-button"
        :disabled="loading || !!errorMessage"
        type="button"
        @click="togglePlayback"
      >
        <UIcon :name="isPlaying ? 'line-md:pause' : 'line-md:play-filled'" class="text-xl" />
      </button>
      <div class="w-22 text-xs tabular-nums text-(--ui-text-muted)">
        {{ currentLabel }} / {{ durationLabel }}
      </div>
      <input
        class="gua-range h-2 flex-1 cursor-pointer"
        type="range"
        min="0"
        :max="duration"
        :value="currentPosition"
        :disabled="loading || isSeeking || !duration"
        @input="seek"
      >
      <div class="w-16 text-right text-[11px] uppercase tracking-[0.16em] text-(--ui-text-dimmed)">
        {{ Math.round(scale * 100) }}%
      </div>
    </div>
  </div>
</template>

<style scoped>
.gua-controls {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--ui-bg-elevated) 90%, transparent), color-mix(in srgb, var(--ui-bg) 82%, transparent));
  border: 1px solid color-mix(in srgb, var(--ui-border) 72%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 5%, transparent);
}

.gua-play-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ui-color-primary-500) 18%, var(--ui-bg-accented));
  color: var(--ui-text-highlighted);
  transition:
    transform 160ms ease,
    background-color 160ms ease,
    opacity 160ms ease;
}

.gua-play-button:hover:not(:disabled) {
  transform: scale(1.03);
  background: color-mix(in srgb, var(--ui-color-primary-500) 24%, var(--ui-bg-accented));
}

.gua-play-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.gua-range {
  appearance: none;
  background: transparent;
}

.gua-range::-webkit-slider-runnable-track {
  height: 0.28rem;
  border-radius: 9999px;
  background: linear-gradient(90deg, var(--ui-color-primary-500), color-mix(in srgb, var(--ui-color-primary-500) 35%, var(--ui-border)));
}

.gua-range::-webkit-slider-thumb {
  appearance: none;
  margin-top: -4px;
  width: 0.82rem;
  height: 0.82rem;
  border: 2px solid color-mix(in srgb, white 92%, transparent);
  border-radius: 9999px;
  background: var(--ui-color-primary-500);
  box-shadow: 0 2px 10px color-mix(in srgb, black 25%, transparent);
}

.gua-range::-moz-range-track {
  height: 0.28rem;
  border: 0;
  border-radius: 9999px;
  background: linear-gradient(90deg, var(--ui-color-primary-500), color-mix(in srgb, var(--ui-color-primary-500) 35%, var(--ui-border)));
}

.gua-range::-moz-range-thumb {
  width: 0.82rem;
  height: 0.82rem;
  border: 2px solid color-mix(in srgb, white 92%, transparent);
  border-radius: 9999px;
  background: var(--ui-color-primary-500);
  box-shadow: 0 2px 10px color-mix(in srgb, black 25%, transparent);
}
</style>
