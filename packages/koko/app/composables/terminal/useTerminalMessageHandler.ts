import type { HostBridge } from "@jumpserver/connectors-core";
import type { useKokoHostAdapter } from "@jumpserver/koko/host";
import type { Terminal } from "@xterm/xterm";
import type { ComputedRef, Ref } from "vue";
import type { useKokoConnectionStore } from "#koko/stores/connection";
import type { useKokoTerminalSettingsStore } from "#koko/stores/terminalSettings";
import type { ClipboardPermission, ClipboardPolicy } from "#koko/types/clipboard";
import type { OnlineUser, SettingConfig, ShareUserOptions, TerminalSessionInfo } from "#koko/types/session";
import type { TerminalCommandEnvelope } from "./envelope";
import type { TerminalIncomingMessage } from "./protocol";
import type { TerminalAiChatMessage } from "./useTerminalAiSessions";
import { HOST_MESSAGE_TYPE, MESSAGE_TYPE, ZMODEM_ACTION_TYPE } from "@jumpserver/connectors-core";
import { terminalTheme } from "../../utils/terminalTheme";
import { updateIcon } from "../../utils/terminalUtils";
import {
  buildJSONEnvelope,
  createRequestId,
  ENVELOPE_CHAT,
  ENVELOPE_ERROR,
  ENVELOPE_TERMINAL_CLOSE,
  ENVELOPE_TERMINAL_COMMAND,
  ENVELOPE_TERMINAL_CREATE,
  ENVELOPE_TERMINAL_OUTPUT,
  parseEnvelope,
  parseJSONPayload,
  parseTerminalPayload
} from "./envelope";
import { parseTerminalIncomingMessage } from "./protocol";

export type TerminalMessageHandlers = Partial<Record<string, (message: TerminalIncomingMessage) => void>>;

