import type { ConnectorSessionContext } from "@jumpserver/connectors-core";
import type { Ref } from "vue";

import type {
  KubernetesTerminalFailure,
  KubernetesTerminalIncomingMessage,
  KubernetesTerminalOutgoingMessage,
  KubernetesTerminalTarget
} from "./protocol";

import { toWsOrigin } from "@jumpserver/connectors-core";
import { getCurrentInstance, onUnmounted, ref, shallowRef } from "vue";

import {
  KubernetesTerminalControlData,
  KubernetesTerminalMessageType,
  KubernetesTerminalSocketFailureCode,
  KubernetesTerminalWebSocketProtocol,
  parseKubernetesTerminalMessage
} from "./protocol";

const SOCKET_OPEN = 1;
const SOCKET_CLOSING = 2;
const SOCKET_CLOSED = 3;

export interface KubernetesTerminalSocketClient {
  connected: Ref<boolean>;
  connect: (context: ConnectorSessionContext) => void;
  close: () => void;
  closeTerminal: (terminalId: string, k8sId: string) => void;
  initializeTerminal: (terminalId: string, k8sId: string, target: KubernetesTerminalTarget, data: string) => void;
  onFailure: (listener: (failure: KubernetesTerminalFailure) => void) => () => void;
  onMessage: (listener: (message: KubernetesTerminalIncomingMessage) => void) => () => void;
  requestTree: () => void;
  resizeTerminal: (terminalId: string, k8sId: string, cols: number, rows: number) => void;
  sendTerminalData: (terminalId: string, k8sId: string, target: KubernetesTerminalTarget, data: string) => void;
  socket: Ref<WebSocket | null>;
}

function websocketUrl(context: ConnectorSessionContext) {
  const params = new URLSearchParams({ token: context.tokenId, type: "k8s" });
  if (context.ticket) params.set("ticket", context.ticket);
  return `${toWsOrigin(context.endpointUrl)}/koko/ws/terminal/?${params}`;
}

export function useKubernetesTerminalSocket(): KubernetesTerminalSocketClient {
  const socket = shallowRef<WebSocket | null>(null);
  const connected = ref(false);
  const messageListeners = new Set<(message: KubernetesTerminalIncomingMessage) => void>();
  const failureListeners = new Set<(failure: KubernetesTerminalFailure) => void>();
  let generation = 0;
  let intentionalClose = false;

  function emitFailure(code: KubernetesTerminalSocketFailureCode, cause?: unknown) {
    const failure = { cause, code };
    for (const listener of failureListeners) listener(failure);
  }

  function send(message: KubernetesTerminalOutgoingMessage) {
    const target = socket.value;
    if (!target || target.readyState !== SOCKET_OPEN) throw new Error("Kubernetes terminal socket is not connected");
    target.send(JSON.stringify(message));
  }

  function close() {
    generation += 1;
    intentionalClose = true;
    connected.value = false;
    const target = socket.value;
    socket.value = null;
    if (target && target.readyState !== SOCKET_CLOSING && target.readyState !== SOCKET_CLOSED) target.close();
  }

  function connect(context: ConnectorSessionContext) {
    close();
    intentionalClose = false;
    const currentGeneration = generation;

    let target: WebSocket;
    try {
      target = new WebSocket(websocketUrl(context), [KubernetesTerminalWebSocketProtocol.Koko]);
    } catch (cause) {
      emitFailure(KubernetesTerminalSocketFailureCode.ConnectionFailed, cause);
      return;
    }
    socket.value = target;

    const isCurrent = () => generation === currentGeneration && socket.value === target;
    target.onopen = () => {
      if (!isCurrent()) return;
      connected.value = true;
    };
    target.onmessage = (event) => {
      if (!isCurrent()) return;
      let raw: unknown;
      try {
        raw = JSON.parse(String(event.data));
      } catch (cause) {
        emitFailure(KubernetesTerminalSocketFailureCode.MalformedMessage, cause);
        return;
      }

      const message = parseKubernetesTerminalMessage(raw);
      if (!message) {
        emitFailure(KubernetesTerminalSocketFailureCode.MalformedMessage, raw);
        return;
      }

      if (message.type === KubernetesTerminalMessageType.Ping) {
        try {
          send({ id: message.id, type: KubernetesTerminalMessageType.Pong, data: KubernetesTerminalControlData.Pong });
        } catch (cause) {
          emitFailure(KubernetesTerminalSocketFailureCode.PingReplyFailed, cause);
        }
        return;
      }

      for (const listener of messageListeners) listener(message);
    };
    target.onerror = () => {
      if (!isCurrent()) return;
      connected.value = false;
      emitFailure(KubernetesTerminalSocketFailureCode.ConnectionFailed);
    };
    target.onclose = () => {
      if (!isCurrent()) return;
      connected.value = false;
      socket.value = null;
      if (!intentionalClose) emitFailure(KubernetesTerminalSocketFailureCode.ConnectionClosed);
    };
  }

  function requestTree() {
    send({ type: KubernetesTerminalMessageType.Tree });
  }

  function initializeTerminal(terminalId: string, k8sId: string, target: KubernetesTerminalTarget, data: string) {
    send({ id: terminalId, k8s_id: k8sId, ...target, type: KubernetesTerminalMessageType.Initialize, data });
  }

  function sendTerminalData(terminalId: string, k8sId: string, target: KubernetesTerminalTarget, data: string) {
    send({ id: terminalId, k8s_id: k8sId, ...target, type: KubernetesTerminalMessageType.Data, data });
  }

  function resizeTerminal(terminalId: string, k8sId: string, cols: number, rows: number) {
    send({
      id: terminalId,
      k8s_id: k8sId,
      namespace: "",
      pod: "",
      container: "",
      resizeData: JSON.stringify({ cols, rows }),
      type: KubernetesTerminalMessageType.Resize
    });
  }

  function closeTerminal(terminalId: string, k8sId: string) {
    send({ id: terminalId, k8s_id: k8sId, type: KubernetesTerminalMessageType.Close });
  }

  function onMessage(listener: (message: KubernetesTerminalIncomingMessage) => void) {
    messageListeners.add(listener);
    return () => messageListeners.delete(listener);
  }

  function onFailure(listener: (failure: KubernetesTerminalFailure) => void) {
    failureListeners.add(listener);
    return () => failureListeners.delete(listener);
  }

  if (getCurrentInstance()) onUnmounted(close);

  return {
    connected,
    close,
    closeTerminal,
    connect,
    initializeTerminal,
    onFailure,
    onMessage,
    requestTree,
    resizeTerminal,
    sendTerminalData,
    socket
  };
}
