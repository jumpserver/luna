import type { ChenPacket, ChenSocketAction } from "~/chen/types";

import { computed, reactive, ref, shallowRef } from "vue";

export type ChenSocketPath = "session" | "console";
export type ChenSocketState = "idle" | "connecting" | "open" | "ready" | "closing" | "closed" | "error" | "timeout";
export type ChenSocketErrorCode
  = | "connect_timeout"
    | "ready_timeout"
    | "pong_timeout"
    | "socket_error"
    | "abnormal_close"
    | "malformed_packet"
    | "packet_handler_error";

export interface ChenSocketError {
  code: ChenSocketErrorCode
  message: string
  closeCode?: number
  closeReason?: string
}

export interface UseChenWebSocketOptions {
  path: ChenSocketPath
  connectTimeoutMs?: number
  readyTimeoutMs?: number
  heartbeatIntervalMs?: number
  pongTimeoutMs?: number
  createSocket?: (url: string, token: string) => WebSocket
  resolveUrl?: (path: ChenSocketPath) => string
  onOpen?: () => void
  onPacket?: (packet: ChenPacket) => void | Promise<void>
  onError?: (error: ChenSocketError) => void
}

const SOCKET_OPEN = 1;
const SOCKET_CLOSING = 2;
const SOCKET_CLOSED = 3;

export function chenHttpPath(path: string) {
  return withWebSitePrefix(`/chen${path.startsWith("/") ? path : `/${path}`}`);
}

export function chenWsUrl(path: ChenSocketPath) {
  const origin = window.location.origin.replace(/^http/, "ws");
  return `${origin}${chenHttpPath(`/ws/${path}`)}`;
}