export function useKokoTerminalMessageHandler(
  handlers: TerminalMessageHandlers,
  options?: {
    onTerminalOutput: (terminalId: number, data: Uint8Array) => void;
    onChat: (message: TerminalAiChatMessage) => void;
  }
) {
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

  function dispatch(raw: unknown) {
    const message = parseTerminalIncomingMessage(raw);
    if (message) handlers[message.type]?.(message);
  }

  function handleEnvelopeMessage(raw: ArrayBuffer | Uint8Array) {
    const frame = parseEnvelope(raw);
    switch (frame.type) {
      case ENVELOPE_TERMINAL_OUTPUT: {
        const payload = parseTerminalPayload(frame.payload);
        options?.onTerminalOutput(payload.terminalId, payload.data);
        break;
      }
      case ENVELOPE_TERMINAL_COMMAND: {
        const command = parseJSONPayload<TerminalCommandEnvelope>(frame.payload);
        const params = command.params || {};
        dispatch({
          ...params,
          type: command.command,
          terminalId: command.terminalId || Number(params.terminalId) || 0,
          requestId: command.requestId || ""
        });
        break;
      }
      case ENVELOPE_ERROR: {
        const error = parseJSONPayload<Record<string, unknown>>(frame.payload);
        dispatch({
          id: "",
          type: MESSAGE_TYPE.ERROR,
          err: String(error.message || "Terminal error"),
          terminalId: Number(error.terminalId) || 0,
          requestId: String(error.requestId || "")
        });
        break;
      }
      case ENVELOPE_TERMINAL_CLOSE: {
        const closed = parseJSONPayload<Record<string, unknown>>(frame.payload);
        dispatch({
          id: "",
          type: MESSAGE_TYPE.CLOSE,
          data: String(closed.reason || ""),
          terminalId: Number(closed.terminalId) || 0,
          requestId: String(closed.requestId || "")
        });
        break;
      }
      case ENVELOPE_CHAT:
        options?.onChat(parseJSONPayload<TerminalAiChatMessage>(frame.payload));
        break;
      default:
        throw new Error(`Unsupported terminal envelope type: ${frame.type}`);
    }
  }

  return { handleRawMessage, handleEnvelopeMessage };
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
  warningInterval: Ref<ReturnType<typeof setInterval> | null>;
  queryTerminalThemeName: ComputedRef<string>;
  followAppTheme: ComputedRef<boolean>;
  sessionCtxRef: Ref<{
    tabId?: string;
    tokenId?: string;
    terminalThemeName?: string;
  } | null>;
  t: ReturnType<typeof useI18n>["t"];
  toast: ReturnType<typeof useToast>;
  connectionStore: ReturnType<typeof useKokoConnectionStore>;
  terminalSettingsStore: ReturnType<typeof useKokoTerminalSettingsStore>;
  hostAdapter: ReturnType<typeof useKokoHostAdapter>;
  hostBridge: HostBridge;
  sendHostEvent: (event: HOST_MESSAGE_TYPE, data: unknown) => void;
  emitTerminalConnect: (id: string) => void;
  emitTerminalSession: (payload: TerminalSessionInfo) => void;
  setClipboardAccess: (permission?: ClipboardPermission | null, policy?: ClipboardPolicy | null) => void;
  showInfoOnce: (content: string) => void;
  onConnected: (terminalId: string, socket: WebSocket, terminal: Terminal) => void;
  onZmodemEnd: () => void;
  onZmodemAbort: () => void;
}) {
  const parseJson = <T>(value: string | undefined, fallback: T) => {
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  };

  // Prefer exchanging the current SSH connection token (native clients embedding).
  // Fall back to the Luna host-bridge postMessage path when the host adapter has no exchange API.
  const requestFileToken = async () => {
    const sessionTokenId = String(options.sessionCtxRef.value?.tokenId || "").trim();
    if (sessionTokenId && typeof options.hostAdapter.sftp?.exchangeConnectToken === "function") {
      const exchanged = await options.hostAdapter.sftp.exchangeConnectToken(sessionTokenId);
      const tokenId = String(exchanged?.id || "").trim();
      if (!tokenId) throw new Error(options.t("koko.fileManagement.unavailableInSession"));
      return tokenId;
    }

    return await new Promise<string>((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => {
        reject(new Error(options.t("koko.fileManagement.tokenRequestTimedOut")));
      }, 15_000);

      options.hostBridge.once(HOST_MESSAGE_TYPE.GET_FILE_CONNECT_TOKEN, (message) => {
        globalThis.clearTimeout(timeout);
        if (typeof message.token === "string" && message.token) resolve(message.token);
        else reject(new Error(options.t("koko.fileManagement.unavailableInSession")));
      });

      options.hostBridge.sendHost(HOST_MESSAGE_TYPE.CREATE_FILE_CONNECT_TOKEN, "");
    });
  };

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

      const info = parseJson<{
        setting: Partial<SettingConfig>;
        asset?: { name?: string };
        permission?: ClipboardPermission | null;
        clipboard_policy?: ClipboardPolicy | null;
      }>(message.data, { setting: {} });
      options.featureSetting.value = info.setting;
      options.setClipboardAccess(info.permission, info.clipboard_policy);
      if (info.asset?.name) options.connectionStore.setConnectionState({ assetName: info.asset.name });
      updateIcon(info.setting);

      socket.send(
        buildJSONEnvelope(ENVELOPE_TERMINAL_CREATE, {
          requestId: createRequestId("primary"),
          params: {
            type: "primary",
            cols: terminal.cols,
            rows: terminal.rows,
            code: options.connectionStore.shareCode
          }
        })
      );
    },
    created: (message) => {
      const socket = options.socketRef.value;
      const terminal = options.terminalRef.value;
      const terminalId = String(message.terminalId || "");
      if (!socket || !terminal || !terminalId) return;

      options.terminalId.value = terminalId;
      options.emitTerminalConnect(terminalId);
      options.connectionStore.setConnectionState({ socket, terminal, terminalId });
      options.onConnected(terminalId, socket, terminal);
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
      if (message.data === ZMODEM_ACTION_TYPE.ZMODEM_END) {
        options.onZmodemEnd();
      } else if (message.data === ZMODEM_ACTION_TYPE.ZMODEM_ABORT) {
        options.onZmodemAbort();
      }
    },
    [MESSAGE_TYPE.TERMINAL_SESSION]: (message) => {
      const sessionInfo = parseJson<{
        session: { id: string; asset?: string; ip?: string; user?: string };
        permission?: ClipboardPermission | null;
        clipboard_policy?: ClipboardPolicy | null;
        backspaceAsCtrlH?: boolean;
        ctrlCAsCtrlZ?: boolean;
        themeName?: string;
      }>(message.data, { session: { id: "" } });
      options.emitTerminalSession(sessionInfo as TerminalSessionInfo);
      options.setClipboardAccess(sessionInfo.permission, sessionInfo.clipboard_policy);

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
      options.terminalSettingsStore.setDefaultTerminalConfig(
        "theme",
        effectiveThemeName || sessionInfo.themeName || ""
      );
      options.terminalSettingsStore.setDefaultTerminalConfig(
        "themeName",
        effectiveThemeName || sessionInfo.themeName || ""
      );
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
