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

const sessions = new Map<string, TerminalSession>();
const localShellSessions = new Map<string, LocalShellSession>();

export function registerKokoTerminalSession(tabId: string, session: TerminalSession) {
  if (!tabId) return;
  sessions.set(tabId, session);
}

export function unregisterKokoTerminalSession(tabId: string) {
  if (!tabId) return;
  sessions.delete(tabId);
}

export function registerLocalShellTerminalSession(tabId: string, send: (data: string) => void, terminal?: Terminal) {
  if (!tabId) return;
  localShellSessions.set(tabId, { send, terminal });
}

export function unregisterLocalShellTerminalSession(tabId: string) {
  if (!tabId) return;
  localShellSessions.delete(tabId);
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
  const terminal = sessions.get(tabId)?.terminal || localShellSessions.get(tabId)?.terminal;
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

export function sendKokoTerminalDataToMany(tabIds: string[], data: string) {
  let sent = 0;
  for (const tabId of tabIds) {
    if (sendKokoTerminalData(tabId, data)) sent += 1;
  }
  return sent;
}
