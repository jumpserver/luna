import type { ConnectorSessionContext } from "@jumpserver/connectors-core";
import type { Ref } from "vue";

import type { SftpIncomingMessage, SftpMcpMessage, SftpSocketFailure, SftpWireMessage } from "./protocol";
import { resolveWsUrl } from "@jumpserver/connectors-core";

import { getCurrentInstance, onUnmounted, ref, shallowRef } from "vue";
import { createSftpMessageId, encodeSftpBinaryFrame, parseSftpBinaryFrame } from "./core/codec";
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
const idleWatchdogMs = 75_000;

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
  let idleWatchdog: ReturnType<typeof setTimeout> | undefined;

  function clearConnectionTimeout() {
    clearTimeout(connectionTimeout);
    connectionTimeout = undefined;
  }

  function clearIdleWatchdog() {
    clearTimeout(idleWatchdog);
    idleWatchdog = undefined;
  }

  function armIdleWatchdog() {
    clearIdleWatchdog();
    idleWatchdog = setTimeout(() => {
      if (!connected.value) return;
      close();
      emitFailure({ code: SftpSocketFailureCode.ConnectionClosed, message: SftpSocketFailureCode.ConnectionClosed });
    }, idleWatchdogMs);
  }

  function emitFailure(nextFailure: SftpSocketFailure) {
    failure.value = nextFailure;
    for (const listener of failureListeners) listener(nextFailure);
  }

  function deliverMessage(message: SftpIncomingMessage) {
    if (message.type === SftpMessageType.Ping) {
      try {
        sendPong(createSftpMessageId());
      } catch {
        emitFailure({ code: SftpSocketFailureCode.SendFailed, message: SftpSocketFailureCode.SendFailed });
      }
      return;
    }
    if (
      message.type === SftpMessageType.Close ||
      message.type === SftpMessageType.Closed ||
      message.type === SftpMessageType.Error
    ) {
      connected.value = false;
    }
    if (isSftpMcpMessageType(message.type)) {
      const mcpMessage = message as SftpMcpMessage;
      for (const listener of mcpListeners) listener(mcpMessage);
      return;
    }
    for (const listener of messageListeners) listener(message);
    if (
      message.type === SftpMessageType.Close ||
      message.type === SftpMessageType.Closed ||
      message.type === SftpMessageType.Error
    ) {
      close();
    }
  }

  function send(message: SftpWireMessage) {
    const target = socket.value;
    if (!target || target.readyState !== SOCKET_OPEN) {
      throw new Error(SftpSocketFailureCode.SendFailed);
    }
    if (message.raw instanceof Uint8Array) {
      target.send(
        encodeSftpBinaryFrame({
          id: message.id,
          type: message.type,
          cmd: "cmd" in message ? message.cmd : undefined,
          data: message.data,
          err: message.err,
          error_code: message.error_code,
          raw: message.raw
        })
      );
      return;
    }
    target.send(JSON.stringify(message));
  }

  function sendPong(id: string) {
    send({ id, type: SftpMessageType.Pong, data: SftpControlData.Pong });
  }

  function close(notify = false) {
    clearConnectionTimeout();
    clearIdleWatchdog();
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
    target.binaryType = "arraybuffer";
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
      armIdleWatchdog();
    };
    target.onmessage = (event) => {
      if (!isCurrent()) return;
      armIdleWatchdog();
      if (event.data instanceof ArrayBuffer) {
        const frame = parseSftpBinaryFrame(new Uint8Array(event.data));
        const message = frame ? parseSftpIncomingMessage({ ...frame, raw: frame.raw }) : null;
        if (!message) {
          emitFailure({
            code: SftpSocketFailureCode.MalformedMessage,
            message: SftpSocketFailureCode.MalformedMessage
          });
          return;
        }
        deliverMessage(message);
        return;
      }
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
      deliverMessage(message);
    };
    target.onerror = () => {
      if (!isCurrent()) return;
      clearConnectionTimeout();
      clearIdleWatchdog();
      connected.value = false;
      emitFailure({ code: SftpSocketFailureCode.ConnectionFailed, message: SftpSocketFailureCode.ConnectionFailed });
    };
    target.onclose = () => {
      if (!isCurrent()) return;
      clearConnectionTimeout();
      clearIdleWatchdog();
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
