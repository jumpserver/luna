import { MESSAGE_TYPE } from "@jumpserver/connectors-core";

export enum TerminalEventType {
  Host = "host-event",
  Session = "terminal-session",
  Connect = "terminal-connect"
}

export enum TerminalMittEvent {
  OpenSearch = "open-search"
}

export enum TerminalWebSocketProtocol {
  Koko = "JMS-KOKO"
}

export interface TerminalIncomingMessage {
  id: string;
  type: string;
  data?: string;
  err?: string;
  raw?: string | number[];
  terminalId?: number;
  requestId?: string;
}

const messageTypes = new Set<string>(Object.values(MESSAGE_TYPE));

export function isTerminalMessageType(value: unknown): value is MESSAGE_TYPE {
  return typeof value === "string" && messageTypes.has(value);
}

export function parseTerminalIncomingMessage(raw: unknown): TerminalIncomingMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const message = raw as Record<string, unknown>;

  if (typeof message.type !== "string" || !message.type) return null;

  return {
    id: typeof message.id === "string" ? message.id : "",
    type: message.type,
    data: typeof message.data === "string" ? message.data : undefined,
    err: typeof message.err === "string" ? message.err : undefined,
    raw: typeof message.raw === "string" || Array.isArray(message.raw) ? message.raw : undefined,
    terminalId: typeof message.terminalId === "number" ? message.terminalId : undefined,
    requestId: typeof message.requestId === "string" ? message.requestId : undefined
  };
}
