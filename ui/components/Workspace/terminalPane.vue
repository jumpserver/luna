<script setup lang="ts">
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";

import "@xterm/xterm/css/xterm.css";

const props = defineProps<{
  tab: WorkspaceSessionTab
}>();

const terminalRef = ref<HTMLElement | null>(null);
const colorMode = useColorMode();
const { markSessionConnected } = useWorkspaceTabs();

let terminal: any = null;
let fitAddon: any = null;
let resizeObserver: ResizeObserver | null = null;
let unlistenOutput: UnlistenFn | null = null;
let unlistenReady: UnlistenFn | null = null;
let unlistenExit: UnlistenFn | null = null;
let sessionStarted = false;

const token = computed(() => props.tab.payload?.token || props.tab.payload || {});
const tokenId = computed(() => props.tab.payload?.id || token.value?.id || "");
const tokenValue = computed(() => props.tab.payload?.value || token.value?.value || "");
const endpoint = ref<Record<string, any> | null>(null);
const endpointHost = computed(() => endpoint.value?.host || "");
const endpointPort = computed(() => Number(endpoint.value?.ssh_port || endpoint.value?.port || 22) || 22);
const username = computed(() => (tokenId.value ? `JMS-${tokenId.value}` : "JMS-<token>"));
const terminalTheme = computed(() => {
  if (colorMode.value === "dark") {
    return {
      background: "#09090b",
      foreground: "#d4d4d8",
      cursor: "#22c55e",
      selectionBackground: "#3f3f46",
      black: "#18181b",
      red: "#f87171",
      green: "#22c55e",
      yellow: "#facc15",
      blue: "#60a5fa",
      magenta: "#c084fc",
      cyan: "#22d3ee",
      white: "#d4d4d8",
      brightBlack: "#71717a",
      brightRed: "#fca5a5",
      brightGreen: "#4ade80",
      brightYellow: "#fde047",
      brightBlue: "#93c5fd",
      brightMagenta: "#d8b4fe",
      brightCyan: "#67e8f9",
      brightWhite: "#fafafa"
    };
  }

  return {
    background: "#ffffff",
    foreground: "#27272a",
    cursor: "#16a34a",
    selectionBackground: "#d4d4d8",
    black: "#18181b",
    red: "#dc2626",
    green: "#16a34a",
    yellow: "#ca8a04",
    blue: "#2563eb",
    magenta: "#9333ea",
    cyan: "#0891b2",
    white: "#e4e4e7",
    brightBlack: "#71717a",
    brightRed: "#ef4444",
    brightGreen: "#22c55e",
    brightYellow: "#eab308",
    brightBlue: "#3b82f6",
    brightMagenta: "#a855f7",
    brightCyan: "#06b6d4",
    brightWhite: "#ffffff"
  };
});

const fitTerminal = () => {
  fitAddon?.fit();
};

const getTerminalSize = () => ({
  cols: terminal?.cols || 80,
  rows: terminal?.rows || 24
});

const renderIntro = () => {
  if (!terminal) return;

  terminal.clear();
  terminal.writeln("\x1B[1;32mJumpServer built-in terminal\x1B[0m");
  terminal.writeln("");
  terminal.writeln(`Asset   : ${props.tab.assetName}`);
  terminal.writeln(`Protocol: ${props.tab.protocol}`);
  terminal.writeln(`Endpoint: ${endpointHost.value || "-"}:${endpointPort.value || "-"}`);
  terminal.writeln(`Username: ${username.value}`);
  terminal.writeln("");
  terminal.writeln(props.tab.payload ? "Connection token is ready." : "Creating JumpServer connection token...");
};

