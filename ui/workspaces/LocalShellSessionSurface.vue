<script setup lang="ts">
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";

import {
  appTerminalTheme,
  getDefaultTerminalConfig,
  registerLocalShellTerminalSession,
  unregisterLocalShellTerminalSession
} from "@jumpserver/koko";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

interface LocalShellOutput {
  sessionId: string;
  data: number[];
}

interface LocalShellExit {
  sessionId: string;
}

const props = defineProps<{ tab: WorkspaceSessionTab }>();
const { markSessionConnected, markSessionFailed } = useWorkspaceTabs();
const terminalConfig = getDefaultTerminalConfig();
const containerRef = shallowRef<HTMLElement | null>(null);
const terminal = shallowRef<Terminal | null>(null);
const fitAddon = new FitAddon();
const unlisteners: UnlistenFn[] = [];
let resizeObserver: ResizeObserver | null = null;
let started = false;

function fitTerminal() {
  if (!terminal.value || !containerRef.value) return false;
  const { width, height } = containerRef.value.getBoundingClientRect();
  if (width <= 0 || height <= 0) return false;
  fitAddon.fit();
  return true;
}

async function resize() {
  if (!started || !terminal.value || !fitTerminal()) return;
  await useTauriCoreInvoke("resize_local_shell", {
    sessionId: props.tab.id,
    cols: terminal.value.cols,
    rows: terminal.value.rows
  }).catch(() => {});
}

async function start() {
  if (!containerRef.value || !isTauriRuntime()) return;

  const instance = new Terminal({
    fontFamily: terminalConfig.fontFamily,
    fontSize: terminalConfig.fontSize,
    lineHeight: terminalConfig.lineHeight,
    cursorBlink: true,
    cursorStyle: "block",
    rightClickSelectsWord: true,
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
  fitTerminal();

  unlisteners.push(
    await useTauriEventListen<LocalShellOutput>("local-shell-output", ({ payload }) => {
      if (payload.sessionId === props.tab.id) {
        instance.write(new Uint8Array(payload.data));
      }
    }),
    await useTauriEventListen<LocalShellExit>("local-shell-exit", ({ payload }) => {
      if (payload.sessionId === props.tab.id) {
        started = false;
        unregisterLocalShellTerminalSession(props.tab.id);
        markSessionFailed({
          tabId: props.tab.id,
          assetId: props.tab.assetId,
          protocol: props.tab.protocol,
          account: props.tab.account
        });
        instance.write("\r\n\x1B[90m[Process exited]\x1B[0m\r\n");
      }
    })
  );

  instance.onData((data) => {
    void useTauriCoreInvoke("write_local_shell", {
      sessionId: props.tab.id,
      data: Array.from(new TextEncoder().encode(data))
    });
  });
  instance.onResize(({ cols, rows }) => {
    if (!started) return;
    void useTauriCoreInvoke("resize_local_shell", {
      sessionId: props.tab.id,
      cols,
      rows
    });
  });

  resizeObserver = new ResizeObserver(() => void resize());
  resizeObserver.observe(containerRef.value);

  try {
    await useTauriCoreInvoke("start_local_shell", {
      sessionId: props.tab.id,
      cols: instance.cols,
      rows: instance.rows
    });
    started = true;
    await resize();
    registerLocalShellTerminalSession(props.tab.id, (data) => {
      void useTauriCoreInvoke("write_local_shell", {
        sessionId: props.tab.id,
        data: Array.from(new TextEncoder().encode(data))
      });
    });
    markSessionConnected(props.tab.id);
    instance.focus();
  } catch (error) {
    markSessionFailed({
      tabId: props.tab.id,
      assetId: props.tab.assetId,
      protocol: props.tab.protocol,
      account: props.tab.account
    });
    instance.write(`\x1B[31m${String(error)}\x1B[0m\r\n`);
  }
}

function focus() {
  terminal.value?.focus();
}

onMounted(() => void start());

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  unregisterLocalShellTerminalSession(props.tab.id);
  for (const unlisten of unlisteners) unlisten();
  if (started) {
    void useTauriCoreInvoke("close_local_shell", { sessionId: props.tab.id });
  }
  terminal.value?.dispose();
  terminal.value = null;
});

defineExpose({ focus });
</script>

<template>
  <div ref="containerRef" class="local-shell-terminal h-full min-h-0 w-full" />
</template>

<style scoped>
.local-shell-terminal {
  background: var(--app-main-bg);
}

.local-shell-terminal :deep(.terminal) {
  height: 100%;
  padding: 12px 4px 8px 12px;
}

.local-shell-terminal :deep(.xterm-viewport) {
  background-color: transparent !important;
}
</style>
