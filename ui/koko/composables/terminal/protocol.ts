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
  version?: number;
  resource_session_id?: string;
}

const closeReasonKeys: Record<string, string> = {
  idle_disconnect: "idle",
  max_session_timeout: "maxDuration",
  permission_expired: "permissionExpired",
  admin_terminate: "admin",
  connect_disconnect: "assetClosed",
  connect_failed: "connectFailed",
  initialization_failed: "connectFailed",
  read_timeout: "readTimeout",
  write_timeout: "writeTimeout",
  write_failed: "writeFailed",
  request_canceled: "serviceClosed",
  share_removed: "shareRemoved"
};

export function describeTerminalClose(
  event: Pick<CloseEvent, "code" | "reason" | "wasClean">,
  serverReason: string | undefined,
  online: boolean
) {
  const reason =
    serverReason ?? (event.code === 4000 && event.reason.startsWith("koko:") ? event.reason.slice(5) : undefined);
  if (reason !== undefined) {
    return {
      source: "koko",
      messageKey: "koko.terminal.closedByKoko",
      reasonKey: `koko.terminal.closeReason.${Object.hasOwn(closeReasonKeys, reason) ? closeReasonKeys[reason] : "sessionClosed"}`
    };
  }
  if (!online) return { source: "offline", messageKey: "koko.terminal.networkOffline" };
  if (!event.wasClean || event.code === 1006) {
    return { source: "transport", messageKey: "koko.terminal.connectionInterrupted" };
  }
  return { source: "unknown", messageKey: "koko.terminal.connectionClosedWithoutReason" };
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
    requestId: typeof message.requestId === "string" ? message.requestId : undefined,
    version: typeof message.version === "number" ? message.version : undefined,
    resource_session_id: typeof message.resource_session_id === "string" ? message.resource_session_id : undefined
  };
}
