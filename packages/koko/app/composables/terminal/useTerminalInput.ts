import type { Terminal } from "@xterm/xterm";
import type { Ref } from "vue";
import type { ClipboardDirection, ILunaConfig } from "#koko/types";

import { FORMATTER_MESSAGE_TYPE, HOST_MESSAGE_TYPE } from "@jumpserver/connectors-core";

import { readText, writeText } from "clipboard-polyfill";
import { KeyboardKey } from "#koko/constants/keyboard";
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
  isSocketOpen: (socket: WebSocket) => boolean;
  isZmodemActive: () => boolean;
  abortZmodem: () => void;
  quickPaste: () => string;
  getTerminalConfig: () => Partial<ILunaConfig>;
  onResize: (size: { cols: number; rows: number }) => void;
  onHostKey: (key: string) => void;
  inputLocked: () => boolean;
  addErrorToast: (options: { title: string }) => void;
  translate: (key: string) => string;
  sendHostEvent: (event: string, data: unknown) => void;
  sendToHost: (event: HOST_MESSAGE_TYPE, data: unknown) => void;
  sendMittEvent: (event: TerminalMittEvent) => void;
  validateClipboardText: (direction: ClipboardDirection, text: string) => boolean;
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
      if (!text || !socket || options.inputLocked() || !options.isSocketOpen(socket)) {
        if (socket && !options.isSocketOpen(socket)) {
          options.addErrorToast({ title: options.translate("koko.terminal.websocketConnectionClosed") });
        }
        return;
      }
      if (!options.validateClipboardText("paste", text)) return;
      socket.send(formatMessage(options.terminalId.value, FORMATTER_MESSAGE_TYPE.TERMINAL_DATA, text));
    };
    const onPaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (options.validateClipboardText("paste", text)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const onCopy = (event: ClipboardEvent) => {
      const text = terminal.getSelection();
      if (!text || options.validateClipboardText("copy", text)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
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
      if ((event.ctrlKey || event.metaKey) && event.key === KeyboardKey.F) {
        options.sendMittEvent(TerminalMittEvent.OpenSearch);
        event.preventDefault();
      }
    };

    container.addEventListener("click", onClick);
    container.addEventListener("mouseenter", onMouseEnter);
    container.addEventListener("contextmenu", onContextMenu);
    container.addEventListener("paste", onPaste, true);
    container.addEventListener("copy", onCopy, true);
    container.addEventListener("mouseleave", onMouseLeave);
    container.addEventListener("keydown", onKeyDown);
    cleanup.push(
      () => container.removeEventListener("click", onClick),
      () => container.removeEventListener("mouseenter", onMouseEnter),
      () => container.removeEventListener("contextmenu", onContextMenu),
      () => container.removeEventListener("paste", onPaste, true),
      () => container.removeEventListener("copy", onCopy, true),
      () => container.removeEventListener("mouseleave", onMouseLeave),
      () => container.removeEventListener("keydown", onKeyDown)
    );

    terminal.onData((data) => {
      const socket = options.socket.value;
      if (!socket || options.inputLocked() || !options.isSocketOpen(socket)) return;
      options.lastSendTime.value = new Date();
      const isZmodemInterrupt = options.isZmodemActive() && data.length === 1 && data.charCodeAt(0) === 3;
      socket.send(
        formatMessage(
          options.terminalId.value,
          FORMATTER_MESSAGE_TYPE.TERMINAL_DATA,
          isZmodemInterrupt ? data : preprocessInput(data, options.getTerminalConfig())
        )
      );
      if (isZmodemInterrupt) options.abortZmodem();
      options.sendToHost(HOST_MESSAGE_TYPE.INPUT_ACTIVE, "");
    });
    terminal.onResize(options.onResize);
    terminal.onSelectionChange(async () => {
      options.selectionText.value = terminal.getSelection() || "";
      if (!options.selectionText.value || !options.validateClipboardText("copy", options.selectionText.value)) return;
      try {
        await writeText(options.selectionText.value);
      } catch (error) {
        console.error("Failed to write terminal selection to clipboard:", error);
      }
    });
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.key === KeyboardKey.Enter && event.isComposing) return false;
      if (
        event.altKey &&
        event.shiftKey &&
        (event.key === KeyboardKey.ArrowRight || event.key === KeyboardKey.ArrowLeft)
      ) {
        options.onHostKey(event.key);
        return false;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === KeyboardKey.C && terminal.hasSelection())
        return false;
      return !((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === KeyboardKey.V);
    });
  }

  function stop() {
    for (const dispose of cleanup.splice(0)) dispose();
  }

  return { start, stop };
}
