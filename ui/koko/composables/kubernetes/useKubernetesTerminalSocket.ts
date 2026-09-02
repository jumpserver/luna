import type { ConnectorSessionContext } from "@jumpserver/connectors-core";
import type { Ref } from "vue";
import type { KokoMcpCancelFrame, KokoMcpFrame, KokoMcpRequestFrame } from "../agent/types";

import type {
  KubernetesTerminalFailure,
  KubernetesTerminalIncomingMessage,
  KubernetesTerminalOutgoingMessage,
  KubernetesTerminalTarget
} from "./protocol";

import { toWsOrigin } from "@jumpserver/connectors-core";
import { getCurrentInstance, onUnmounted, ref, shallowRef } from "vue";
import { kokoMcpWireMessage, parseKokoMcpFrame } from "../agent/types";

import {
  buildJSONEnvelope,
  buildTerminalInput,
  createRequestId,
  ENVELOPE_ERROR,
  ENVELOPE_TERMINAL_CLOSE,
  ENVELOPE_TERMINAL_COMMAND,
  ENVELOPE_TERMINAL_CREATE,
  ENVELOPE_TERMINAL_OUTPUT,
  parseEnvelope,
  parseJSONPayload,
  parseTerminalPayload
} from "../terminal/envelope";

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
const TERMINAL_RESIZE = "TERMINAL_RESIZE";

interface TerminalCommandEnvelope {
  terminalId?: number;
  command: string;
  params?: Record<string, unknown>;
  requestId?: string;
}

export interface KubernetesTerminalSocketClient {
  connected: Ref<boolean>;
  connect: (context: ConnectorSessionContext) => void;
  close: () => void;
  closeTerminal: (terminalId: string, k8sId: string) => void;
  initializeTerminal: (terminalId: string, k8sId: string, target: KubernetesTerminalTarget, data: string) => void;
  onFailure: (listener: (failure: KubernetesTerminalFailure) => void) => () => void;
  onMcpMessage: (listener: (message: KubernetesTerminalMcpMessage) => void) => () => void;
  onMessage: (listener: (message: KubernetesTerminalIncomingMessage) => void) => () => void;
  requestTree: () => void;
  resizeTerminal: (terminalId: string, k8sId: string, cols: number, rows: number) => void;
  sendMcpFrame: (k8sId: string, frame: KokoMcpRequestFrame | KokoMcpCancelFrame) => void;
  sendTerminalData: (terminalId: string, k8sId: string, target: KubernetesTerminalTarget, data: string) => void;
  socket: Ref<WebSocket | null>;
  terminalIdFor: (k8sId: string) => number | null;
}

export interface KubernetesTerminalMcpMessage {
  frame: KokoMcpFrame;
  k8sId: string;
  terminalId: number;
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
  const mcpMessageListeners = new Set<(message: KubernetesTerminalMcpMessage) => void>();
  const failureListeners = new Set<(failure: KubernetesTerminalFailure) => void>();
  const terminalIdByK8sId = new Map<string, number>();
  const k8sIdByTerminalId = new Map<number, string>();
  const k8sIdByRequestId = new Map<string, string>();
  let generation = 0;
  let intentionalClose = false;
  let transport: "unknown" | "json" | "envelope" = "unknown";

  function emitFailure(code: KubernetesTerminalSocketFailureCode, cause?: unknown) {
    const failure = { cause, code };
    for (const listener of failureListeners) listener(failure);
  }

  function sendLegacy(message: KubernetesTerminalOutgoingMessage) {
    const target = socket.value;
    if (!target || target.readyState !== SOCKET_OPEN) throw new Error("Kubernetes terminal socket is not connected");
    target.send(JSON.stringify(message));
  }

  function sendEnvelope(payload: Uint8Array) {
    const target = socket.value;
    if (!target || target.readyState !== SOCKET_OPEN) throw new Error("Kubernetes terminal socket is not connected");
    target.send(payload.buffer as ArrayBuffer);
  }

  function sendCommand(message: KubernetesTerminalOutgoingMessage, terminalId = 0, command: string = message.type) {
    if (transport === "json") {
      sendLegacy(message);
      return;
    }
    sendEnvelope(
      buildJSONEnvelope(ENVELOPE_TERMINAL_COMMAND, {
        terminalId,
        command,
        params: message,
        timestamp: Date.now()
      })
    );
  }

