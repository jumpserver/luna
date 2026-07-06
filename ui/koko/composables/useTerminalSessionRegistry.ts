import { formatMessage } from "~/koko/utils/terminalUtils";
import { FORMATTER_MESSAGE_TYPE } from "~/shared/connectors/types/message";

interface TerminalSession {
  socket: WebSocket
  terminalId: string
}

const sessions = new Map<string, TerminalSession>();

export function registerKokoTerminalSession(tabId: string, session: TerminalSession) {
  if (!tabId) return;
  sessions.set(tabId, session);
}

export function unregisterKokoTerminalSession(tabId: string) {
  if (!tabId) return;
  sessions.delete(tabId);
}

export function sendKokoTerminalData(tabId: string, data: string) {
  const session = sessions.get(tabId);
  if (!session || session.socket.readyState !== WebSocket.OPEN) return false;

  session.socket.send(formatMessage(session.terminalId, FORMATTER_MESSAGE_TYPE.TERMINAL_DATA, data));
  return true;
}

export function sendKokoTerminalDataToMany(tabIds: string[], data: string) {
  let sent = 0;
  for (const tabId of tabIds) {
    if (sendKokoTerminalData(tabId, data)) sent += 1;
  }
  return sent;
}