const startBridge = async () => {
  if (sessionStarted || !terminal || !props.tab.payload) return;
  if (props.tab.protocol !== "ssh") {
    terminal.writeln("\r\nOnly SSH is supported by the built-in terminal right now.");
    return;
  }

  if (!tokenId.value || !tokenValue.value) {
    terminal.writeln("\r\nMissing token fields for built-in SSH bridge.");
    return;
  }

  sessionStarted = true;
  terminal.clear();

  try {
    terminal.writeln("Resolving JumpServer smart endpoint...");
    endpoint.value = await useTauriCoreInvoke<Record<string, any>>("get_smart_endpoint", {
      query: {
        protocol: "ssh",
        assetId: props.tab.assetId,
        token: tokenId.value
      }
    });

    if (!endpointHost.value) {
      throw new Error("smart endpoint missing host");
    }

    terminal.writeln(`Connecting ${username.value}@${endpointHost.value}:${endpointPort.value}...`);
    const size = getTerminalSize();

    await useTauriCoreInvoke("builtin_ssh_start", {
      payload: {
        tabId: props.tab.id,
        host: endpointHost.value,
        port: endpointPort.value,
        username: username.value,
        password: tokenValue.value,
        cols: size.cols,
        rows: size.rows
      }
    });
  } catch (error) {
    sessionStarted = false;
    terminal.writeln(`\r\nFailed to start SSH bridge: ${String(error)}`);
  }
};

const bindTauriEvents = async () => {
  if (unlistenOutput) return;

  unlistenOutput = await useTauriEventListen("builtin-session-output", (event) => {
    const payload = event.payload as { tabId: string, data: string };
    if (payload.tabId !== props.tab.id) return;
    terminal?.write(payload.data);
  });

  unlistenReady = await useTauriEventListen("builtin-session-ready", (event) => {
    const payload = event.payload as { tabId: string };
    if (payload.tabId !== props.tab.id) return;
    markSessionConnected(props.tab.id);
  });

  unlistenExit = await useTauriEventListen("builtin-session-exit", (event) => {
    const payload = event.payload as { tabId: string, status?: number };
    if (payload.tabId !== props.tab.id) return;
    terminal?.writeln(`\r\nSession closed${payload.status !== undefined ? ` (${payload.status})` : ""}.`);
  });
};

const mountTerminal = async () => {
  if (!terminalRef.value || terminal || !import.meta.client) return;

  const [{ Terminal }, { FitAddon }] = await Promise.all([
    import("@xterm/xterm"),
    import("@xterm/addon-fit")
  ]);

  terminal = new Terminal({
    cursorBlink: true,
    convertEol: true,
    fontFamily: "Menlo, Monaco, Consolas, monospace",
    fontSize: 13,
    theme: terminalTheme.value
  });

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(terminalRef.value);
  fitTerminal();
  renderIntro();
  await bindTauriEvents();
  await startBridge();

  terminal.onData((data: string) => {
    useTauriCoreInvoke("builtin_session_input", {
      payload: { tabId: props.tab.id, data }
    }).catch(() => {});
  });

  resizeObserver = new ResizeObserver(() => {
    fitTerminal();
    const size = getTerminalSize();
    useTauriCoreInvoke("builtin_session_resize", {
      payload: { tabId: props.tab.id, cols: size.cols, rows: size.rows }
    }).catch(() => {});
  });
  resizeObserver.observe(terminalRef.value);
};

watch(
  () => props.tab.payload,
  () => {
    renderIntro();
    startBridge();
  },
  { deep: true }
);

watch(
  terminalTheme,
  (theme) => {
    if (terminal) {
      terminal.options.theme = theme;
    }
  }
);

onMounted(() => {
  mountTerminal();
});

onBeforeUnmount(() => {
  unlistenOutput?.();
  unlistenReady?.();
  unlistenExit?.();
  resizeObserver?.disconnect();
  terminal?.dispose();
  unlistenOutput = null;
  unlistenReady = null;
  unlistenExit = null;
  resizeObserver = null;
  terminal = null;
  fitAddon = null;
});
</script>

<template>
  <div
    ref="terminalRef"
    class="h-full min-h-0 w-full p-2 overflow-hidden bg-white dark:bg-zinc-950"
  />
</template>
