<script setup lang="ts">
import type { ChenPromptConsoleTab, ChenQueryLikeWorkspaceTab } from "~/chen/types";

import { appTerminalTheme, getDefaultTerminalConfig } from "@jumpserver/koko";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

import "@xterm/xterm/css/xterm.css";

const props = defineProps<{
  tab: ChenPromptConsoleTab;
  contextLabel: string;
  promptLabel: string;
}>();

const emit = defineEmits<{
  run: [tab: ChenPromptConsoleTab];
  cancel: [tab: ChenQueryLikeWorkspaceTab];
  clear: [tab: ChenPromptConsoleTab];
  updatePendingSql: [tab: ChenPromptConsoleTab, value: string];
}>();

const terminalConfig = getDefaultTerminalConfig();
const containerRef = shallowRef<HTMLElement | null>(null);
const inputRef = ref<HTMLTextAreaElement | null>(null);
const terminal = shallowRef<Terminal | null>(null);
const fitAddon = new FitAddon();
let resizeObserver: ResizeObserver | null = null;
let themeObserver: MutationObserver | null = null;
let renderedOutput = "";
let historyIndex: number | null = null;
let historyDraft = "";

const pendingSqlValue = computed({
  get: () => props.tab.pendingSql,
  set: (value: string) => emit("updatePendingSql", props.tab, value)
});
const busy = computed(() => Boolean(props.tab.state.loading || props.tab.state.inQuery));

function fitTerminal() {
  if (!terminal.value || !containerRef.value) return;
  const { width, height } = containerRef.value.getBoundingClientRect();
  if (width > 0 && height > 0) fitAddon.fit();
}

function syncTerminalTheme() {
  if (terminal.value) terminal.value.options.theme = appTerminalTheme();
}

function syncTerminalOutput(output: string) {
  const instance = terminal.value;
  if (!instance || output === renderedOutput) return;
  if (output.startsWith(renderedOutput)) {
    instance.write(output.slice(renderedOutput.length).replaceAll("\n", "\r\n"));
  } else {
    instance.reset();
    instance.write(output.replaceAll("\n", "\r\n"));
  }
  renderedOutput = output;
  instance.scrollToBottom();
}

function run() {
  if (busy.value || !pendingSqlValue.value.trim()) return;
  historyIndex = null;
  historyDraft = "";
  emit("run", props.tab);
}

function moveHistory(direction: -1 | 1) {
  const entries = props.tab.historyEntries;
  if (!entries.length) return;
  if (historyIndex === null) {
    if (direction > 0) return;
    historyDraft = pendingSqlValue.value;
    historyIndex = entries.length - 1;
  } else {
    historyIndex += direction;
    if (historyIndex < 0) historyIndex = 0;
    if (historyIndex >= entries.length) {
      historyIndex = null;
      pendingSqlValue.value = historyDraft;
      return;
    }
  }
  pendingSqlValue.value = entries[historyIndex]?.sql || "";
  nextTick(() => inputRef.value?.setSelectionRange(pendingSqlValue.value.length, pendingSqlValue.value.length));
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    run();
    return;
  }
  if (event.key === "Enter" && pendingSqlValue.value.trimEnd().endsWith(";")) {
    event.preventDefault();
    run();
    return;
  }
  if (event.key === "ArrowUp" && !event.shiftKey && inputRef.value?.selectionStart === 0) {
    event.preventDefault();
    moveHistory(-1);
    return;
  }
  if (event.key === "ArrowDown" && !event.shiftKey && inputRef.value?.selectionEnd === pendingSqlValue.value.length) {
    event.preventDefault();
    moveHistory(1);
  }
}

function clear() {
  renderedOutput = "";
  terminal.value?.reset();
  emit("clear", props.tab);
  inputRef.value?.focus();
}

function focus() {
  inputRef.value?.focus();
}

watch(() => props.tab.terminalOutput, syncTerminalOutput);

onMounted(() => {
  if (!containerRef.value) return;
  const instance = new Terminal({
    fontFamily: terminalConfig.fontFamily,
    fontSize: terminalConfig.fontSize,
    lineHeight: terminalConfig.lineHeight,
    cursorBlink: false,
    scrollback: 5000,
    scrollOnUserInput: true,
    theme: appTerminalTheme(),
    minimumContrastRatio: 4.5,
    allowProposedApi: true,
    customGlyphs: true
  });
  instance.loadAddon(fitAddon);
  instance.open(containerRef.value);
  terminal.value = instance;
  resizeObserver = new ResizeObserver(fitTerminal);
  resizeObserver.observe(containerRef.value);
  themeObserver = new MutationObserver(syncTerminalTheme);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme-preset", "style"]
  });
  fitTerminal();
  syncTerminalOutput(props.tab.terminalOutput);
  inputRef.value?.focus();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  themeObserver?.disconnect();
  terminal.value?.dispose();
  terminal.value = null;
});

defineExpose({ focus });
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-[var(--app-main-bg)]">
    <div class="flex shrink-0 items-center justify-between border-b border-default px-3 py-1.5 text-xs">
      <div class="flex min-w-0 items-center gap-2 text-muted">
        <UIcon name="i-lucide-square-terminal" class="size-4 text-primary" />
        <span class="truncate">{{ tab.state.currentContext || contextLabel || "Console" }}</span>
      </div>
      <div class="flex items-center gap-1">
        <UButton
          v-if="tab.state.canCancel"
          icon="i-lucide-square"
          size="xs"
          color="neutral"
          variant="ghost"
          title="Cancel query"
          @click="emit('cancel', tab)"
        />
        <UButton
          icon="i-lucide-eraser"
          size="xs"
          color="neutral"
          variant="ghost"
          title="Clear console"
          @click="clear"
        />
      </div>
    </div>

    <div ref="containerRef" class="chen-console-terminal min-h-0 flex-1" />

    <div class="flex shrink-0 items-start gap-2 px-3 pb-3 pt-1 font-ui-mono text-sm">
      <span class="shrink-0 pt-1 text-primary">{{ promptLabel }}</span>
      <textarea
        ref="inputRef"
        v-model="pendingSqlValue"
        class="max-h-32 min-h-7 flex-1 resize-none bg-transparent py-1 text-[var(--app-fg)] outline-none placeholder:text-[var(--app-muted)]"
        :disabled="busy"
        rows="1"
        placeholder="Enter SQL; finish with ; or press Cmd/Ctrl+Enter"
        spellcheck="false"
        @keydown="handleKeydown"
      />
    </div>
  </div>
</template>

<style scoped>
.chen-console-terminal :deep(.xterm) {
  height: 100%;
  padding: 10px 12px 4px;
}

.chen-console-terminal :deep(.xterm-viewport) {
  background-color: transparent !important;
}
</style>
