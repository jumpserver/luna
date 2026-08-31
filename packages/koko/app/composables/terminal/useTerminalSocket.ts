import type { TerminalMessageHandlers } from "#koko/composables/terminal/useTerminalMessageHandler";
import type { OnlineUser, SettingConfig, ShareUserOptions } from "#koko/types/session";
import type { KokoZmodemSentry } from "./zmodemTypes";
import { connectorSessionKey, FORMATTER_MESSAGE_TYPE, HOST_MESSAGE_TYPE } from "@jumpserver/connectors-core";
import { useKokoHostAdapter } from "@jumpserver/koko/host";
import { useDebounceFn, useResizeObserver } from "@vueuse/core";

import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import { KOKO_MCP_FRAME_TYPES } from "#koko/composables/agent/types";
import {
  handleKokoLatencyPong,
  handleKokoLinuxMetricsStatus,
  handleKokoLinuxMetricsUpdate,
  LATENCY_PONG,
  METRICS_STATUS,
  METRICS_UPDATE,
  registerKokoLinuxMetricsSession,
  unregisterKokoLinuxMetricsSession
} from "#koko/composables/terminal/useLinuxMetrics";
import {
  connectKokoTerminalAiSession,
  disconnectKokoTerminalAiSession,
  handleKokoTerminalAiWireMessage,
  isKokoTerminalAiBusy,
  isKokoTerminalAiInputLocked,
  registerKokoTerminalAiSession,
  unregisterKokoTerminalAiSession
} from "#koko/composables/terminal/useTerminalAiSessions";
import { useKokoTerminalBinaryHandler } from "#koko/composables/terminal/useTerminalBinaryHandler";
import { useKokoTerminalEvents } from "#koko/composables/terminal/useTerminalEvents";
import { useKokoTerminalHeartbeat } from "#koko/composables/terminal/useTerminalHeartbeat";
import { useKokoTerminalCommandSuggestions } from "#koko/composables/terminal/useTerminalCommandSuggestions";
import { useKokoTerminalInput } from "#koko/composables/terminal/useTerminalInput";
import {
  createKokoTerminalMessageHandlers,
  useKokoTerminalMessageHandler
} from "#koko/composables/terminal/useTerminalMessageHandler";
import { useKokoTerminalTransport } from "#koko/composables/terminal/useTerminalTransport";
import { useKokoZmodem } from "#koko/composables/terminal/useZmodem";
import {
  registerKokoTerminalDataSender,
  registerKokoTerminalSession,
  unregisterKokoTerminalDataSender,
  unregisterKokoTerminalSession
} from "#koko/composables/useTerminalSessionRegistry";
import { useKokoWsUrl } from "#koko/composables/wsUrl";
import { useKokoConnectionStore } from "#koko/stores/connection";
import { useKokoTerminalSettingsStore } from "#koko/stores/terminalSettings";
import { getDefaultTerminalConfig } from "#koko/utils/guard";
import { appTerminalTheme, terminalTheme } from "#koko/utils/terminalTheme";
import { formatMessage, preprocessInput } from "#koko/utils/terminalUtils";

const isSocketOpen = (socket: WebSocket) => socket.readyState === WebSocket.OPEN;

const isXtermAddonDisposeError = (error: unknown) =>
  error instanceof Error && error.message.includes("Could not dispose an addon that has not been loaded");

