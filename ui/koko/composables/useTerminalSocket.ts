import type { Sentry } from "nora-zmodemjs/src/zmodem_browser";

import type { OnlineUser, SettingConfig, ShareUserOptions } from "~/koko/types";
import { useDebounceFn, useWebSocket, useWindowSize } from "@vueuse/core";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebglAddon } from "@xterm/addon-webgl";

import { Terminal } from "@xterm/xterm";
import { readText, writeText } from "clipboard-polyfill";
import { useKokoTerminalEvents } from "~/koko/composables/useTerminalEvents";
import { useKokoZmodem } from "~/koko/composables/useZmodem";
import { connectorSessionKey, useKokoWsUrl } from "~/koko/composables/wsUrl";
import { useKokoConnectionStore } from "~/koko/stores/connection";
import { useKokoTerminalSettingsStore } from "~/koko/stores/terminalSettings";
import { MaxTimeout } from "~/koko/utils/config";
import { getDefaultTerminalConfig } from "~/koko/utils/guard";
import { terminalTheme } from "~/koko/utils/terminalTheme";
import { formatMessage, getXTerminalLineContent, preprocessInput, updateIcon, writeBufferToTerminal } from "~/koko/utils/terminalUtils";
import {
  FORMATTER_MESSAGE_TYPE,
  HOST_MESSAGE_TYPE,
  MESSAGE_TYPE,
  ZMODEM_ACTION_TYPE
} from "~/shared/connectors/types/message";

const isSocketClosing = (socket: WebSocket) =>
  socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED;

