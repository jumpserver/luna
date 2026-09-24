import type { Terminal } from "@xterm/xterm";
import type { Ref } from "vue";
import type { ClipboardDirection } from "#koko/types/clipboard";
import type { ITerminalSettings } from "#koko/types/settings";

import { FORMATTER_MESSAGE_TYPE, HOST_MESSAGE_TYPE } from "@jumpserver/connectors-core";

import { readText, writeText } from "clipboard-polyfill";
import { isTerminalCopyChord, isTerminalInterruptChord, KeyboardKey } from "#koko/constants/keyboard";
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
  onContextMenu: (event: MouseEvent) => void;
  getTerminalConfig: () => Partial<ITerminalSettings>;
  onResize: (size: { cols: number; rows: number }) => void;
  onHostKey: (key: string) => void;
  inputLocked: (data?: string) => boolean;
  sendHostEvent: (event: string, data: unknown) => void;
  sendToHost: (event: HOST_MESSAGE_TYPE, data: unknown) => void;
  sendMittEvent: (event: TerminalMittEvent) => void;
  validateClipboardText: (direction: ClipboardDirection, text: string) => boolean;
  onData?: (data: string) => void;
  onExternalData?: () => void;
  onKeyEvent?: (event: KeyboardEvent) => boolean | undefined;
}) {
  const cleanup: Array<() => void> = [];

  const copySelection = async () => {
    const terminal = options.terminal.value;
    const text = terminal?.getSelection() || "";
    if (!text || !options.validateClipboardText("copy", text)) return false;
    try {
      await writeText(text);
      return true;
    } catch (error) {
      console.error("Failed to write terminal selection to clipboard:", error);
      return false;
    }
  };

  const pasteClipboard = async () => {
    const socket = options.socket.value;
    if (!socket || options.inputLocked() || !options.isSocketOpen(socket)) return false;
    if (!options.validateClipboardText("paste", "")) return false;

    let text = "";
    try {
      text = await readText();
    } catch {
      text = options.selectionText.value;
    }
    // Clipboard access is asynchronous; the original session must still accept input.
    if (!text || options.socket.value !== socket || options.inputLocked() || !options.isSocketOpen(socket)) {
      return false;
    }
    if (!options.validateClipboardText("paste", text)) return false;
    options.onExternalData?.();
    socket.send(formatMessage(options.terminalId.value, FORMATTER_MESSAGE_TYPE.TERMINAL_DATA, text));
    return true;
  };

  function start() {
    const terminal = options.terminal.value;
    const container = options.container.value;
    if (!terminal || !container) return;

    const onClick = () => options.sendHostEvent(HOST_MESSAGE_TYPE.CLICK, "");
    const onMouseEnter = () => {
      options.fit();
      terminal.focus();
    };
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      if (options.getTerminalConfig().quickPaste === "1" && !event.ctrlKey) {
        void pasteClipboard();
        return;
      }
      options.onContextMenu(event);
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
      options.sendHostEvent(HOST_MESSAGE_TYPE.TERMINAL_CONTENT_RESPONSE, {
        content: getXTerminalLineContent(10, terminal),
        sessionId: options.sessionId.value,
        terminalId: options.terminalId.value
      });
    };
    container.addEventListener("click", onClick);
    container.addEventListener("mouseenter", onMouseEnter);
    container.addEventListener("contextmenu", onContextMenu);
    container.addEventListener("paste", onPaste, true);
    container.addEventListener("copy", onCopy, true);
    container.addEventListener("mouseleave", onMouseLeave);
    cleanup.push(
      () => container.removeEventListener("click", onClick),
      () => container.removeEventListener("mouseenter", onMouseEnter),
      () => container.removeEventListener("contextmenu", onContextMenu),
      () => container.removeEventListener("paste", onPaste, true),
      () => container.removeEventListener("copy", onCopy, true),
      () => container.removeEventListener("mouseleave", onMouseLeave)
    );

    const sendInput = (data: string) => {
      const socket = options.socket.value;
      if (!socket || options.inputLocked(data) || !options.isSocketOpen(socket)) return;
      options.lastSendTime.value = new Date();
      options.onData?.(data);
      const isZmodemInterrupt = options.isZmodemActive() && data.length === 1 && data.charCodeAt(0) === 3;
      socket.send(
        formatMessage(
          options.terminalId.value,
          FORMATTER_MESSAGE_TYPE.TERMINAL_DATA,
          isZmodemInterrupt || options.inputLocked() ? data : preprocessInput(data, options.getTerminalConfig())
        )
      );
      if (isZmodemInterrupt) options.abortZmodem();
      options.sendToHost(HOST_MESSAGE_TYPE.INPUT_ACTIVE, "");
    };
    terminal.onData(sendInput);
    terminal.onResize(options.onResize);
    let dragging = false;
    let lastCopied = "";
    const copySettledSelection = () => {
      const text = terminal.getSelection() || "";
      options.selectionText.value = text;
      if (!text) {
        lastCopied = "";
        return;
      }
      if (text === lastCopied) return;
      lastCopied = text;
      void copySelection();
    };
    function finishDrag() {
      if (!dragging) return;
      dragging = false;
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", finishDrag);
      copySettledSelection();
    }
    function onPointerUp(event: PointerEvent) {
      if (event.button !== 0) return;
      finishDrag();
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || dragging) return;
      dragging = true;
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", finishDrag);
    };
    container.addEventListener("pointerdown", onPointerDown, true);
    cleanup.push(() => {
      container.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", finishDrag);
    });
    terminal.onSelectionChange(() => {
      options.selectionText.value = terminal.getSelection() || "";
      if (!dragging) copySettledSelection();
    });
    terminal.attachCustomKeyEventHandler((event) => {
      const customResult = options.onKeyEvent?.(event);
      if (customResult !== undefined) return customResult;
      if (event.key === KeyboardKey.Enter && event.isComposing) return false;
      if (
        event.altKey &&
        event.shiftKey &&
        (event.key === KeyboardKey.ArrowRight || event.key === KeyboardKey.ArrowLeft)
      ) {
        options.onHostKey(event.key);
        return false;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === KeyboardKey.F) {
        if (event.type === "keydown") {
          options.sendMittEvent(TerminalMittEvent.OpenSearch);
          event.preventDefault();
        }
        return false;
      }
      if (isTerminalCopyChord(event)) {
        if (event.type === "keydown" && terminal.hasSelection()) {
          event.preventDefault();
          void copySelection();
        }
        return false;
      }
      if (isTerminalInterruptChord(event)) {
        if (event.type === "keydown") {
          event.preventDefault();
          sendInput("\x03");
        }
        return false;
      }
      return !((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === KeyboardKey.V);
    });
  }

  function stop() {
    for (const dispose of cleanup.splice(0)) dispose();
  }

  return {
    copySelection,
    pasteClipboard,
    start,
    stop
  };
}
