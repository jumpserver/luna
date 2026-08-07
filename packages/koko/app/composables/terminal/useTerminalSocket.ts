import type { OnlineUser, SettingConfig, ShareUserOptions } from "#koko/types";
import type { KokoZmodemSentry } from "./zmodemTypes";
import { connectorSessionKey, FORMATTER_MESSAGE_TYPE, HOST_MESSAGE_TYPE } from "@jumpserver/connectors-core";
import { useKokoHostAdapter } from "@jumpserver/koko/host";
import { useDebounceFn, useResizeObserver, useWindowSize } from "@vueuse/core";
import { FitAddon } from "@xterm/addon-fit";

import { SearchAddon } from "@xterm/addon-search";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import {
  handleKokoTerminalAiMessage,
  isKokoTerminalAiInputLocked,
  registerKokoTerminalAiSession,
  unregisterKokoTerminalAiSession
} from "#koko/composables/terminal/useTerminalAiSessions";
import { useKokoTerminalBinaryHandler } from "#koko/composables/terminal/useTerminalBinaryHandler";
import { useKokoTerminalEvents } from "#koko/composables/terminal/useTerminalEvents";
import { useKokoTerminalHeartbeat } from "#koko/composables/terminal/useTerminalHeartbeat";
import { useKokoTerminalInput } from "#koko/composables/terminal/useTerminalInput";
import {
  createKokoTerminalMessageHandlers,
  useKokoTerminalMessageHandler
} from "#koko/composables/terminal/useTerminalMessageHandler";
import { useKokoTerminalTransport } from "#koko/composables/terminal/useTerminalTransport";
import { useKokoZmodem } from "#koko/composables/terminal/useZmodem";
import {
  registerKokoTerminalSession,
  unregisterKokoTerminalSession
} from "#koko/composables/useTerminalSessionRegistry";
import { useKokoWsUrl } from "#koko/composables/wsUrl";
import { useKokoConnectionStore } from "#koko/stores/connection";
import { useKokoTerminalSettingsStore } from "#koko/stores/terminalSettings";
import { getDefaultTerminalConfig } from "#koko/utils/guard";
import { appTerminalTheme, terminalTheme } from "#koko/utils/terminalTheme";
import { formatMessage } from "#koko/utils/terminalUtils";

const isSocketClosing = (socket: WebSocket) =>
  socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED;

const isXtermAddonDisposeError = (error: unknown) =>
  error instanceof Error && error.message.includes("Could not dispose an addon that has not been loaded");