  function decodeEnvelope(data: ArrayBuffer | Uint8Array) {
    const frame = parseEnvelope(data);
    if (frame.type === ENVELOPE_TERMINAL_OUTPUT) {
      const payload = parseTerminalPayload(frame.payload);
      return {
        type: KubernetesTerminalMessageType.Binary,
        terminalId: payload.terminalId,
        k8s_id: k8sIdByTerminalId.get(payload.terminalId) || "",
        raw: payload.data
      };
    }
    if (frame.type === ENVELOPE_TERMINAL_COMMAND) {
      const command = parseJSONPayload<TerminalCommandEnvelope>(frame.payload);
      return {
        ...(command.params || {}),
        type: command.command,
        terminalId: command.terminalId || 0,
        requestId: command.requestId || ""
      };
    }
    if (frame.type === ENVELOPE_ERROR) {
      const error = parseJSONPayload<Record<string, unknown>>(frame.payload);
      const terminalId = Number(error.terminalId) || 0;
      return {
        type: KubernetesTerminalMessageType.Error,
        err: String(error.message || "Kubernetes terminal error"),
        terminalId,
        requestId: String(error.requestId || ""),
        k8s_id: k8sIdByTerminalId.get(terminalId) || ""
      };
    }
    if (frame.type === ENVELOPE_TERMINAL_CLOSE) {
      const closed = parseJSONPayload<Record<string, unknown>>(frame.payload);
      const terminalId = Number(closed.terminalId) || 0;
      return {
        type: KubernetesTerminalMessageType.Close,
        data: String(closed.reason || ""),
        terminalId,
        requestId: String(closed.requestId || ""),
        k8s_id: k8sIdByTerminalId.get(terminalId) || ""
      };
    }
    throw new Error(`Unsupported Kubernetes terminal envelope type: ${frame.type}`);
  }

  function resetTerminalIds() {
    terminalIdByK8sId.clear();
    k8sIdByTerminalId.clear();
    k8sIdByRequestId.clear();
  }

  function close() {
    generation += 1;
    intentionalClose = true;
    connected.value = false;
    const target = socket.value;
    socket.value = null;
    transport = "unknown";
    resetTerminalIds();
    if (target && target.readyState !== SOCKET_CLOSING && target.readyState !== SOCKET_CLOSED) target.close();
  }

