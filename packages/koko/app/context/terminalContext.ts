import type { HostBridge } from "@jumpserver/connectors-core";

import type { InjectionKey } from "vue";
import type { TerminalMittEvent } from "#koko/composables/terminal/protocol";

import type { TerminalSessionInfo } from "#koko/types";
import { createHostBridge, FORMATTER_MESSAGE_TYPE, HOST_MESSAGE_TYPE } from "@jumpserver/connectors-core";
import mitt from "mitt";
import { inject, nextTick } from "vue";
import { TerminalEventType } from "#koko/composables/terminal/protocol";
import { useKokoConnectionStore } from "#koko/stores/connection";
import mittBus from "#koko/utils/mittBus";
import { terminalTheme } from "#koko/utils/terminalTheme";
import { formatMessage, getXTerminalLineContent } from "#koko/utils/terminalUtils";

type TerminalEvents = Record<string, unknown> & {
  [TerminalEventType.Host]: { event: string; data: unknown };
  [TerminalEventType.Session]: TerminalSessionInfo;
  [TerminalEventType.Connect]: { id: string };
};

interface TerminalContext {
  hostBridge: HostBridge;
  eventBus: ReturnType<typeof mitt<TerminalEvents>>;
  cleanup: () => void;
  initialize: () => void;
  sendMittEvent: (event: TerminalMittEvent, data: unknown) => void;
  onMittEvent: (event: TerminalMittEvent, callback: (data: unknown) => void) => () => void;
  sendHostEvent: (event: string, data: unknown) => void;
}

export const kokoTerminalContextKey: InjectionKey<TerminalContext> = Symbol("koko-terminal-context");

export const createKokoTerminalContext = (): TerminalContext => {
  const eventBus = mitt<TerminalEvents>();
  const hostBridge = createHostBridge();
  const connectionStore = useKokoConnectionStore();
  let unbindPostMessage: (() => void) | undefined;

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

    mittBus.on("remove-share-user", (user) => {
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

    const handleHostCommand = (data: unknown) => {
      const socket = connectionStore.socket;
      const terminalId = connectionStore.terminalId;
      if (!socket || !terminalId || socket.readyState !== WebSocket.OPEN) return;
      socket.send(formatMessage(terminalId, FORMATTER_MESSAGE_TYPE.TERMINAL_DATA, String(data ?? "")));
    };

    mittBus.on("write-command", ({ type }) => {
      handleHostCommand(type);
    });

    const handleHostFocus = () => {
      connectionStore.terminal?.focus();
    };

    const handleHostThemeChange = (message: { theme?: string }) => {
      const terminal = connectionStore.terminal;
      if (!terminal) return;
      const themeName = message.theme || "Default";
      nextTick(() => {
        terminal.options.theme = terminalTheme(themeName);
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
    hostBridge.onHost(HOST_MESSAGE_TYPE.INPUT_ACTIVE, () => handleHostCommand(""));
  };

  const sendMittEvent = (event: TerminalMittEvent, data: unknown) => {
    mittBus.emit(event as keyof typeof mittBus.all, data as never);
  };

  const onMittEvent = (event: TerminalMittEvent, callback: (data: unknown) => void) => {
    mittBus.on(event as keyof typeof mittBus.all, callback as never);
    return () => mittBus.off(event as keyof typeof mittBus.all, callback as never);
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
    onMittEvent
  };
};

export const useKokoTerminalContext = () => {
  const context = inject(kokoTerminalContextKey);
  if (!context) {
    throw new Error("useKokoTerminalContext must be used within TerminalProvider");
  }
  return context;
};
