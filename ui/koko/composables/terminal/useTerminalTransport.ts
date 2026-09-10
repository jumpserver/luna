import { shallowRef } from "vue";

import { TerminalWebSocketProtocol } from "./protocol";

export function useKokoTerminalTransport() {
  const socket = shallowRef<WebSocket | null>(null);

  function connect(url: string) {
    // The terminal owns cleanup; reconnecting needs a fresh SSH token and initialization.
    socket.value = new WebSocket(url, [TerminalWebSocketProtocol.Koko]);
    socket.value.binaryType = "arraybuffer";
    return socket.value;
  }

  function close() {
    socket.value?.close(1000, "luna:client_close");
    socket.value = null;
  }

  function isClosing() {
    const value = socket.value;
    return !value || value.readyState === WebSocket.CLOSING || value.readyState === WebSocket.CLOSED;
  }

  return { socket, connect, close, isClosing };
}
