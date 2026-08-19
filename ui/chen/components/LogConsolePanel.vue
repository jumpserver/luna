<script setup lang="ts">
import type { ChenLogConsoleEntry } from "~/chen/types";

const props = defineProps<{
  entries: ChenLogConsoleEntry[];
}>();

const emit = defineEmits<{
  clear: [];
  close: [];
}>();

const logBody = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const followTail = ref(true);
const panelHeight = ref(224);
const maxPanelHeight = ref(640);
const resizing = ref(false);
const MIN_PANEL_HEIGHT = 128;
const MAX_PANEL_HEIGHT = 640;
const MIN_WORKSPACE_HEIGHT = 96;
const PANEL_RESIZE_STEP = 16;

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour12: false });
}

function handleScroll() {
  const element = logBody.value;
  if (!element) return;
  followTail.value = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
}

function scrollToTail() {
  const element = logBody.value;
  if (element) element.scrollTop = element.scrollHeight;
}

function updateMaxPanelHeight() {
  const containerHeight = panel.value?.parentElement?.clientHeight || 0;
  maxPanelHeight.value = Math.max(MIN_PANEL_HEIGHT, Math.min(MAX_PANEL_HEIGHT, containerHeight - MIN_WORKSPACE_HEIGHT));
  panelHeight.value = Math.min(panelHeight.value, maxPanelHeight.value);
}

function setPanelHeight(height: number) {
  updateMaxPanelHeight();
  panelHeight.value = Math.min(maxPanelHeight.value, Math.max(MIN_PANEL_HEIGHT, height));
}

function resizePanel(event: PointerEvent) {
  if (!resizing.value) return;
  const container = panel.value?.parentElement?.getBoundingClientRect();
  if (!container) return;
  setPanelHeight(container.bottom - event.clientY);
  event.preventDefault();
}

function beginResize(event: PointerEvent) {
  if (event.button !== 0) return;
  resizing.value = true;
  document.body.style.cursor = "row-resize";
  document.body.style.userSelect = "none";
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  resizePanel(event);
  event.preventDefault();
}

function endResize(event: PointerEvent) {
  if (!resizing.value) return;
  const target = event.currentTarget as HTMLElement;
  if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  resizing.value = false;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
}

function resizeWithKeyboard(event: KeyboardEvent) {
  const delta = event.key === "ArrowUp" ? PANEL_RESIZE_STEP : event.key === "ArrowDown" ? -PANEL_RESIZE_STEP : 0;
  if (!delta) return;
  setPanelHeight(panelHeight.value + delta);
  event.preventDefault();
}

onMounted(() => {
  updateMaxPanelHeight();
  window.addEventListener("resize", updateMaxPanelHeight);
  nextTick(scrollToTail);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateMaxPanelHeight);
  if (!resizing.value) return;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
});

watch(
  () => props.entries.length,
  () => {
    if (followTail.value) nextTick(scrollToTail);
  }
);
</script>

<template>
  <section
    ref="panel"
    class="flex min-h-32 shrink-0 flex-col bg-[var(--workspace-surface-sub-panel)]"
    :style="{ height: `${panelHeight}px` }"
  >
    <div
      role="separator"
      tabindex="0"
      aria-label="Resize Log Console"
      aria-orientation="horizontal"
      :aria-valuenow="Math.round(panelHeight)"
      :aria-valuemin="MIN_PANEL_HEIGHT"
      :aria-valuemax="Math.round(maxPanelHeight)"
      class="group relative z-20 h-px shrink-0 cursor-row-resize touch-none bg-default/60 outline-none hover:bg-primary/40 focus-visible:bg-primary/60"
      :class="resizing ? 'bg-primary/60' : ''"
      @pointerdown="beginResize"
      @pointermove="resizePanel"
      @pointerup="endResize"
      @pointercancel="endResize"
      @keydown="resizeWithKeyboard"
    >
      <div class="absolute -inset-y-1.5 inset-x-0" />
    </div>
    <header class="flex h-9 shrink-0 items-center gap-2 border-b border-default px-3">
      <UIcon name="i-lucide-scroll-text" class="size-3.5 text-muted" />
      <h2 class="text-xs font-medium text-highlighted">Log Console</h2>
      <span class="text-[11px] text-muted">{{ entries.length }} entries</span>
      <UButton
        class="ml-auto"
        size="xs"
        icon="i-lucide-trash-2"
        color="neutral"
        variant="ghost"
        :disabled="entries.length === 0"
        aria-label="Clear Log Console"
        title="Clear Log Console"
        @click="emit('clear')"
      />
      <UButton
        size="xs"
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        aria-label="Close Log Console"
        title="Close Log Console"
        @click="emit('close')"
      />
    </header>

    <div
      ref="logBody"
      class="min-h-0 flex-1 overflow-auto px-3 py-2 font-ui-mono text-[11px] leading-5"
      @scroll="handleScroll"
    >
      <div v-if="entries.length" class="min-w-max">
        <div
          v-for="entry in entries"
          :key="entry.id"
          class="grid grid-cols-[5rem_3.5rem_10rem_minmax(20rem,1fr)] gap-2"
        >
          <time class="text-dimmed">{{ formatTimestamp(entry.timestamp) }}</time>
          <span
            class="uppercase"
            :class="{
              'text-error': entry.level === 'error',
              'text-warning': entry.level === 'warning',
              'text-muted': entry.level === 'info'
            }"
          >
            {{ entry.level }}
          </span>
          <span class="truncate text-muted" :title="entry.sourceTitle">{{ entry.sourceTitle }}</span>
          <span class="whitespace-pre-wrap break-words text-default">{{ entry.message }}</span>
        </div>
      </div>
      <div v-else class="grid h-full place-items-center text-xs text-muted">No logs in this database session.</div>
    </div>
  </section>
</template>
