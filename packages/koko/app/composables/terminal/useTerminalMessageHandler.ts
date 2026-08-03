import type { useKokoHostAdapter } from "@jumpserver/koko/host";
import type { Terminal } from "@xterm/xterm";
import type { ComputedRef, Ref } from "vue";
import type { useKokoConnectionStore } from "#koko/stores/connection";
import type { useKokoTerminalSettingsStore } from "#koko/stores/terminalSettings";
import type { OnlineUser, SettingConfig, ShareUserOptions } from "#koko/types";
import type { TerminalIncomingMessage } from "./protocol";
import {
  FORMATTER_MESSAGE_TYPE,
  HOST_MESSAGE_TYPE,
  MESSAGE_TYPE,
  ZMODEM_ACTION_TYPE
} from "@jumpserver/connectors-core";
import { terminalTheme } from "../../utils/terminalTheme";
import { formatMessage, updateIcon } from "../../utils/terminalUtils";
import { parseTerminalIncomingMessage } from "./protocol";

export type TerminalMessageHandlers = Partial<Record<MESSAGE_TYPE, (message: TerminalIncomingMessage) => void>>;

export function useKokoTerminalMessageHandler(handlers: TerminalMessageHandlers) {
  function handleRawMessage(raw: string) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const message = parseTerminalIncomingMessage(parsed);
    if (!message) return;
    handlers[message.type]?.(message);
  }

  return { handleRawMessage };
}