export function useChenWebSocket(options: UseChenWebSocketOptions) {
  const socket = shallowRef<WebSocket | null>(null);
  const state = ref<ChenSocketState>("idle");
  const error = ref<ChenSocketError | null>(null);
  const pendingQueue = reactive<ChenSocketAction[]>([]);
  const lastPingAt = ref<number | null>(null);
  const lastPongAt = ref<number | null>(null);
  const awaitingPong = ref(false);

  const connectTimeoutMs = options.connectTimeoutMs ?? 30_000;
  const readyTimeoutMs = options.readyTimeoutMs ?? (options.path === "session" ? 120_000 : 30_000);
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 10_000;
  const pongTimeoutMs = options.pongTimeoutMs ?? 30_000;

  let generation = 0;
  let failureNotified = false;
  let connectTimer: ReturnType<typeof setTimeout> | null = null;
  let readyTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let pongTimer: ReturnType<typeof setTimeout> | null = null;

  const isReady = computed(() => state.value === "ready");

  function setState(nextState: ChenSocketState) {
    state.value = nextState;
  }

  function clearConnectTimer() {
    if (connectTimer == null) return;
    clearTimeout(connectTimer);
    connectTimer = null;
  }

  function clearReadyTimer() {
    if (readyTimer == null) return;
    clearTimeout(readyTimer);
    readyTimer = null;
  }

  function clearPongTimer() {
    if (pongTimer == null) return;
    clearTimeout(pongTimer);
    pongTimer = null;
  }

  function stopHeartbeat() {
    if (heartbeatTimer != null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    clearPongTimer();
    awaitingPong.value = false;
  }

  function clearTimers() {
    clearConnectTimer();
    clearReadyTimer();
    stopHeartbeat();
  }

  function clearQueue() {
    pendingQueue.splice(0, pendingQueue.length);
  }

  function detachHandlers(target: WebSocket | null) {
    if (!target) return;
    target.onopen = null;
    target.onmessage = null;
    target.onerror = null;
    target.onclose = null;
  }

  function closeTransport(target: WebSocket | null, code: number, reason: string) {
    if (!target || target.readyState === SOCKET_CLOSING || target.readyState === SOCKET_CLOSED) return;
    try {
      target.close(code, reason.slice(0, 123));
    } catch {
      // The socket may reject close while its handshake is being torn down.
    }
  }

  function reportError(nextError: ChenSocketError, closeCode = 1011) {
    if (failureNotified || state.value === "closing" || state.value === "closed") return;
    failureNotified = true;
    error.value = nextError;
    setState(nextError.code.endsWith("_timeout") ? "timeout" : "error");
    clearTimers();
    clearQueue();

    const target = socket.value;
    socket.value = null;
    detachHandlers(target);
    closeTransport(target, closeCode, nextError.message);
    options.onError?.(nextError);
  }

  function sendImmediately(payload: ChenSocketAction) {
    const target = socket.value;
    if (!target || target.readyState !== SOCKET_OPEN) return false;

    try {
      target.send(JSON.stringify(payload));
      return true;
    } catch (cause) {
      reportError({
        code: "socket_error",
        message: cause instanceof Error ? cause.message : "Failed to send Chen websocket packet"
      });
      return false;
    }
  }

  function flushQueue() {
    if (!isReady.value || socket.value?.readyState !== SOCKET_OPEN) return false;

    const actions = pendingQueue.splice(0, pendingQueue.length);
    for (const action of actions) {
      if (!sendImmediately(action)) return false;
    }
    return true;
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (!isReady.value) return;
      if (!sendImmediately({ type: "ping" })) return;

      lastPingAt.value = Date.now();
      if (awaitingPong.value) return;

      awaitingPong.value = true;
      pongTimer = setTimeout(() => {
        reportError({
          code: "pong_timeout",
          message: `Chen ${options.path} websocket heartbeat timed out`
        });
      }, pongTimeoutMs);
    }, heartbeatIntervalMs);
  }

  function markReady() {
    if (state.value === "ready") return true;
    if (state.value !== "open" || socket.value?.readyState !== SOCKET_OPEN) return false;

    clearReadyTimer();
    setState("ready");
    startHeartbeat();
    return flushQueue();
  }

  function sendWhenReady(payload: ChenSocketAction) {
    if (isReady.value) return sendImmediately(payload);
    if (state.value !== "connecting" && state.value !== "open") return false;
    pendingQueue.push(payload);
    return true;
  }

  function handleMessage(event: MessageEvent) {
    if (typeof event.data !== "string") {
      reportError({
        code: "malformed_packet",
        message: `Chen ${options.path} websocket sent a non-text packet`
      }, 1002);
      return;
    }

    let packet: ChenPacket;
    try {
      packet = JSON.parse(event.data) as ChenPacket;
    } catch {
      reportError({
        code: "malformed_packet",
        message: `Chen ${options.path} websocket sent malformed JSON`
      }, 1002);
      return;
    }

    if (!packet || typeof packet !== "object" || typeof packet.type !== "string") {
      reportError({
        code: "malformed_packet",
        message: `Chen ${options.path} websocket sent an invalid packet`
      }, 1002);
      return;
    }

    if (packet.type === "pong") {
      lastPongAt.value = Date.now();
      awaitingPong.value = false;
      clearPongTimer();
      return;
    }

    try {
      const result = options.onPacket?.(packet);
      if (result instanceof Promise) {
        void result.catch((cause) => {
          reportError({
            code: "packet_handler_error",
            message: cause instanceof Error ? cause.message : "Failed to handle Chen websocket packet"
          });
        });
      }
    } catch (cause) {
      reportError({
        code: "packet_handler_error",
        message: cause instanceof Error ? cause.message : "Failed to handle Chen websocket packet"
      });
    }
  }

  function connect(token: string) {
    close();
    generation += 1;
    const currentGeneration = generation;
    failureNotified = false;
    error.value = null;
    lastPingAt.value = null;
    lastPongAt.value = null;
    clearQueue();
    setState("connecting");

    let target: WebSocket;
    try {
      const resolveUrl = options.resolveUrl || chenWsUrl;
      const createSocket = options.createSocket || ((url: string, protocol: string) => new WebSocket(url, protocol));
      target = createSocket(resolveUrl(options.path), token);
      socket.value = target;
    } catch (cause) {
      reportError({
        code: "socket_error",
        message: cause instanceof Error ? cause.message : `Failed to create Chen ${options.path} websocket`
      });
      return null;
    }

    const isCurrent = () => generation === currentGeneration && socket.value === target;

    target.onopen = () => {
      if (!isCurrent()) return;
      clearConnectTimer();
      setState("open");
      readyTimer = setTimeout(() => {
        reportError({
          code: "ready_timeout",
          message: `Chen ${options.path} websocket did not become ready in time`
        });
      }, readyTimeoutMs);
      options.onOpen?.();
    };

    target.onmessage = (event) => {
      if (!isCurrent()) return;
      handleMessage(event);
    };

    target.onerror = () => {
      if (!isCurrent()) return;
      reportError({
        code: "socket_error",
        message: `Chen ${options.path} websocket error`
      });
    };

    target.onclose = (event) => {
      if (!isCurrent()) return;
      socket.value = null;
      detachHandlers(target);
      reportError({
        code: "abnormal_close",
        message: event.reason || `Chen ${options.path} websocket disconnected`,
        closeCode: event.code,
        closeReason: event.reason
      });
    };

    connectTimer = setTimeout(() => {
      reportError({
        code: "connect_timeout",
        message: `Chen ${options.path} websocket connection timed out`
      });
    }, connectTimeoutMs);

    return target;
  }

  function close() {
    if (state.value === "idle" || state.value === "closed" || state.value === "closing") return;

    setState("closing");
    clearTimers();
    clearQueue();
    failureNotified = true;
    generation += 1;

    const target = socket.value;
    socket.value = null;
    detachHandlers(target);
    closeTransport(target, 1000, "Chen client cleanup");
    setState("closed");
  }

  return {
    awaitingPong,
    error,
    isReady,
    lastPingAt,
    lastPongAt,
    pendingQueue,
    socket,
    state,
    clearQueue,
    close,
    connect,
    flushQueue,
    markReady,
    sendImmediately,
    sendWhenReady
  };
}