export const useKokoTerminalSocket = () => {
  let sentry: Sentry | null = null;

  const { t } = useI18n();
  const toast = useToast();
  const { createSentry } = useKokoZmodem();
  const { width, height } = useWindowSize();
  const { sendHostEvent, emitTerminalConnect, emitTerminalSession, sendMittEvent, sendToHost } = useKokoTerminalEvents();

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
  const socketRef = ref<WebSocket | null>(null);
  const featureSetting = ref<Partial<SettingConfig>>({});
  const pingInterval = ref<ReturnType<typeof setInterval> | null>(null);
  const warningInterval = ref<ReturnType<typeof setInterval> | null>(null);

  const connectionStore = useKokoConnectionStore();
  const defaultTerminalCfg = getDefaultTerminalConfig();
  const terminalSettingsStore = useKokoTerminalSettingsStore();
  const sessionCtxRef = inject(connectorSessionKey, null);
  const queryTerminalThemeName = computed(() => unref(sessionCtxRef)?.terminalThemeName || "");

  const fitAddon = new FitAddon();
  const webglAddon = new WebglAddon();
  const searchAddon = new SearchAddon();

  webglAddon.onContextLoss(() => webglAddon.dispose());

  const autoTerminalFit = watch([width, height], () => {
    if (!terminalRef.value) return;
    nextTick(() => fitAddon.fit());
  });

  const debouncedResize = useDebounceFn(({ cols, rows }: { cols: number, rows: number }) => {
    if (!socketRef.value) return;
    fitAddon.fit();
    socketRef.value.send(formatMessage(terminalId.value, FORMATTER_MESSAGE_TYPE.TERMINAL_RESIZE, JSON.stringify({ cols, rows })));
  }, 200);

  const debouncedSendHostKey = useDebounceFn((key: string) => {
    if (key === "ArrowRight") sendToHost(HOST_MESSAGE_TYPE.KEYEVENT, "alt+shift+right");
    if (key === "ArrowLeft") sendToHost(HOST_MESSAGE_TYPE.KEYEVENT, "alt+shift+left");
  }, 500);

  let lastMessage = "";

  const showInfoOnce = (content: string) => {
    if (lastMessage === content) return;
    toast.add({ title: content, color: "info" });
    lastMessage = content;
  };

  const dispatch = (socketData: string) => {
    if (!socketData || !socketRef.value || !terminalRef.value) return;

    const parsedMessageData = JSON.parse(socketData);

    switch (parsedMessageData.type) {
      case MESSAGE_TYPE.CLOSE: {
        connectionStore.updateConnectionState({ enableShare: false, onlineUsers: [] });
        socketRef.value.close();
        sendHostEvent(HOST_MESSAGE_TYPE.CLOSE, "");
        break;
      }
      case MESSAGE_TYPE.ERROR: {
        terminalRef.value.write(parsedMessageData.err);
        sendHostEvent(HOST_MESSAGE_TYPE.TERMINAL_ERROR, "");
        break;
      }
      case MESSAGE_TYPE.PING:
        break;
      case MESSAGE_TYPE.CONNECT: {
        terminalId.value = parsedMessageData.id;
        emitTerminalConnect(terminalId.value);
        connectionStore.setConnectionState({
          socket: socketRef.value,
          terminal: terminalRef.value,
          terminalId: parsedMessageData.id
        });

        const info = JSON.parse(parsedMessageData.data);
        featureSetting.value = info.setting;
        if (info.asset?.name) connectionStore.setConnectionState({ assetName: info.asset.name });
        updateIcon(info.setting);

        socketRef.value.send(
          formatMessage(
            terminalId.value,
            FORMATTER_MESSAGE_TYPE.TERMINAL_INIT,
            JSON.stringify({ cols: terminalRef.value.cols, rows: terminalRef.value.rows, code: connectionStore.shareCode })
          )
        );
        break;
      }
      case MESSAGE_TYPE.TERMINAL_ERROR:
        terminalRef.value.write(parsedMessageData.err);
        break;
      case MESSAGE_TYPE.MESSAGE_NOTIFY: {
        const eventName = JSON.parse(parsedMessageData.data).event_name;
        if (eventName === "sync_user_preference") {
          toast.add({ title: t("ThemeSyncSuccessful") || "Theme synced", color: "success" });
        }
        break;
      }
      case MESSAGE_TYPE.TERMINAL_SHARE: {
        const data = JSON.parse(parsedMessageData.data);
        shareId.value = data.share_id;
        shareCode.value = data.code;
        connectionStore.updateConnectionState({ shareId: data.share_id, shareCode: data.code });
        break;
      }
      case MESSAGE_TYPE.TERMINAL_ACTION: {
        const actionType = parsedMessageData.data;
        if (actionType === ZMODEM_ACTION_TYPE.ZMODEM_START) {
          zmodemTransferStatus.value = true;
        } else if (actionType === ZMODEM_ACTION_TYPE.ZMODEM_END) {
          terminalRef.value.write("\r\n");
        } else {
          zmodemTransferStatus.value = false;
        }
        break;
      }
      case MESSAGE_TYPE.TERMINAL_SESSION: {
        const sessionInfo = JSON.parse(parsedMessageData.data);
        emitTerminalSession(sessionInfo);
        const share = sessionInfo?.permission?.actions?.includes("share");

        if (sessionInfo.backspaceAsCtrlH) {
          terminalSettingsStore.setDefaultTerminalConfig("backspaceAsCtrlH", sessionInfo.backspaceAsCtrlH ? "1" : "0");
        }
        if (sessionInfo.ctrlCAsCtrlZ) {
          terminalSettingsStore.setDefaultTerminalConfig("ctrlCAsCtrlZ", sessionInfo.ctrlCAsCtrlZ ? "1" : "0");
        }

        const effectiveThemeName = queryTerminalThemeName.value || sessionInfo.themeName;
        if (effectiveThemeName) {
          nextTick(() => {
            terminalRef.value!.options.theme = terminalTheme(effectiveThemeName);
          });
        }

        if (featureSetting.value.SECURITY_SESSION_SHARE && share) {
          connectionStore.updateConnectionState({ enableShare: true });
        }

        sessionId.value = sessionInfo.session.id;
        connectionStore.updateConnectionState({ sessionId: sessionInfo.session.id });
        terminalSettingsStore.setDefaultTerminalConfig("theme", effectiveThemeName || sessionInfo.themeName);
        terminalSettingsStore.setDefaultTerminalConfig("themeName", effectiveThemeName || sessionInfo.themeName);
        break;
      }
      case MESSAGE_TYPE.TERMINAL_SHARE_JOIN: {
        const data = JSON.parse(parsedMessageData.data);
        onlineUsers.value.push(data);
        connectionStore.updateConnectionState({ onlineUsers: onlineUsers.value });
        sendHostEvent(HOST_MESSAGE_TYPE.SHARE_USER_ADD, JSON.stringify({ ...data, sessionId: sessionId.value }));
        if (!data.primary) toast.add({ title: `${data.user} ${t("JoinShare") || "joined share"}`, color: "info" });
        break;
      }
      case MESSAGE_TYPE.TERMINAL_PERM_VALID:
        clearInterval(warningInterval.value!);
        toast.add({ title: t("PermissionValid") || "Permission valid", color: "info" });
        break;
      case MESSAGE_TYPE.TERMINAL_SHARE_LEAVE: {
        const data: OnlineUser = JSON.parse(parsedMessageData.data);
        sendHostEvent(HOST_MESSAGE_TYPE.SHARE_USER_LEAVE, parsedMessageData.data);
        const index = onlineUsers.value.findIndex((item) => item.user_id === data.user_id && !item.primary);
        if (index !== -1) {
          onlineUsers.value.splice(index, 1);
          connectionStore.updateConnectionState({ onlineUsers: onlineUsers.value });
          toast.add({ title: `${data.user} ${t("LeaveShare") || "left share"}`, color: "info" });
        }
        break;
      }
      case MESSAGE_TYPE.TERMINAL_PERM_EXPIRED: {
        const data = JSON.parse(parsedMessageData.data);
        const warningMsg = `${t("PermissionExpired") || "Permission expired"}: ${data.detail}`;
        toast.add({ title: warningMsg, color: "warning" });
        if (warningInterval.value) clearInterval(warningInterval.value);
        warningInterval.value = setInterval(() => toast.add({ title: warningMsg, color: "warning" }), 60_000);
        break;
      }
      case MESSAGE_TYPE.TERMINAL_SESSION_PAUSE: {
        const data = JSON.parse(parsedMessageData.data);
        showInfoOnce(`${data.user} ${t("PauseSession") || "paused session"}`);
        break;
      }
      case MESSAGE_TYPE.TERMINAL_SESSION_RESUME: {
        const data = JSON.parse(parsedMessageData.data);
        showInfoOnce(`${data.user} ${t("ResumeSession") || "resumed session"}`);
        break;
      }
      case MESSAGE_TYPE.TERMINAL_GET_SHARE_USER:
        userOptions.value = JSON.parse(parsedMessageData.data);
        connectionStore.updateConnectionState({ userOptions: userOptions.value });
        break;
      case MESSAGE_TYPE.TERMINAL_SHARE_USER_REMOVE:
        toast.add({ title: t("RemoveShareUser") || "Removed from share", color: "info" });
        socketRef.value.close();
        break;
    }
  };

  const handleBinaryMessage = (socketMessage: MessageEvent) => {
    if (!terminalRef.value || !sentry) return;

    if (zmodemTransferStatus.value) {
      try {
        sentry.consume(socketMessage.data);
      } catch {
        if (sentry.get_confirmed_session()) {
          sentry.get_confirmed_session()?.abort();
          toast.add({ title: "File transfer interrupted", color: "error" });
        }
      }
    } else {
      writeBufferToTerminal(true, false, terminalRef.value, socketMessage.data);
    }
  };

  const listenSocketEvent = () => {
    if (!socketRef.value) return;

    sentry = createSentry(terminalRef.value!, socketRef.value!, lastSendTime);

    socketRef.value.onopen = () => {
      if (pingInterval.value) clearInterval(pingInterval.value);
      pingInterval.value = setInterval(() => {
        if (isSocketClosing(socketRef.value!)) return clearInterval(pingInterval.value!);
        const currentDate = new Date();
        if (lastReceiveTime.value.getTime() - currentDate.getTime() > MaxTimeout) {
          console.error("More than 30 seconds do not receive data");
        }
        const pingTimeout = currentDate.getTime() - lastSendTime.value.getTime() - MaxTimeout;
        if (pingTimeout < 0) return;
        socketRef.value!.send(formatMessage("", FORMATTER_MESSAGE_TYPE.PING, ""));
      }, 25_000);
    };

    socketRef.value.onclose = () => {
      if (!terminalRef.value) return;
      terminalRef.value.write("\r\n");
      terminalRef.value.write(`\x1B[31m${t("WebSocketClosed") || "WebSocket closed"}\x1B[0m`);
    };

    socketRef.value.onmessage = async (message: MessageEvent) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
      lastReceiveTime.value = new Date();
      if (typeof message.data === "object") handleBinaryMessage(message);
      else dispatch(message.data);
    };
  };

  const listenElEvent = () => {
    if (!terminalRef.value || !containerRef.value) return;

    containerRef.value.addEventListener("click", () => sendHostEvent(HOST_MESSAGE_TYPE.CLICK, ""));
    containerRef.value.addEventListener("mouseenter", () => {
      fitAddon.fit();
      terminalRef.value!.focus();
    });
    containerRef.value.addEventListener("contextmenu", async (e: MouseEvent) => {
      if (e.ctrlKey || terminalSettingsStore.quickPaste !== "1") return;
      e.preventDefault();

      let text = "";
      try {
        text = await readText();
      } catch {
        text = selectionText.value;
      }
      if (!text || isSocketClosing(socketRef.value!)) {
        if (isSocketClosing(socketRef.value!)) {
          toast.add({ title: t("WebSocket connection is closed, please refresh the page") || "Connection closed", color: "error" });
        }
        return;
      }
      socketRef.value!.send(formatMessage(terminalId.value, FORMATTER_MESSAGE_TYPE.TERMINAL_DATA, text));
    });
    containerRef.value.addEventListener("mouseleave", () => {
      terminalRef.value?.blur();
      sendHostEvent(HOST_MESSAGE_TYPE.TERMINAL_CONTENT_RESPONSE, {
        content: getXTerminalLineContent(10, terminalRef.value!),
        sessionId: sessionId.value,
        terminalId: terminalId.value
      });
    });
    containerRef.value.addEventListener("keydown", (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        sendMittEvent("open-search");
        e.preventDefault();
      }
    });
  };

  const listenTerminalRefEvent = () => {
    if (!terminalRef.value || !socketRef.value) return;

    terminalRef.value.onData((data: string) => {
      lastSendTime.value = new Date();
      if (isSocketClosing(socketRef.value!)) return;
      const processedData = preprocessInput(data, terminalSettingsStore.getConfig);
      socketRef.value!.send(formatMessage("", FORMATTER_MESSAGE_TYPE.TERMINAL_DATA, processedData));
      sendToHost(HOST_MESSAGE_TYPE.INPUT_ACTIVE, "");
    });
    terminalRef.value.onResize(({ cols, rows }) => debouncedResize({ cols, rows }));
    terminalRef.value.onSelectionChange(async () => {
      selectionText.value = terminalRef.value!.getSelection() || "";
      if (selectionText.value) await writeText(selectionText.value);
    });
    terminalRef.value.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        debouncedSendHostKey(e.key);
        return false;
      }
      if (e.ctrlKey && e.key === "c" && terminalRef.value?.hasSelection()) return false;
      return !(e.ctrlKey && e.key === "v");
    });
  };

  const createTerminal = () => {
    terminalRef.value = new Terminal({
      fontSize: defaultTerminalCfg.fontSize,
      fontFamily: defaultTerminalCfg.fontFamily,
      lineHeight: defaultTerminalCfg.lineHeight,
      cursorBlink: true,
      cursorStyle: "block",
      rightClickSelectsWord: true,
      scrollback: 5000,
      scrollOnUserInput: true,
      theme: terminalTheme(defaultTerminalCfg.themeName),
      allowProposedApi: true,
      customGlyphs: true
    });
    terminalRef.value.loadAddon(fitAddon);
    terminalRef.value.loadAddon(webglAddon);
    terminalRef.value.loadAddon(searchAddon);
  };

  const createWebSocket = () => {
    const url = useKokoWsUrl("terminal");
    const { ws } = useWebSocket(url, {
      protocols: ["JMS-KOKO"],
      autoReconnect: { retries: 5, delay: 3000 }
    });
    if (!ws.value) {
      toast.add({ title: t("FailedCreateConnection") || "Failed to create connection", color: "error" });
      return;
    }
    ws.value.binaryType = "arraybuffer";
    socketRef.value = ws.value;
  };

  onMounted(() => {
    if (!containerRef.value) return;
    createTerminal();
    createWebSocket();
    nextTick(() => {
      listenSocketEvent();
      listenTerminalRefEvent();
      listenElEvent();
      terminalRef.value?.open(containerRef.value!);
      fitAddon.fit();
    });
  });

  onUnmounted(() => {
    autoTerminalFit();
    if (pingInterval.value) clearInterval(pingInterval.value);
    if (warningInterval.value) clearInterval(warningInterval.value);
    socketRef.value?.close();
    terminalRef.value?.dispose();
    connectionStore.resetConnectionState();
  });

  return { searchAddon, containerRef };
};
