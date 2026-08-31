import type { ConnectorSessionContext } from "@jumpserver/connectors-core";
import type { Ref } from "vue";

import type { SftpIncomingMessage, SftpMcpMessage, SftpSocketFailure, SftpWireMessage } from "./protocol";
import { resolveWsUrl } from "@jumpserver/connectors-core";

import { getCurrentInstance, onUnmounted, ref, shallowRef } from "vue";
import { createSftpMessageId } from "./core/codec";
import {
  isSftpMcpMessageType,
  parseSftpIncomingMessage,
  SftpControlData,
  SftpMessageType,
  SftpSocketFailureCode,
  SftpWebSocketProtocol
} from "./protocol";

const SOCKET_OPEN = 1;
const SOCKET_CLOSING = 2;
const SOCKET_CLOSED = 3;
const connectionTimeoutMs = 15_000;

export interface SftpSocketClient {
  socket: Ref<WebSocket | null>;
  connected: Ref<boolean>;
  failure: Ref<SftpSocketFailure | null>;
  close: (notify?: boolean) => void;
  connect: (context: ConnectorSessionContext) => void;
  onFailure: (listener: (failure: SftpSocketFailure) => void) => () => void;
  onMcp: (listener: (message: SftpMcpMessage) => void) => () => void;
  onMessage: (listener: (message: SftpIncomingMessage) => void) => () => void;
  send: (message: SftpWireMessage) => void;
}

export function useSftpSocket(): SftpSocketClient {
  const socket = shallowRef<WebSocket | null>(null);
  const connected = ref(false);
  const failure = ref<SftpSocketFailure | null>(null);
  const messageListeners = new Set<(message: SftpIncomingMessage) => void>();
  const mcpListeners = new Set<(message: SftpMcpMessage) => void>();
  const failureListeners = new Set<(failure: SftpSocketFailure) => void>();
  let generation = 0;
  let intentionalClose = false;
  let connectionTimeout: ReturnType<typeof setTimeout> | undefined;

  function clearConnectionTimeout() {
    clearTimeout(connectionTimeout);
    connectionTimeout = undefined;
  }

  function emitFailure(nextFailure: SftpSocketFailure) {
    failure.value = nextFailure;
    for (const listener of failureListeners) listener(nextFailure);
  }

  function send(message: SftpWireMessage) {
    const target = socket.value;
    if (!target || target.readyState !== SOCKET_OPEN) {
      throw new Error(SftpSocketFailureCode.SendFailed);
    }
    target.send(JSON.stringify(message));
  }

  function sendPong(id: string) {
    send({ id, type: SftpMessageType.Pong, data: SftpControlData.Pong });
  }

  function close(notify = false) {
    clearConnectionTimeout();
    generation += 1;
    intentionalClose = true;
    connected.value = false;
    const target = socket.value;
    socket.value = null;
    if (target && target.readyState !== SOCKET_CLOSING && target.readyState !== SOCKET_CLOSED) target.close();
    if (notify)
      emitFailure({ code: SftpSocketFailureCode.ConnectionReset, message: SftpSocketFailureCode.ConnectionReset });
  }

  function connect(context: ConnectorSessionContext) {
    close();
    intentionalClose = false;
    failure.value = null;
    const currentGeneration = generation;
    const target = new WebSocket(resolveWsUrl(context.component, "sftp", context), [SftpWebSocketProtocol.Koko]);
    socket.value = target;

    const isCurrent = () => generation === currentGeneration && socket.value === target;
    connectionTimeout = setTimeout(() => {
      if (!isCurrent()) return;
      close();
      emitFailure({ code: SftpSocketFailureCode.ConnectionFailed, message: SftpSocketFailureCode.ConnectionFailed });
    }, connectionTimeoutMs);
    target.onopen = () => {
      if (!isCurrent()) return;
      clearConnectionTimeout();
      connected.value = true;
    };
    target.onmessage = (event) => {
      if (!isCurrent()) return;
      let raw: unknown;
      try {
        raw = JSON.parse(String(event.data));
      } catch {
        emitFailure({ code: SftpSocketFailureCode.MalformedMessage, message: SftpSocketFailureCode.MalformedMessage });
        return;
      }

      const message = parseSftpIncomingMessage(raw);
      if (!message) {
        emitFailure({ code: SftpSocketFailureCode.MalformedMessage, message: SftpSocketFailureCode.MalformedMessage });
        return;
      }
      if (message.type === SftpMessageType.Ping) {
        try {
          sendPong(createSftpMessageId());
        } catch {
          emitFailure({ code: SftpSocketFailureCode.SendFailed, message: SftpSocketFailureCode.SendFailed });
        }
        return;
      }
      if (isSftpMcpMessageType(message.type)) {
        const mcpMessage = message as SftpMcpMessage;
        for (const listener of mcpListeners) listener(mcpMessage);
        return;
      }
      for (const listener of messageListeners) listener(message);
    };
    target.onerror = () => {
      if (!isCurrent()) return;
      clearConnectionTimeout();
      connected.value = false;
      emitFailure({ code: SftpSocketFailureCode.ConnectionFailed, message: SftpSocketFailureCode.ConnectionFailed });
    };
    target.onclose = () => {
      if (!isCurrent()) return;
      clearConnectionTimeout();
      connected.value = false;
      socket.value = null;
      if (!intentionalClose) {
        emitFailure({ code: SftpSocketFailureCode.ConnectionClosed, message: SftpSocketFailureCode.ConnectionClosed });
      }
    };
  }

  function onMessage(listener: (message: SftpIncomingMessage) => void) {
    messageListeners.add(listener);
    return () => messageListeners.delete(listener);
  }

  function onMcp(listener: (message: SftpMcpMessage) => void) {
    mcpListeners.add(listener);
    return () => mcpListeners.delete(listener);
  }

  function onFailure(listener: (nextFailure: SftpSocketFailure) => void) {
    failureListeners.add(listener);
    return () => failureListeners.delete(listener);
  }

  if (getCurrentInstance()) onUnmounted(() => close());

  return { socket, connected, failure, close, connect, onFailure, onMcp, onMessage, send };
}
