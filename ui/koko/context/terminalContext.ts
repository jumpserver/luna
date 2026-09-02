import type { HostBridge } from "@jumpserver/connectors-core";

import type { InjectionKey } from "vue";
import type { TerminalMittEvent } from "#koko/composables/terminal/protocol";

import type { ClipboardDirection, ClipboardPermission, ClipboardPolicy } from "#koko/types/clipboard";
import type { TerminalSessionInfo } from "#koko/types/session";
import {
  connectorSessionKey,
  createHostBridge,
  FORMATTER_MESSAGE_TYPE,
  HOST_MESSAGE_TYPE
} from "@jumpserver/connectors-core";
import mitt from "mitt";
import { inject, nextTick, shallowRef } from "vue";
import { TerminalEventType } from "#koko/composables/terminal/protocol";
import { isKokoTerminalAiInputLocked } from "#koko/composables/terminal/useTerminalAiSessions";
import { hasKokoTerminalDataSender, sendKokoTerminalData } from "#koko/composables/useTerminalSessionRegistry";
import { useKokoConnectionStore } from "#koko/stores/connection";
import {
  createUnrestrictedClipboardAccess,
  resolveClipboardAccess,
  validateClipboardText as validateClipboardAccess
} from "#koko/utils/clipboardAcl";
import mittBus, { KokoMittEvent } from "#koko/utils/mittBus";
import { applyXtermTheme, terminalTheme } from "#koko/utils/terminalTheme";
import { formatMessage, getXTerminalLineContent } from "#koko/utils/terminalUtils";

type TerminalEvents = Record<string, unknown> & {
  [TerminalEventType.Host]: { event: string; data: unknown };
  [TerminalEventType.Session]: TerminalSessionInfo;
  [TerminalEventType.Connect]: { id: string };
  [TerminalMittEvent.OpenSearch]: void;
};

interface TerminalContext {
  hostBridge: HostBridge;
  eventBus: ReturnType<typeof mitt<TerminalEvents>>;
  cleanup: () => void;
  initialize: () => void;
  sendMittEvent: (event: TerminalMittEvent) => void;
  onMittEvent: (event: TerminalMittEvent, callback: () => void) => () => void;
  sendHostEvent: (event: string, data: unknown) => void;
  setClipboardAccess: (permission?: ClipboardPermission | null, policy?: ClipboardPolicy | null) => void;
  canUseClipboard: (direction: ClipboardDirection) => boolean;
  validateClipboardText: (direction: ClipboardDirection, text: string) => boolean;
}

export const kokoTerminalContextKey: InjectionKey<TerminalContext> = Symbol("koko-terminal-context");