export const useKokoTerminalSocket = () => {
  const toast = useToast();
  const zmodem = useKokoZmodem();
  const transport = useKokoTerminalTransport();

  const { t } = useI18n();
  const { addErrorToast } = useErrorToast();
  const { createSentry } = zmodem;
  const { width, height } = useWindowSize();
  const { sendHostEvent, emitTerminalConnect, emitTerminalSession, hostBridge, sendMittEvent, sendToHost } =
    useKokoTerminalEvents();

  const containerRef = shallowRef<HTMLElement>();
  const shareId = ref("");
  const shareCode = ref("");
  const sessionId = ref("");
  const terminalId = ref("");
  const selectionText = ref("");
  const zmodemTransferStatus = ref(true);
  const lastSendTime = ref(new Date());
  const lastReceiveTime = ref(new Date());
  const onlineUsers = ref<OnlineUser[]>([]);
  const userOptions = ref<ShareUserOptions[]>([]);
  const terminalRef = ref<Terminal | null>(null);
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
    zmodemTransferStatus,
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

  const { stop: stopContainerResizeObserver } = useResizeObserver(containerRef, () => {
    nextTick(fitToContainer);
  });

  const autoTerminalFit = watch([width, height], () => {
    if (!terminalRef.value) return;
    nextTick(fitToContainer);
  });

  const debouncedResize = useDebounceFn(({ cols, rows }: { cols: number; rows: number }) => {
    if (!socketRef.value) return;
    fitAddon?.fit();
    socketRef.value.send(
      formatMessage(terminalId.value, FORMATTER_MESSAGE_TYPE.TERMINAL_RESIZE, JSON.stringify({ cols, rows }))
    );
  }, 200);

  const debouncedSendHostKey = useDebounceFn((key: string) => {
    if (key === "ArrowRight") sendToHost(HOST_MESSAGE_TYPE.KEYEVENT, "alt+shift+right");
    if (key === "ArrowLeft") sendToHost(HOST_MESSAGE_TYPE.KEYEVENT, "alt+shift+left");
  }, 500);

  const input = useKokoTerminalInput({
    container: containerRef,
    terminal: terminalRef,
    socket: socketRef,
    terminalId,
    sessionId,
    selectionText,
    lastSendTime,
    fit: () => fitAddon?.fit(),
    isSocketClosing,
    quickPaste: () => terminalSettingsStore.quickPaste || "0",
    getTerminalConfig: () => terminalSettingsStore.getConfig,
    onResize: debouncedResize,
    onHostKey: debouncedSendHostKey,
    inputLocked: () => {
      const paneId = unref(sessionCtxRef)?.tabId || "";
      return Boolean(paneId && isKokoTerminalAiInputLocked(paneId));
    },
    addErrorToast,
    translate: t,
    sendHostEvent,
    sendToHost,
    sendMittEvent
  });

  let lastMessage = "";

  const showInfoOnce = (content: string) => {
    if (lastMessage === content) return;
    toast.add({ title: content, color: "info" });
    lastMessage = content;
  };

  const terminalMessageHandlers = createKokoTerminalMessageHandlers({
    socketRef,
    terminalRef,
    featureSetting,
    onlineUsers,
    userOptions,
    shareId,
    shareCode,
    sessionId,
    terminalId,
    zmodemTransferStatus,
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
    showInfoOnce,
    onConnected: (id, socket) => {
      const tabId = unref(sessionCtxRef)?.tabId;
      if (tabId) {
        registerKokoTerminalSession(tabId, { socket, terminalId: id });
        registerKokoTerminalAiSession(tabId, socket, id);
      }
    }
  });
  const messageHandler = useKokoTerminalMessageHandler(terminalMessageHandlers, {
    onTerminalOutput: (messageTerminalId, data) => {
      if (messageTerminalId === Number(terminalId.value)) {
        binaryHandler.handleBinaryMessage(data);
      }
    },
    onChat: (message) => {
      const tabId = unref(sessionCtxRef)?.tabId;
      if (tabId) handleKokoTerminalAiMessage(tabId, message);
    }
  });

  const listenSocketEvent = () => {
    if (!socketRef.value) return;

    const paneId = unref(sessionCtxRef)?.tabId;
    if (paneId) registerKokoTerminalAiSession(paneId, socketRef.value, "");

    sentryRef.value = createSentry(terminalRef.value!, socketRef.value!, terminalId, lastSendTime, () => {
      const paneId = unref(sessionCtxRef)?.tabId || "";
      return !paneId || !isKokoTerminalAiInputLocked(paneId);
    });

    socketRef.value.onopen = () => {
      socketOpened = true;
      connectionError.value = "";
      heartbeat.start();
    };

    socketRef.value.onerror = reportInitialConnectionFailure;

    socketRef.value.onclose = () => {
      heartbeat.stop();
      if (!socketOpened) {
        reportInitialConnectionFailure();
        return;
      }
      if (!terminalRef.value) return;
      terminalRef.value.write("\r\n");
      terminalRef.value.write(`\x1B[31m${t("koko.terminal.websocketClosed")}\x1B[0m`);
    };

    socketRef.value.onmessage = async (message: MessageEvent) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
      lastReceiveTime.value = new Date();
      try {
        if (message.data instanceof ArrayBuffer) messageHandler.handleEnvelopeMessage(message.data);
        else if (typeof message.data === "string") messageHandler.handleRawMessage(message.data);
      } catch (error) {
        addErrorToast({
          title: error instanceof Error ? error.message : t("koko.terminal.invalidMessage")
        });
      }
    };
  };

  const createTerminal = () => {
    const terminal = new Terminal({
      fontSize: defaultTerminalCfg.fontSize,
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

    terminalRef.value = terminal;
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
      attributeFilter: ["class", "data-theme-preset", "style"]
    });
  };

  onMounted(() => {
    if (!containerRef.value) return;
    createTerminal();
    createWebSocket();
    observeAppTheme();
    nextTick(() => {
      listenSocketEvent();
      input.start();
      terminalRef.value?.open(containerRef.value!);
      fitToContainer();
    });
  });

  onUnmounted(() => {
    autoTerminalFit();
    stopContainerResizeObserver();
    themeObserver?.disconnect();
    input.stop();
    heartbeat.stop();
    if (warningInterval.value) clearInterval(warningInterval.value);
    const tabId = unref(sessionCtxRef)?.tabId;
    if (tabId) {
      unregisterKokoTerminalSession(tabId);
      unregisterKokoTerminalAiSession(tabId, socketRef.value);
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

  return { searchAddon, connectionError, containerRef, zmodem };
};
