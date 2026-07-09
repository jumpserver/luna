import type { ChenSocketAction } from "~/chen/types";

export function useChenWebSocket() {
  const pendingSocketActions = reactive<Record<string, ChenSocketAction[]>>({});

  function chenHttpPath(path: string) {
    return withWebSitePrefix(`/chen${path.startsWith("/") ? path : `/${path}`}`);
  }

  function chenWsUrl(path: "session" | "console") {
    const origin = window.location.origin.replace(/^http/, "ws");
    return `${origin}${chenHttpPath(`/ws/${path}`)}`;
  }

  function connectWebSocket(path: "session" | "console", token: string) {
    return new WebSocket(chenWsUrl(path), token);
  }

  function sendJson(socket: WebSocket, payload: unknown) {
    socket.send(JSON.stringify(payload));
  }

  function queueAction(tabId: string, action: ChenSocketAction) {
    pendingSocketActions[tabId] ||= [];
    pendingSocketActions[tabId].push(action);
  }

  function flushQueuedActions(tabId: string, socket: WebSocket) {
    const queue = pendingSocketActions[tabId] || [];
    queue.forEach((action) => sendJson(socket, action));
    pendingSocketActions[tabId] = [];
  }

  function clearQueue(tabId: string) {
    delete pendingSocketActions[tabId];
  }

  function closeSocket(socket?: WebSocket | null) {
    if (!socket) return;
    if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) return;
    socket.close();
  }

  return {
    pendingSocketActions,
    chenHttpPath,
    chenWsUrl,
    clearQueue,
    closeSocket,
    connectWebSocket,
    flushQueuedActions,
    queueAction,
    sendJson
  };
}