export function createKokoTerminalMessageHandlers(options: {
  socketRef: Ref<WebSocket | null>;
  terminalRef: Ref<Terminal | null>;
  featureSetting: Ref<Partial<SettingConfig>>;
  onlineUsers: Ref<OnlineUser[]>;
  userOptions: Ref<ShareUserOptions[]>;
  shareId: Ref<string>;
  shareCode: Ref<string>;
  sessionId: Ref<string>;
  terminalId: Ref<string>;
  zmodemTransferStatus: Ref<boolean>;
  warningInterval: Ref<ReturnType<typeof setInterval> | null>;
  queryTerminalThemeName: ComputedRef<string>;
  followAppTheme: ComputedRef<boolean>;
  sessionCtxRef: Ref<{
    tabId?: string;
    terminalThemeName?: string;
  } | null>;
  t: ReturnType<typeof useI18n>["t"];
  toast: ReturnType<typeof useToast>;
  connectionStore: ReturnType<typeof useKokoConnectionStore>;
  terminalSettingsStore: ReturnType<typeof useKokoTerminalSettingsStore>;
  hostAdapter: ReturnType<typeof useKokoHostAdapter>;
  hostBridge: {
    once: (event: HOST_MESSAGE_TYPE, handler: (message: Record<string, unknown>) => void) => void;
    sendHost: (event: HOST_MESSAGE_TYPE, data: unknown) => void;
  };
  sendHostEvent: (event: HOST_MESSAGE_TYPE, data: unknown) => void;
  emitTerminalConnect: (id: string) => void;
  emitTerminalSession: (payload: unknown) => void;
  showInfoOnce: (content: string) => void;
  onConnected: (terminalId: string, socket: WebSocket, terminal: Terminal) => void;
}) {
  const parseJson = <T>(value: string | undefined, fallback: T) => {
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  };

  const requestFileToken = () =>
    new Promise<string>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error(options.t("koko.fileManagement.tokenRequestTimedOut")));
      }, 15_000);

      options.hostBridge.once(HOST_MESSAGE_TYPE.GET_FILE_CONNECT_TOKEN, (message) => {
        window.clearTimeout(timeout);
        if (typeof message.token === "string" && message.token) resolve(message.token);
        else reject(new Error(options.t("koko.fileManagement.unavailableInSession")));
      });

      options.hostBridge.sendHost(HOST_MESSAGE_TYPE.CREATE_FILE_CONNECT_TOKEN, "");
    });

  return {
    [MESSAGE_TYPE.CLOSE]: () => {
      options.connectionStore.updateConnectionState({ enableShare: false, onlineUsers: [] });
      options.socketRef.value?.close();
      options.sendHostEvent(HOST_MESSAGE_TYPE.CLOSE, "");
    },
    [MESSAGE_TYPE.ERROR]: (message) => {
      options.terminalRef.value?.write(message.err || "");
      options.sendHostEvent(HOST_MESSAGE_TYPE.TERMINAL_ERROR, "");
    },
    [MESSAGE_TYPE.PING]: () => {},
    [MESSAGE_TYPE.CONNECT]: (message) => {
      const socket = options.socketRef.value;
      const terminal = options.terminalRef.value;
      if (!socket || !terminal) return;

      options.terminalId.value = message.id;
      options.emitTerminalConnect(options.terminalId.value);
      options.connectionStore.setConnectionState({
        socket,
        terminal,
        terminalId: message.id
      });
      options.onConnected(message.id, socket, terminal);

      const info = parseJson<{ setting: Partial<SettingConfig>; asset?: { name?: string } }>(message.data, {
        setting: {}
      });
      options.featureSetting.value = info.setting;
      if (info.asset?.name) options.connectionStore.setConnectionState({ assetName: info.asset.name });
      updateIcon(info.setting);

      socket.send(
        formatMessage(
          options.terminalId.value,
          FORMATTER_MESSAGE_TYPE.TERMINAL_INIT,
          JSON.stringify({
            cols: terminal.cols,
            rows: terminal.rows,
            code: options.connectionStore.shareCode
          })
        )
      );
    },
    [MESSAGE_TYPE.TERMINAL_ERROR]: (message) => {
      options.terminalRef.value?.write(message.err || "");
    },
    [MESSAGE_TYPE.MESSAGE_NOTIFY]: (message) => {
      const payload = parseJson<{ event_name?: string }>(message.data, {});
      if (payload.event_name === "sync_user_preference") {
        options.toast.add({ title: options.t("koko.terminal.themeSynced"), color: "success" });
      }
    },
    [MESSAGE_TYPE.TERMINAL_SHARE]: (message) => {
      const payload = parseJson<{ share_id: string; code: string }>(message.data, { share_id: "", code: "" });
      options.shareId.value = payload.share_id;
      options.shareCode.value = payload.code;
      options.connectionStore.updateConnectionState({ shareId: payload.share_id, shareCode: payload.code });
    },
    [MESSAGE_TYPE.TERMINAL_ACTION]: (message) => {
      if (message.data === ZMODEM_ACTION_TYPE.ZMODEM_START) {
        options.zmodemTransferStatus.value = true;
      } else if (message.data === ZMODEM_ACTION_TYPE.ZMODEM_END) {
        options.terminalRef.value?.write("\r\n");
      } else {
        options.zmodemTransferStatus.value = false;
      }
    },
    [MESSAGE_TYPE.TERMINAL_SESSION]: (message) => {
      const sessionInfo = parseJson<{
        session: { id: string; asset?: string; ip?: string; user?: string };
        permission?: { actions?: string[] };
        backspaceAsCtrlH?: boolean;
        ctrlCAsCtrlZ?: boolean;
        themeName?: string;
      }>(message.data, { session: { id: "" } });
      options.emitTerminalSession(sessionInfo);

      const tabId = options.sessionCtxRef.value?.tabId;
      if (tabId) {
        options.hostAdapter.setSessionDetails(tabId, {
          sessionId: sessionInfo.session.id,
          asset: sessionInfo.session.asset,
          address: sessionInfo.session.ip,
          account: sessionInfo.session.user,
          shareAllowed: sessionInfo.permission?.actions?.includes("share"),
          requestFileToken
        });
      }

      if (sessionInfo.backspaceAsCtrlH) {
        options.terminalSettingsStore.setDefaultTerminalConfig(
          "backspaceAsCtrlH",
          sessionInfo.backspaceAsCtrlH ? "1" : "0"
        );
      }
      if (sessionInfo.ctrlCAsCtrlZ) {
        options.terminalSettingsStore.setDefaultTerminalConfig("ctrlCAsCtrlZ", sessionInfo.ctrlCAsCtrlZ ? "1" : "0");
      }

      const effectiveThemeName = options.queryTerminalThemeName.value || sessionInfo.themeName;
      if (effectiveThemeName && !options.followAppTheme.value) {
        nextTick(() => {
          if (options.terminalRef.value) options.terminalRef.value.options.theme = terminalTheme(effectiveThemeName);
        });
      }

      if (options.featureSetting.value.SECURITY_SESSION_SHARE && sessionInfo.permission?.actions?.includes("share")) {
        options.connectionStore.updateConnectionState({ enableShare: true });
      }

      options.sessionId.value = sessionInfo.session.id;
      options.connectionStore.updateConnectionState({ sessionId: sessionInfo.session.id });
      options.terminalSettingsStore.setDefaultTerminalConfig("theme", effectiveThemeName || sessionInfo.themeName);
      options.terminalSettingsStore.setDefaultTerminalConfig("themeName", effectiveThemeName || sessionInfo.themeName);
    },
    [MESSAGE_TYPE.TERMINAL_SHARE_JOIN]: (message) => {
      const payload = parseJson<OnlineUser>(message.data, {} as OnlineUser);
      options.onlineUsers.value.push(payload);
      options.connectionStore.updateConnectionState({ onlineUsers: options.onlineUsers.value });
      options.sendHostEvent(
        HOST_MESSAGE_TYPE.SHARE_USER_ADD,
        JSON.stringify({ ...payload, sessionId: options.sessionId.value })
      );
      if (!payload.primary) {
        options.toast.add({ title: `${payload.user} ${options.t("koko.terminal.joinedShare")}`, color: "info" });
      }
    },
    [MESSAGE_TYPE.TERMINAL_PERM_VALID]: () => {
      if (options.warningInterval.value) clearInterval(options.warningInterval.value);
      options.toast.add({ title: options.t("koko.terminal.permissionValid"), color: "info" });
    },
    [MESSAGE_TYPE.TERMINAL_SHARE_LEAVE]: (message) => {
      const payload = parseJson<OnlineUser>(message.data, {} as OnlineUser);
      options.sendHostEvent(HOST_MESSAGE_TYPE.SHARE_USER_LEAVE, message.data || "");
      const index = options.onlineUsers.value.findIndex((item) => item.user_id === payload.user_id && !item.primary);
      if (index !== -1) {
        options.onlineUsers.value.splice(index, 1);
        options.connectionStore.updateConnectionState({ onlineUsers: options.onlineUsers.value });
        options.toast.add({ title: `${payload.user} ${options.t("koko.terminal.leftShare")}`, color: "info" });
      }
    },
    [MESSAGE_TYPE.TERMINAL_PERM_EXPIRED]: (message) => {
      const payload = parseJson<{ detail?: string }>(message.data, {});
      const warningMsg = `${options.t("koko.terminal.permissionExpired")}: ${payload.detail || ""}`;
      options.toast.add({ title: warningMsg, color: "warning" });
      if (options.warningInterval.value) clearInterval(options.warningInterval.value);
      options.warningInterval.value = setInterval(() => {
        options.toast.add({ title: warningMsg, color: "warning" });
      }, 60_000);
    },
    [MESSAGE_TYPE.TERMINAL_SESSION_PAUSE]: (message) => {
      const payload = parseJson<{ user?: string }>(message.data, {});
      options.showInfoOnce(`${payload.user} ${options.t("koko.terminal.pausedSession")}`);
    },
    [MESSAGE_TYPE.TERMINAL_SESSION_RESUME]: (message) => {
      const payload = parseJson<{ user?: string }>(message.data, {});
      options.showInfoOnce(`${payload.user} ${options.t("koko.terminal.resumedSession")}`);
    },
    [MESSAGE_TYPE.TERMINAL_GET_SHARE_USER]: (message) => {
      options.userOptions.value = parseJson<ShareUserOptions[]>(message.data, []);
      options.connectionStore.updateConnectionState({ userOptions: options.userOptions.value });
    },
    [MESSAGE_TYPE.TERMINAL_SHARE_USER_REMOVE]: () => {
      options.toast.add({ title: options.t("koko.terminal.removedFromShare"), color: "info" });
      options.socketRef.value?.close();
    }
  } satisfies TerminalMessageHandlers;
}
