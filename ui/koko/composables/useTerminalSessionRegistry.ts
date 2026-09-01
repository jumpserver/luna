import type { Terminal } from "@xterm/xterm";
import { FORMATTER_MESSAGE_TYPE } from "@jumpserver/connectors-core";
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

type TerminalCursorAnchorListener = (anchor: TerminalCursorAnchor | null) => void;

const sessions = new Map<string, TerminalSession>();
const localShellSessions = new Map<string, LocalShellSession>();
const cursorAnchorListeners = new Map<string, Set<TerminalCursorAnchorListener>>();
const stopCursorAnchorBindings = new Map<string, () => void>();
const pendingCursorAnchorFrames = new Map<string, number>();
const lastCursorAnchors = new Map<string, TerminalCursorAnchor | null>();
const userInputListeners = new Map<string, Set<() => void>>();
const stopUserInputBindings = new Map<string, () => void>();

function getRegisteredTerminal(tabId: string) {
  return sessions.get(tabId)?.terminal || localShellSessions.get(tabId)?.terminal;
}

function sameCursorAnchor(left: TerminalCursorAnchor | null | undefined, right: TerminalCursorAnchor | null) {
  if (!left || !right) return left === right;
  return (
    left.left === right.left && left.top === right.top && left.width === right.width && left.height === right.height
  );
}

function emitTerminalCursorAnchor(tabId: string) {
  const anchor = getKokoTerminalCursorAnchor(tabId);
  if (sameCursorAnchor(lastCursorAnchors.get(tabId), anchor)) return;
  lastCursorAnchors.set(tabId, anchor);
  cursorAnchorListeners.get(tabId)?.forEach((listener) => listener(anchor));
}

function cancelScheduledTerminalCursorAnchor(tabId: string) {
  const frame = pendingCursorAnchorFrames.get(tabId);
  if (frame != null) cancelAnimationFrame(frame);
  pendingCursorAnchorFrames.delete(tabId);
}

function scheduleTerminalCursorAnchor(tabId: string) {
  if (pendingCursorAnchorFrames.has(tabId)) return;
  pendingCursorAnchorFrames.set(
    tabId,
    requestAnimationFrame(() => {
      pendingCursorAnchorFrames.delete(tabId);
      emitTerminalCursorAnchor(tabId);
    })
  );
}

function rebindTerminalCursorAnchor(tabId: string) {
  stopCursorAnchorBindings.get(tabId)?.();
  stopCursorAnchorBindings.delete(tabId);
  cancelScheduledTerminalCursorAnchor(tabId);
  lastCursorAnchors.delete(tabId);

  const terminal = getRegisteredTerminal(tabId);
  if (!terminal || !cursorAnchorListeners.get(tabId)?.size) return;

  const schedule = () => scheduleTerminalCursorAnchor(tabId);
  const cursorDisposable = terminal.onCursorMove(schedule);
  const resizeDisposable = terminal.onResize(schedule);
  const scrollDisposable = terminal.onScroll(schedule);
  stopCursorAnchorBindings.set(tabId, () => {
    cursorDisposable.dispose();
    resizeDisposable.dispose();
    scrollDisposable.dispose();
  });
  emitTerminalCursorAnchor(tabId);
}

function rebindTerminalUserInput(tabId: string) {
  stopUserInputBindings.get(tabId)?.();
  stopUserInputBindings.delete(tabId);
  const terminal = getRegisteredTerminal(tabId);
  if (!terminal || !userInputListeners.get(tabId)?.size) return;
  const disposable = terminal.onData(() => {
    userInputListeners.get(tabId)?.forEach((listener) => listener());
  });
  stopUserInputBindings.set(tabId, () => disposable.dispose());
}

function rebindTerminalListeners(tabId: string) {
  rebindTerminalCursorAnchor(tabId);
  rebindTerminalUserInput(tabId);
}

interface TerminalDataSender {
  send: (data: string) => boolean;
}

const terminalDataSenders = new Map<string, TerminalDataSender>();

export function registerKokoTerminalSession(tabId: string, session: TerminalSession) {
  if (!tabId) return;
  sessions.set(tabId, session);
  rebindTerminalListeners(tabId);
}

export function unregisterKokoTerminalSession(tabId: string) {
  if (!tabId) return;
  sessions.delete(tabId);
  rebindTerminalListeners(tabId);
}

export function registerLocalShellTerminalSession(tabId: string, send: (data: string) => void, terminal?: Terminal) {
  if (!tabId) return;
  localShellSessions.set(tabId, { send, terminal });
  rebindTerminalListeners(tabId);
}

export function unregisterLocalShellTerminalSession(tabId: string) {
  if (!tabId) return;
  localShellSessions.delete(tabId);
  rebindTerminalListeners(tabId);
}

export function registerKokoTerminalDataSender(tabId: string, send: (data: string) => boolean) {
  if (!tabId) return;
  terminalDataSenders.set(tabId, { send });
}

export function unregisterKokoTerminalDataSender(tabId: string) {
  if (!tabId) return;
  terminalDataSenders.delete(tabId);
}

export function hasKokoTerminalDataSender(tabId: string) {
  return terminalDataSenders.has(tabId);
}

export function sendKokoTerminalData(tabId: string, data: string) {
  if (isKokoTerminalAiInputLocked(tabId)) return false;

  const customSender = terminalDataSenders.get(tabId);
  if (customSender) return customSender.send(data);

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

export function getKokoTerminalElement(tabId: string) {
  return getRegisteredTerminal(tabId)?.element ?? null;
}

export function getKokoTerminalCursorAnchor(tabId: string): TerminalCursorAnchor | null {
  const terminal = getRegisteredTerminal(tabId);
  const screen = terminal?.element?.querySelector<HTMLElement>(".xterm-screen");
  if (!terminal || !screen || terminal.cols <= 0 || terminal.rows <= 0) return null;

  const bounds = screen.getBoundingClientRect();
  const cellWidth = bounds.width / terminal.cols;
  const cellHeight = bounds.height / terminal.rows;
  const buffer = terminal.buffer.active;
  const cursorRow = buffer.baseY + buffer.cursorY - buffer.viewportY;
  if (cursorRow < 0 || cursorRow >= terminal.rows) return null;

  return {
    left: bounds.left + buffer.cursorX * cellWidth,
    top: bounds.top + cursorRow * cellHeight,
    width: cellWidth,
    height: cellHeight
  };
}

export function subscribeKokoTerminalUserInput(tabId: string, listener: () => void) {
  if (!tabId) return () => {};
  const listeners = userInputListeners.get(tabId) || new Set<() => void>();
  listeners.add(listener);
  userInputListeners.set(tabId, listeners);
  rebindTerminalUserInput(tabId);

  return () => {
    const activeListeners = userInputListeners.get(tabId);
    activeListeners?.delete(listener);
    if (!activeListeners?.size) {
      userInputListeners.delete(tabId);
      rebindTerminalUserInput(tabId);
    }
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