export const createKokoTerminalContext = (): TerminalContext => {
  const eventBus = mitt<TerminalEvents>();
  const hostBridge = createHostBridge();
  const connectionStore = useKokoConnectionStore();
  const sessionCtxRef = inject(connectorSessionKey, null);
  const tokenActions = unref(sessionCtxRef)?.actions;
  const clipboardAccess = shallowRef(
    tokenActions ? resolveClipboardAccess({ actions: tokenActions }) : createUnrestrictedClipboardAccess()
  );
  const toast = useToast();
  const { t } = useI18n();
  let unbindPostMessage: (() => void) | undefined;

  const setClipboardAccess = (permission?: ClipboardPermission | null, policy?: ClipboardPolicy | null) => {
    const effectivePermission = permission ?? (tokenActions ? { actions: tokenActions } : undefined);
    clipboardAccess.value = resolveClipboardAccess(effectivePermission, policy);
  };

  const canUseClipboard = (direction: ClipboardDirection) => clipboardAccess.value[direction].enabled;

  const validateClipboardText = (direction: ClipboardDirection, text: string) => {
    const result = validateClipboardAccess(clipboardAccess.value, direction, text);
    if (result.allowed) return true;

    toast.add({
      title:
        result.reason === "text_limit"
          ? t("koko.terminal.clipboardTextLimitExceeded", {
              action: t(direction === "copy" ? "koko.actions.copy" : "koko.actions.paste"),
              limit: result.limit
            })
          : t(direction === "copy" ? "koko.terminal.clipboardCopyDenied" : "koko.terminal.clipboardPasteDenied"),
      color: "warning"
    });
    return false;
  };

  const sendHostEvent = (event: string, data: unknown) => {
    eventBus.emit(TerminalEventType.Host, { event, data });
  };

  const initializeHostListeners = () => {
    eventBus.on(TerminalEventType.Host, ({ event, data }) => {
      switch (event) {
        case HOST_MESSAGE_TYPE.CLOSE:
        case HOST_MESSAGE_TYPE.TERMINAL_ERROR:
          hostBridge.sendHost(HOST_MESSAGE_TYPE.CLOSE, data);
          break;
        case HOST_MESSAGE_TYPE.SHARE_CODE_RESPONSE:
          hostBridge.sendHost(HOST_MESSAGE_TYPE.SHARE_CODE_RESPONSE, data);
          break;
        default:
          hostBridge.sendHost(event as `${HOST_MESSAGE_TYPE}`, data);
      }
    });

    mittBus.on(KokoMittEvent.RemoveShareUser, (user) => {
      const socket = connectionStore.socket;
      const terminalId = connectionStore.terminalId;
      if (!socket || !terminalId) return;

      socket.send(
        formatMessage(
          terminalId,
          FORMATTER_MESSAGE_TYPE.TERMINAL_SHARE_USER_REMOVE,
          JSON.stringify({ session: user.sessionId, user_meta: user.userMeta })
        )
      );
    });

    const handleHostCommand = (data: unknown, enforceClipboardPolicy = true) => {
      const socket = connectionStore.socket;
      const terminalId = connectionStore.terminalId;
      const paneId = unref(sessionCtxRef)?.tabId || "";
      const command = String(data ?? "");
      if (
        !socket ||
        !terminalId ||
        socket.readyState !== WebSocket.OPEN ||
        (paneId && isKokoTerminalAiInputLocked(paneId))
      ) {
        return;
      }
      if (enforceClipboardPolicy && command && !validateClipboardText("paste", command)) return;
      // Empty INPUT_ACTIVE keepalives must not go through the custom sender:
      // that path re-emits INPUT_ACTIVE and would recurse.
      if (command && paneId && hasKokoTerminalDataSender(paneId)) {
        sendKokoTerminalData(paneId, command);
        return;
      }
      socket.send(formatMessage(terminalId, FORMATTER_MESSAGE_TYPE.TERMINAL_DATA, command));
    };

    mittBus.on(KokoMittEvent.WriteCommand, ({ type }) => {
      handleHostCommand(type, false);
    });

    const handleHostFocus = () => {
      connectionStore.terminal?.focus();
    };

    const handleHostThemeChange = (message: { theme?: string }) => {
      const terminal = connectionStore.terminal;
      if (!terminal) return;
      const themeName = message.theme || "Default";
      nextTick(() => {
        applyXtermTheme(terminal, terminalTheme(themeName));
      });
    };

    const handleDrawerOpen = () => {
      connectionStore.updateConnectionState({ drawerOpenState: true });
    };

    const handleTerminalContent = () => {
      const terminal = connectionStore.terminal;
      const sessionId = connectionStore.sessionId;
      const terminalId = connectionStore.terminalId;
      if (!terminal || !sessionId || !terminalId) return;

      hostBridge.sendHost(HOST_MESSAGE_TYPE.TERMINAL_CONTENT_RESPONSE, {
        content: getXTerminalLineContent(10, terminal),
        sessionId,
        terminalId
      });
    };

    hostBridge.onHost(HOST_MESSAGE_TYPE.OPEN, handleDrawerOpen);
    hostBridge.onHost(HOST_MESSAGE_TYPE.CMD, (message) => handleHostCommand(message.data));
    hostBridge.onHost(HOST_MESSAGE_TYPE.FOCUS, handleHostFocus);
    hostBridge.onHost(HOST_MESSAGE_TYPE.TERMINAL_THEME_CHANGE, (message) =>
      handleHostThemeChange({ theme: message.theme })
    );
    hostBridge.onHost(HOST_MESSAGE_TYPE.TERMINAL_CONTENT, handleTerminalContent);
    hostBridge.onHost(HOST_MESSAGE_TYPE.INPUT_ACTIVE, () => handleHostCommand("", false));
  };

  const sendMittEvent = (event: TerminalMittEvent) => {
    eventBus.emit(event);
  };

  const onMittEvent = (event: TerminalMittEvent, callback: () => void) => {
    eventBus.on(event, callback);
    return () => eventBus.off(event, callback);
  };

  const initialize = () => {
    unbindPostMessage = hostBridge.bindPostMessage();
    initializeHostListeners();
  };

  const cleanup = () => {
    eventBus.all.clear();
    mittBus.all.clear();
    unbindPostMessage?.();
    hostBridge.destroy();
  };

  return {
    hostBridge,
    eventBus,
    cleanup,
    initialize,
    sendHostEvent,
    sendMittEvent,
    onMittEvent,
    setClipboardAccess,
    canUseClipboard,
    validateClipboardText
  };
};

export const useKokoTerminalContext = () => {
  const context = inject(kokoTerminalContextKey);
  if (!context) {
    throw new Error("useKokoTerminalContext must be used within TerminalProvider");
  }
  return context;
};