  function connect(context: ConnectorSessionContext) {
    close();
    intentionalClose = false;
    const currentGeneration = generation;

    let target: WebSocket;
    try {
      target = new WebSocket(websocketUrl(context), [KubernetesTerminalWebSocketProtocol.Koko]);
      target.binaryType = "arraybuffer";
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
        if (typeof event.data === "string") {
          transport = "json";
          raw = JSON.parse(event.data);
        } else if (event.data instanceof ArrayBuffer) {
          transport = "envelope";
          raw = decodeEnvelope(event.data);
        } else {
          throw new TypeError("Unsupported Kubernetes WebSocket message type");
        }
      } catch (cause) {
        emitFailure(KubernetesTerminalSocketFailureCode.MalformedMessage, cause);
        return;
      }

      if (
        raw &&
        typeof raw === "object" &&
        (raw as Record<string, unknown>).type === KubernetesTerminalMessageType.Created
      ) {
        const created = raw as { terminalId?: unknown; requestId?: unknown };
        const terminalId = Number(created.terminalId) || 0;
        const requestId = String(created.requestId || "");
        const k8sId = k8sIdByRequestId.get(requestId);
        if (terminalId && k8sId) {
          terminalIdByK8sId.set(k8sId, terminalId);
          k8sIdByTerminalId.set(terminalId, k8sId);
          k8sIdByRequestId.delete(requestId);
        }
      }

      if (raw && typeof raw === "object") {
        const routed = raw as Record<string, unknown>;
        const terminalId = Number(routed.terminalId) || 0;
        const k8sId = String(routed.k8s_id || "");
        if (terminalId && k8sId) {
          terminalIdByK8sId.set(k8sId, terminalId);
          k8sIdByTerminalId.set(terminalId, k8sId);
        }

        const frame = parseKokoMcpFrame(raw);
        if (frame) {
          const routedK8sId = k8sId || k8sIdByTerminalId.get(terminalId) || "";
          if (!terminalId || !routedK8sId) {
            emitFailure(KubernetesTerminalSocketFailureCode.MalformedMessage, raw);
            return;
          }
          for (const listener of mcpMessageListeners) {
            listener({ frame, k8sId: routedK8sId, terminalId });
          }
          return;
        }
      }

      const message = parseKubernetesTerminalMessage(raw);
      if (!message) {
        emitFailure(KubernetesTerminalSocketFailureCode.MalformedMessage, raw);
        return;
      }

      if (message.type === KubernetesTerminalMessageType.Ping) {
        try {
          sendCommand({
            id: message.id,
            type: KubernetesTerminalMessageType.Pong,
            data: KubernetesTerminalControlData.Pong
          });
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
    sendCommand({ type: KubernetesTerminalMessageType.Tree });
  }

  function initializeTerminal(terminalId: string, k8sId: string, target: KubernetesTerminalTarget, data: string) {
    if (transport === "json") {
      sendLegacy({ id: terminalId, k8s_id: k8sId, ...target, type: KubernetesTerminalMessageType.Initialize, data });
      return;
    }
    const size = JSON.parse(data) as { cols: number; rows: number; code?: string };
    const requestId = createRequestId("k8s");
    k8sIdByRequestId.set(requestId, k8sId);
    sendEnvelope(
      buildJSONEnvelope(ENVELOPE_TERMINAL_CREATE, {
        requestId,
        params: {
          cols: size.cols,
          rows: size.rows,
          code: size.code || "",
          type: "kubernetes",
          kubernetes: { id: k8sId, ...target }
        }
      })
    );
  }

  function sendTerminalData(terminalId: string, k8sId: string, target: KubernetesTerminalTarget, data: string) {
    if (transport === "json") {
      sendLegacy({ id: terminalId, k8s_id: k8sId, ...target, type: KubernetesTerminalMessageType.Data, data });
      return;
    }
    const serverTerminalId = terminalIdByK8sId.get(k8sId);
    if (serverTerminalId) sendEnvelope(buildTerminalInput(serverTerminalId, data));
  }

  function resizeTerminal(terminalId: string, k8sId: string, cols: number, rows: number) {
    const message: KubernetesTerminalOutgoingMessage = {
      id: terminalId,
      k8s_id: k8sId,
      namespace: "",
      pod: "",
      container: "",
      resizeData: JSON.stringify({ cols, rows }),
      type: KubernetesTerminalMessageType.Resize
    };
    const serverTerminalId = terminalIdByK8sId.get(k8sId);
    if (transport === "json") sendLegacy(message);
    else if (serverTerminalId) {
      sendEnvelope(
        buildJSONEnvelope(ENVELOPE_TERMINAL_COMMAND, {
          terminalId: serverTerminalId,
          command: TERMINAL_RESIZE,
          params: {
            id: terminalId,
            type: TERMINAL_RESIZE,
            data: JSON.stringify({ cols, rows }),
            terminalId: serverTerminalId
          },
          timestamp: Date.now()
        })
      );
    }
  }

  function closeTerminal(terminalId: string, k8sId: string) {
    if (transport === "json") {
      sendLegacy({ id: terminalId, k8s_id: k8sId, type: KubernetesTerminalMessageType.Close });
      return;
    }
    const serverTerminalId = terminalIdByK8sId.get(k8sId);
    if (!serverTerminalId) return;
    sendEnvelope(buildJSONEnvelope(ENVELOPE_TERMINAL_CLOSE, { terminalId: serverTerminalId }));
    terminalIdByK8sId.delete(k8sId);
    k8sIdByTerminalId.delete(serverTerminalId);
  }

  function sendMcpFrame(k8sId: string, frame: KokoMcpRequestFrame | KokoMcpCancelFrame) {
    const terminalId = terminalIdByK8sId.get(k8sId);
    if (!terminalId) throw new Error("Kubernetes terminal resource is unavailable");
    const message = kokoMcpWireMessage(frame);
    if (transport === "json") {
      const target = socket.value;
      if (!target || target.readyState !== SOCKET_OPEN) throw new Error("Kubernetes terminal socket is not connected");
      target.send(JSON.stringify({ ...message, terminalId }));
      return;
    }
    sendEnvelope(
      buildJSONEnvelope(ENVELOPE_TERMINAL_COMMAND, {
        terminalId,
        command: frame.type,
        params: message,
        timestamp: Date.now()
      })
    );
  }

  function onMessage(listener: (message: KubernetesTerminalIncomingMessage) => void) {
    messageListeners.add(listener);
    return () => messageListeners.delete(listener);
  }

  function onMcpMessage(listener: (message: KubernetesTerminalMcpMessage) => void) {
    mcpMessageListeners.add(listener);
    return () => mcpMessageListeners.delete(listener);
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
    onMcpMessage,
    onMessage,
    requestTree,
    resizeTerminal,
    sendMcpFrame,
    sendTerminalData,
    socket,
    terminalIdFor: (k8sId) => terminalIdByK8sId.get(k8sId) || null
  };
}