export const useKokoTerminalSocket = () => {
  const toast = useToast();
  const zmodem = useKokoZmodem();
  const transport = useKokoTerminalTransport();

  const { t } = useI18n();
  const { addErrorToast } = useErrorToast();
  const { createSentry } = zmodem;
  const {
    sendHostEvent,
    emitTerminalConnect,
    emitTerminalSession,
    hostBridge,
    sendMittEvent,
    sendToHost,
    setClipboardAccess,
    canUseClipboard,
    validateClipboardText
  } = useKokoTerminalEvents();

  const containerRef = shallowRef<HTMLElement>();
  const shareId = ref("");
  const shareCode = ref("");
  const sessionId = ref("");
  const terminalId = ref("");
  const selectionText = ref("");
  const contextMenuVisible = ref(false);
  const contextMenuPosition = ref({ x: 0, y: 0 });
  const lastSendTime = ref(new Date());
  const lastReceiveTime = ref(new Date());
  const onlineUsers = ref<OnlineUser[]>([]);
  const userOptions = ref<ShareUserOptions[]>([]);
  const terminalRef = shallowRef<Terminal | null>(null);
  const connectionError = ref("");
  const sentryRef = ref<KokoZmodemSentry | null>(null);
  const socketRef = transport.socket;
  const featureSetting = ref<Partial<SettingConfig>>({});
  const warningInterval = ref<ReturnType<typeof setInterval> | null>(null);
  const searchAddon = shallowRef<SearchAddon | null>(null);
  const heartbeat = useKokoTerminalHeartbeat({
    socket: () => socketRef.value,
    lastReceiveTime,
    lastSendTime
  });
  const binaryHandler = useKokoTerminalBinaryHandler({
    terminalRef,
    sentryRef,
    abortActiveSession: zmodem.abortActiveSession,
    addErrorToast,
    t
  });

  const connectionStore = useKokoConnectionStore();
  const hostAdapter = useKokoHostAdapter();
  const defaultTerminalCfg = getDefaultTerminalConfig();
  const terminalSettingsStore = useKokoTerminalSettingsStore();
  const sessionCtxRef = inject(connectorSessionKey, null);
  const queryTerminalThemeName = computed(() => unref(sessionCtxRef)?.terminalThemeName || "");
  // 未显式指定主题名（workspace 内嵌场景）时跟随应用主题；独立 /koko/connect 路由带主题名则维持原逻辑
  const followAppTheme = computed(() => !!unref(sessionCtxRef) && !queryTerminalThemeName.value);
  let themeObserver: MutationObserver | null = null;
  let fitAddon: FitAddon | null = null;
  let socketOpened = false;
  let hasPendingContainerFit = false;

  const reportInitialConnectionFailure = () => {
    if (socketOpened || connectionError.value) return;

    connectionError.value = t("koko.terminal.websocketConnectionFailed");
    const tabId = unref(sessionCtxRef)?.tabId;
    if (!tabId) return;

    hostAdapter.markSessionFailed({
      id: tabId,
      assetId: "",
      protocol: "",
      account: ""
    });
  };

  const fitToContainer = () => {
    const container = containerRef.value;
    if (!container || container.clientWidth === 0 || container.clientHeight === 0) return;
    fitAddon?.fit();
  };

  const debouncedFitToContainer = useDebounceFn(fitToContainer, 80);
  const { stop: stopContainerResizeObserver } = useResizeObserver(containerRef, () => {
    if (import.meta.client && document.documentElement.dataset.rightPanelResizing === "true") {
      hasPendingContainerFit = true;
      return;
    }
    void debouncedFitToContainer();
  });

  const handleRightPanelResizeEnd = () => {
    if (!hasPendingContainerFit) return;
    hasPendingContainerFit = false;
    fitToContainer();
  };

  const openContextMenu = (event: MouseEvent) => {
    contextMenuPosition.value = { x: event.clientX, y: event.clientY };
    contextMenuVisible.value = true;
  };

  const debouncedResize = useDebounceFn(({ cols, rows }: { cols: number; rows: number }) => {
    if (!socketRef.value || !isSocketOpen(socketRef.value)) return;
    socketRef.value.send(
      formatMessage(terminalId.value, FORMATTER_MESSAGE_TYPE.TERMINAL_RESIZE, JSON.stringify({ cols, rows }))
    );
  }, 200);

  const debouncedSendHostKey = useDebounceFn((key: string) => {
    if (key === "ArrowRight") sendToHost(HOST_MESSAGE_TYPE.KEYEVENT, "alt+shift+right");
    if (key === "ArrowLeft") sendToHost(HOST_MESSAGE_TYPE.KEYEVENT, "alt+shift+left");
  }, 500);

  const terminalInputLocked = () => {
    const paneId = unref(sessionCtxRef)?.tabId || "";
    return Boolean(paneId && isKokoTerminalAiInputLocked(paneId));
  };
  const terminalAiBusy = () => {
    const paneId = unref(sessionCtxRef)?.tabId || "";
    return Boolean(paneId && isKokoTerminalAiBusy(paneId));
  };
  const sendSuggestionData = (data: string) => {
    const socket = socketRef.value;
    if (!socket || !isSocketOpen(socket) || terminalAiBusy() || zmodem.isActiveSession()) return false;
    lastSendTime.value = new Date();
    socket.send(
      formatMessage(
        terminalId.value,
        FORMATTER_MESSAGE_TYPE.TERMINAL_DATA,
        preprocessInput(data, terminalSettingsStore.getConfig)
      )
    );
    sendToHost(HOST_MESSAGE_TYPE.INPUT_ACTIVE, "");
    return true;
  };
  const commandSuggestions = useKokoTerminalCommandSuggestions({
    terminal: terminalRef,
    container: containerRef,
    send: sendSuggestionData,
    disabled: () => terminalAiBusy() || zmodem.isActiveSession() || !socketRef.value || !isSocketOpen(socketRef.value)
  });
  const sendExternalTerminalData = (data: string) => {
    commandSuggestions.invalidate();
    if (!data) return false;
    const socket = socketRef.value;
    if (!socket || !isSocketOpen(socket) || terminalInputLocked() || zmodem.isActiveSession()) return false;
    lastSendTime.value = new Date();
    socket.send(formatMessage(terminalId.value, FORMATTER_MESSAGE_TYPE.TERMINAL_DATA, data));
    return true;
  };

  const input = useKokoTerminalInput({
    container: containerRef,
    terminal: terminalRef,
    socket: socketRef,
    terminalId,
    sessionId,
    selectionText,
    lastSendTime,
    fit: () => fitAddon?.fit(),
    isSocketOpen,
    isZmodemActive: zmodem.isActiveSession,
    abortZmodem: zmodem.abortActiveSession,
    onContextMenu: openContextMenu,
    getTerminalConfig: () => terminalSettingsStore.getConfig,
    onResize: debouncedResize,
    onHostKey: debouncedSendHostKey,
    inputLocked: terminalInputLocked,
    addErrorToast,
    translate: t,
    sendHostEvent,
    sendToHost,
    sendMittEvent,
    validateClipboardText,
    onData: commandSuggestions.handleData,
    onExternalData: commandSuggestions.invalidate,
    onKeyEvent: commandSuggestions.handleKeyEvent
  });

  let lastMessage = "";

  const showInfoOnce = (content: string) => {
    if (lastMessage === content) return;
    toast.add({ title: content, color: "info" });
    lastMessage = content;
  };

  const terminalMessageHandlers: TerminalMessageHandlers = createKokoTerminalMessageHandlers({
    socketRef,
    terminalRef,
    featureSetting,
    onlineUsers,
    userOptions,
    shareId,
    shareCode,
    sessionId,
    terminalId,
    warningInterval,
    queryTerminalThemeName,
    followAppTheme,
    sessionCtxRef: computed(() => unref(sessionCtxRef)),
    t,
    toast,
    connectionStore,
    terminalSettingsStore,
    hostAdapter,
    hostBridge,
    sendHostEvent,
    emitTerminalConnect,
    emitTerminalSession,
    setClipboardAccess,
    showInfoOnce,
    onZmodemEnd: zmodem.finishDraining,
    onZmodemAbort: () => {
      zmodem.abortActiveSession();
      zmodem.finishDraining();
    },
    onConnected: (id, socket) => {
      const tabId = unref(sessionCtxRef)?.tabId;
      if (tabId) {
        registerKokoTerminalSession(tabId, {
          socket,
          terminalId: id,
          terminal: terminalRef.value || undefined
        });
        registerKokoTerminalDataSender(tabId, sendExternalTerminalData);
        registerKokoTerminalAiSession(tabId, socket, id);
        registerKokoLinuxMetricsSession(tabId, { socket, terminalId: id });
      }
    }
  });
  terminalMessageHandlers[METRICS_UPDATE] = (message) => {
    const tabId = unref(sessionCtxRef)?.tabId;
    if (tabId && (!message.terminalId || message.terminalId === Number(terminalId.value))) {
      handleKokoLinuxMetricsUpdate(tabId, message.data);
    }
  };
  terminalMessageHandlers[METRICS_STATUS] = (message) => {
    const tabId = unref(sessionCtxRef)?.tabId;
    if (tabId && (!message.terminalId || message.terminalId === Number(terminalId.value))) {
      handleKokoLinuxMetricsStatus(tabId, message.data);
    }
  };
  terminalMessageHandlers[LATENCY_PONG] = (message) => {
    const tabId = unref(sessionCtxRef)?.tabId;
    if (tabId && (!message.terminalId || message.terminalId === Number(terminalId.value))) {
      handleKokoLatencyPong(tabId, message.data);
    }
  };
  const messageHandler = useKokoTerminalMessageHandler(terminalMessageHandlers, {
    onTerminalOutput: (messageTerminalId, data) => {
      if (messageTerminalId === Number(terminalId.value)) {
        binaryHandler.handleBinaryMessage(data);
      }
    }
  });
  for (const type of KOKO_MCP_FRAME_TYPES) {
    terminalMessageHandlers[type] = (message) => {
      const tabId = unref(sessionCtxRef)?.tabId;
      if (tabId) handleKokoTerminalAiWireMessage(tabId, message);
    };
  }
  const listenSocketEvent = () => {
    const socket = socketRef.value;
    if (!socket) return;

    const paneId = unref(sessionCtxRef)?.tabId;
    if (paneId) registerKokoTerminalAiSession(paneId, socket, "");

    sentryRef.value = createSentry(terminalRef.value!, socket, terminalId, lastSendTime, () => {
      const paneId = unref(sessionCtxRef)?.tabId || "";
      return !paneId || !isKokoTerminalAiInputLocked(paneId);
    });

    const markSocketOpen = () => {
      socketOpened = true;
      connectionError.value = "";
      if (paneId) connectKokoTerminalAiSession(paneId, socket);
      heartbeat.start();
    };

    const handleSocketClose = () => {
      heartbeat.stop();
      zmodem.abortActiveSession();
      if (paneId) disconnectKokoTerminalAiSession(paneId, socket);
      if (!socketOpened) {
        reportInitialConnectionFailure();
        return;
      }
      if (!terminalRef.value) return;
      terminalRef.value.write("\r\n");
      terminalRef.value.write(`\x1B[31m${t("koko.terminal.websocketClosed")}\x1B[0m`);
    };

    const handleSocketMessage = async (message: MessageEvent) => {
      lastReceiveTime.value = new Date();
      try {
        if (message.data instanceof ArrayBuffer) messageHandler.handleEnvelopeMessage(message.data);
        else if (message.data instanceof Blob) {
          messageHandler.handleEnvelopeMessage(new Uint8Array(await message.data.arrayBuffer()));
        } else if (typeof message.data === "string") messageHandler.handleRawMessage(message.data);
      } catch (error) {
        addErrorToast({
          title: error instanceof Error ? error.message : t("koko.terminal.invalidMessage")
        });
      }
    };

    // VueUse useWebSocket owns socket.on* handlers. Use addEventListener so
    // capability/chat frames are not dropped when those handlers are replaced.
    socket.addEventListener("open", markSocketOpen);
    socket.addEventListener("error", reportInitialConnectionFailure);
    socket.addEventListener("close", handleSocketClose);
    socket.addEventListener("message", handleSocketMessage);

    if (socket.readyState === WebSocket.OPEN) markSocketOpen();
  };

  const createTerminal = () => {
    const terminal = new Terminal({
      fontSize: hostAdapter.theme.codeFontSize(),
      fontFamily: defaultTerminalCfg.fontFamily,
      lineHeight: defaultTerminalCfg.lineHeight,
      cursorBlink: true,
      cursorStyle: "block",
      rightClickSelectsWord: true,
      scrollback: 5000,
      scrollOnUserInput: true,
      theme: followAppTheme.value ? appTerminalTheme() : terminalTheme(defaultTerminalCfg.themeName),
      minimumContrastRatio: 4.5,
      allowProposedApi: true,
      customGlyphs: true
    });
    const fit = new FitAddon();
    const webgl = new WebglAddon();
    const search = new SearchAddon();

    webgl.onContextLoss(() => {
      try {
        webgl.dispose();
      } catch (error) {
        if (!isXtermAddonDisposeError(error)) throw error;
      }
    });

    terminal.loadAddon(fit);
    terminal.loadAddon(search);
    terminal.loadAddon(webgl);

    terminalRef.value = markRaw(terminal);
    fitAddon = fit;
    searchAddon.value = search;
  };

  const createWebSocket = () => {
    const url = useKokoWsUrl("terminal");
    const socket = transport.connect(url);
    if (!socket) {
      reportInitialConnectionFailure();
      addErrorToast({ title: t("koko.terminal.failedCreateConnection") });
    }
  };

  // dark/light 切 class、preset 切 data-theme-preset、Luna 预设写内联 style，三种路径都在 <html> 属性上
  const observeAppTheme = () => {
    if (!followAppTheme.value || !import.meta.client) return;
    themeObserver = new MutationObserver(() => {
      if (!terminalRef.value) return;
      terminalRef.value.options.theme = appTerminalTheme();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme-preset", "data-terminal-theme-preset", "style"]
    });
  };

  watch(
    () => hostAdapter.theme.codeFontSize(),
    (size) => {
      if (!terminalRef.value) return;
      terminalRef.value.options.fontSize = size;
      nextTick(() => fitToContainer());
    }
  );

  onMounted(() => {
    if (!containerRef.value) return;
    window.addEventListener("right-panel-resize-end", handleRightPanelResizeEnd);
    createTerminal();
    createWebSocket();
    listenSocketEvent();
    observeAppTheme();
    nextTick(() => {
      input.start();
      terminalRef.value?.open(containerRef.value!);
      fitToContainer();
    });
  });

  onUnmounted(() => {
    window.removeEventListener("right-panel-resize-end", handleRightPanelResizeEnd);
    stopContainerResizeObserver();
    themeObserver?.disconnect();
    input.stop();
    heartbeat.stop();
    if (warningInterval.value) clearInterval(warningInterval.value);
    const tabId = unref(sessionCtxRef)?.tabId;
    if (tabId) {
      unregisterKokoTerminalDataSender(tabId);
      unregisterKokoTerminalSession(tabId);
      unregisterKokoTerminalAiSession(tabId, socketRef.value);
      unregisterKokoLinuxMetricsSession(tabId, socketRef.value);
      hostAdapter.clearSessionDetails(tabId);
    }
    transport.close();
    sentryRef.value = null;
    try {
      terminalRef.value?.dispose();
    } catch (error) {
      if (!isXtermAddonDisposeError(error)) throw error;
      console.warn(error);
    }
    terminalRef.value = null;
    fitAddon = null;
    searchAddon.value = null;
    connectionStore.resetConnectionState();
  });

  return {
    searchAddon,
    commandSuggestions,
    connectionError,
    containerRef,
    contextMenuPosition,
    contextMenuVisible,
    canUseClipboard,
    copySelection: input.copySelection,
    pasteClipboard: input.pasteClipboard,
    selectionText,
    zmodem
  };
};
