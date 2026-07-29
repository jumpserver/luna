export enum KubernetesTerminalMessageType {
  Connect = "CONNECT",
  Ping = "PING",
  Pong = "PONG",
  Error = "ERROR",
  TerminalError = "TERMINAL_ERROR",
  Tree = "TERMINAL_K8S_TREE",
  Initialize = "TERMINAL_K8S_INIT",
  Data = "TERMINAL_K8S_DATA",
  Binary = "TERMINAL_K8S_BINARY",
  Resize = "TERMINAL_K8S_RESIZE",
  Close = "K8S_CLOSE"
}

export enum KubernetesTerminalControlData {
  Pong = "pong"
}

export enum KubernetesTerminalWebSocketProtocol {
  Koko = "JMS-KOKO"
}

export enum KubernetesTerminalSocketFailureCode {
  ConnectionClosed = "connection_closed",
  ConnectionFailed = "connection_failed",
  MalformedMessage = "malformed_message",
  PingReplyFailed = "ping_reply_failed"
}

export interface KubernetesTerminalTarget {
  namespace: string;
  pod: string;
  container: string;
}

export interface KubernetesTerminalConnectMessage {
  type: KubernetesTerminalMessageType.Connect;
  id: string;
}

export interface KubernetesTerminalTreeMessage {
  type: KubernetesTerminalMessageType.Tree;
  data?: string;
}

export interface KubernetesTerminalDataMessage {
  type: KubernetesTerminalMessageType.Data;
  k8s_id: string;
  data?: string;
}

export interface KubernetesTerminalBinaryMessage {
  type: KubernetesTerminalMessageType.Binary;
  k8s_id: string;
  raw?: string;
}

export interface KubernetesTerminalPingMessage {
  type: KubernetesTerminalMessageType.Ping;
  id: string;
}

export interface KubernetesTerminalControlMessage {
  type:
    KubernetesTerminalMessageType.Pong |
    KubernetesTerminalMessageType.Error |
    KubernetesTerminalMessageType.TerminalError |
    KubernetesTerminalMessageType.Close;
  id?: string;
  data?: string;
  err?: string;
  k8s_id?: string;
}

export type KubernetesTerminalIncomingMessage =
  KubernetesTerminalConnectMessage |
  KubernetesTerminalTreeMessage |
  KubernetesTerminalDataMessage |
  KubernetesTerminalBinaryMessage |
  KubernetesTerminalPingMessage |
  KubernetesTerminalControlMessage;

export interface KubernetesTerminalTreeRequest {
  type: KubernetesTerminalMessageType.Tree;
}

export interface KubernetesTerminalPongRequest {
  type: KubernetesTerminalMessageType.Pong;
  id: string;
  data: KubernetesTerminalControlData.Pong;
}

export interface KubernetesTerminalInitializeRequest extends KubernetesTerminalTarget {
  type: KubernetesTerminalMessageType.Initialize;
  id: string;
  k8s_id: string;
  data: string;
}

export interface KubernetesTerminalDataRequest extends KubernetesTerminalTarget {
  type: KubernetesTerminalMessageType.Data;
  id: string;
  k8s_id: string;
  data: string;
}

export interface KubernetesTerminalResizeRequest {
  type: KubernetesTerminalMessageType.Resize;
  id: string;
  k8s_id: string;
  namespace: "";
  pod: "";
  container: "";
  resizeData: string;
}

export interface KubernetesTerminalCloseRequest {
  type: KubernetesTerminalMessageType.Close;
  id: string;
  k8s_id: string;
}

export type KubernetesTerminalOutgoingMessage =
  KubernetesTerminalTreeRequest |
  KubernetesTerminalPongRequest |
  KubernetesTerminalInitializeRequest |
  KubernetesTerminalDataRequest |
  KubernetesTerminalResizeRequest |
  KubernetesTerminalCloseRequest;

export interface KubernetesTerminalFailure {
  code: KubernetesTerminalSocketFailureCode;
  cause?: unknown;
}

const messageTypes = new Set<string>(Object.values(KubernetesTerminalMessageType));

const optionalString = (value: unknown) => (typeof value === "string" ? value : undefined);

export function isKubernetesTerminalMessageType(value: unknown): value is KubernetesTerminalMessageType {
  return typeof value === "string" && messageTypes.has(value);
}

export function parseKubernetesTerminalMessage(raw: unknown): KubernetesTerminalIncomingMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const message = raw as Record<string, unknown>;
  if (!isKubernetesTerminalMessageType(message.type)) return null;

  if (message.type === KubernetesTerminalMessageType.Connect) {
    if (typeof message.id !== "string") return null;
    return { id: message.id, type: message.type };
  }

  if (message.type === KubernetesTerminalMessageType.Ping) {
    if (typeof message.id !== "string") return null;
    return { id: message.id, type: message.type };
  }

  if (message.type === KubernetesTerminalMessageType.Tree) {
    return { data: optionalString(message.data), type: message.type };
  }

  if (message.type === KubernetesTerminalMessageType.Data) {
    if (typeof message.k8s_id !== "string") return null;
    return { data: optionalString(message.data), k8s_id: message.k8s_id, type: message.type };
  }

  if (message.type === KubernetesTerminalMessageType.Binary) {
    if (typeof message.k8s_id !== "string") return null;
    return { k8s_id: message.k8s_id, raw: optionalString(message.raw), type: message.type };
  }

  return {
    data: optionalString(message.data),
    err: optionalString(message.err),
    id: optionalString(message.id),
    k8s_id: optionalString(message.k8s_id),
    type: message.type
  };
}
