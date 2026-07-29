import type { Terminal } from "@xterm/xterm";
import type { Ref } from "vue";

import { FORMATTER_MESSAGE_TYPE, HOST_MESSAGE_TYPE } from "@jumpserver/connectors-core";

import { readText, writeText } from "clipboard-polyfill";
import { formatMessage, getXTerminalLineContent, preprocessInput } from "#koko/utils/terminalUtils";
import { TerminalMittEvent } from "./protocol";

export function useKokoTerminalInput(options: {
  container: Ref<HTMLElement | undefined>;
  terminal: Ref<Terminal | null>;
  socket: Ref<WebSocket | null>;
  terminalId: Ref<string>;
  sessionId: Ref<string>;
  selectionText: Ref<string>;
  lastSendTime: Ref<Date>;
  fit: () => void;
  isSocketClosing: (socket: WebSocket) => boolean;
  quickPaste: () => string;
  getTerminalConfig: () => Record<string, unknown>;
  onResize: (size: { cols: number; rows: number }) => void;
  onHostKey: (key: string) => void;
  addErrorToast: (options: { title: string }) => void;
  translate: (key: string) => string;
  sendHostEvent: (event: string, data: unknown) => void;
  sendToHost: (event: HOST_MESSAGE_TYPE, data: unknown) => void;
  sendMittEvent: (event: TerminalMittEvent) => void;
}) {
  const cleanup: Array<() => void> = [];

  function start() {
    const terminal = options.terminal.value;
    const container = options.container.value;
    if (!terminal || !container) return;

    const onClick = () => options.sendHostEvent(HOST_MESSAGE_TYPE.CLICK, "");
    const onMouseEnter = () => {
      options.fit();
      terminal.focus();
    };
    const onContextMenu = async (event: MouseEvent) => {
      if (event.ctrlKey || options.quickPaste() !== "1") return;
      event.preventDefault();
      let text = "";
      try {
        text = await readText();
      } catch {
        text = options.selectionText.value;
      }
      const socket = options.socket.value;
      if (!text || !socket || options.isSocketClosing(socket)) {
        if (socket && options.isSocketClosing(socket)) {
          options.addErrorToast({ title: options.translate("koko.terminal.websocketConnectionClosed") });
        }
        return;
      }
      socket.send(formatMessage(options.terminalId.value, FORMATTER_MESSAGE_TYPE.TERMINAL_DATA, text));
    };
    const onMouseLeave = () => {
      terminal.blur();
      options.sendHostEvent(HOST_MESSAGE_TYPE.TERMINAL_CONTENT_RESPONSE, {
        content: getXTerminalLineContent(10, terminal),
        sessionId: options.sessionId.value,
        terminalId: options.terminalId.value
      });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "f") {
        options.sendMittEvent(TerminalMittEvent.OpenSearch);
        event.preventDefault();
      }
    };

    container.addEventListener("click", onClick);
    container.addEventListener("mouseenter", onMouseEnter);
    container.addEventListener("contextmenu", onContextMenu);
    container.addEventListener("mouseleave", onMouseLeave);
    container.addEventListener("keydown", onKeyDown);
    cleanup.push(
      () => container.removeEventListener("click", onClick),
      () => container.removeEventListener("mouseenter", onMouseEnter),
      () => container.removeEventListener("contextmenu", onContextMenu),
      () => container.removeEventListener("mouseleave", onMouseLeave),
      () => container.removeEventListener("keydown", onKeyDown)
    );

    terminal.onData((data) => {
      const socket = options.socket.value;
      if (!socket || options.isSocketClosing(socket)) return;
      options.lastSendTime.value = new Date();
      socket.send(formatMessage("", FORMATTER_MESSAGE_TYPE.TERMINAL_DATA, preprocessInput(data, options.getTerminalConfig)));
      options.sendToHost(HOST_MESSAGE_TYPE.INPUT_ACTIVE, "");
    });
    terminal.onResize(options.onResize);
    terminal.onSelectionChange(async () => {
      options.selectionText.value = terminal.getSelection() || "";
      if (options.selectionText.value) await writeText(options.selectionText.value);
    });
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.altKey && event.shiftKey && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
        options.onHostKey(event.key);
        return false;
      }
      if (event.ctrlKey && event.key === "c" && terminal.hasSelection()) return false;
      return !(event.ctrlKey && event.key === "v");
    });
  }

  function stop() {
    for (const dispose of cleanup.splice(0)) dispose();
  }

  return { start, stop };
}
