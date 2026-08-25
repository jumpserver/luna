import { FORMATTER_MESSAGE_TYPE } from "@jumpserver/connectors-core";
import type { Terminal } from "@xterm/xterm";
import { isKokoTerminalAiInputLocked } from "#koko/composables/terminal/useTerminalAiSessions";
import { formatMessage } from "#koko/utils/terminalUtils";

interface TerminalSession {
  socket: WebSocket;
  terminalId: string;
  terminal?: Terminal;
}

export interface TerminalCursorAnchor {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface LocalShellSession {
  send: (data: string) => void;
  terminal?: Terminal;
}

type TerminalCursorAnchorListener = (anchor: TerminalCursorAnchor) => void;

const sessions = new Map<string, TerminalSession>();
const localShellSessions = new Map<string, LocalShellSession>();
const cursorAnchorListeners = new Map<string, Set<TerminalCursorAnchorListener>>();
const stopCursorAnchorBindings = new Map<string, () => void>();

function getRegisteredTerminal(tabId: string) {
  return sessions.get(tabId)?.terminal || localShellSessions.get(tabId)?.terminal;
}

function emitTerminalCursorAnchor(tabId: string) {
  const anchor = getKokoTerminalCursorAnchor(tabId);
  if (!anchor) return;
  cursorAnchorListeners.get(tabId)?.forEach((listener) => listener(anchor));
}

function rebindTerminalCursorAnchor(tabId: string) {
  stopCursorAnchorBindings.get(tabId)?.();
  stopCursorAnchorBindings.delete(tabId);

  const terminal = getRegisteredTerminal(tabId);
  if (!terminal || !cursorAnchorListeners.get(tabId)?.size) return;

  const emit = () => emitTerminalCursorAnchor(tabId);
  const cursorDisposable = terminal.onCursorMove(emit);
  const resizeDisposable = terminal.onResize(emit);
  const renderDisposable = terminal.onRender(emit);
  stopCursorAnchorBindings.set(tabId, () => {
    cursorDisposable.dispose();
    resizeDisposable.dispose();
    renderDisposable.dispose();
  });
  emit();
}

export function registerKokoTerminalSession(tabId: string, session: TerminalSession) {
  if (!tabId) return;
  sessions.set(tabId, session);
  rebindTerminalCursorAnchor(tabId);
}

export function unregisterKokoTerminalSession(tabId: string) {
  if (!tabId) return;
  sessions.delete(tabId);
  rebindTerminalCursorAnchor(tabId);
}

export function registerLocalShellTerminalSession(tabId: string, send: (data: string) => void, terminal?: Terminal) {
  if (!tabId) return;
  localShellSessions.set(tabId, { send, terminal });
  rebindTerminalCursorAnchor(tabId);
}

export function unregisterLocalShellTerminalSession(tabId: string) {
  if (!tabId) return;
  localShellSessions.delete(tabId);
  rebindTerminalCursorAnchor(tabId);
}

export function sendKokoTerminalData(tabId: string, data: string) {
  if (isKokoTerminalAiInputLocked(tabId)) return false;

  const session = sessions.get(tabId);
  if (session?.socket.readyState === WebSocket.OPEN) {
    session.socket.send(formatMessage(session.terminalId, FORMATTER_MESSAGE_TYPE.TERMINAL_DATA, data));
    return true;
  }

  const localShellSession = localShellSessions.get(tabId);
  if (!localShellSession) return false;

  localShellSession.send(data);
  return true;
}

export function getKokoTerminalCursorAnchor(tabId: string): TerminalCursorAnchor | null {
  const terminal = getRegisteredTerminal(tabId);
  const screen = terminal?.element?.querySelector<HTMLElement>(".xterm-screen");
  if (!terminal || !screen || terminal.cols <= 0 || terminal.rows <= 0) return null;

  const bounds = screen.getBoundingClientRect();
  const cellWidth = bounds.width / terminal.cols;
  const cellHeight = bounds.height / terminal.rows;
  return {
    left: bounds.left + terminal.buffer.active.cursorX * cellWidth,
    top: bounds.top + terminal.buffer.active.cursorY * cellHeight,
    width: cellWidth,
    height: cellHeight
  };
}

export function subscribeKokoTerminalCursorAnchor(tabId: string, listener: TerminalCursorAnchorListener) {
  if (!tabId) return () => {};
  const listeners = cursorAnchorListeners.get(tabId) || new Set<TerminalCursorAnchorListener>();
  listeners.add(listener);
  cursorAnchorListeners.set(tabId, listeners);
  rebindTerminalCursorAnchor(tabId);

  return () => {
    const activeListeners = cursorAnchorListeners.get(tabId);
    activeListeners?.delete(listener);
    if (!activeListeners?.size) {
      cursorAnchorListeners.delete(tabId);
      rebindTerminalCursorAnchor(tabId);
    }
  };
}

export function sendKokoTerminalDataToMany(tabIds: string[], data: string) {
  let sent = 0;
  for (const tabId of tabIds) {
    if (sendKokoTerminalData(tabId, data)) sent += 1;
  }
  return sent;
}
