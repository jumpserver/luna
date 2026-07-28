import { FORMATTER_MESSAGE_TYPE } from "@jumpserver/connectors-core";
import { formatMessage } from "#koko/utils/terminalUtils";

interface TerminalSession {
  socket: WebSocket;
  terminalId: string;
}

const sessions = new Map<string, TerminalSession>();
const localShellSessions = new Map<string, (data: string) => void>();

export function registerKokoTerminalSession(tabId: string, session: TerminalSession) {
  if (!tabId) return;
  sessions.set(tabId, session);
}

export function unregisterKokoTerminalSession(tabId: string) {
  if (!tabId) return;
  sessions.delete(tabId);
}

export function registerLocalShellTerminalSession(tabId: string, send: (data: string) => void) {
  if (!tabId) return;
  localShellSessions.set(tabId, send);
}

export function unregisterLocalShellTerminalSession(tabId: string) {
  if (!tabId) return;
  localShellSessions.delete(tabId);
}

export function sendKokoTerminalData(tabId: string, data: string) {
  const session = sessions.get(tabId);
  if (session?.socket.readyState === WebSocket.OPEN) {
    session.socket.send(formatMessage(session.terminalId, FORMATTER_MESSAGE_TYPE.TERMINAL_DATA, data));
    return true;
  }

  const sendToLocalShell = localShellSessions.get(tabId);
  if (!sendToLocalShell) return false;

  sendToLocalShell(data);
  return true;
}

export function sendKokoTerminalDataToMany(tabIds: string[], data: string) {
  let sent = 0;
  for (const tabId of tabIds) {
    if (sendKokoTerminalData(tabId, data)) sent += 1;
  }
  return sent;
}
