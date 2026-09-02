import { useWebSocket } from "@vueuse/core";
import { shallowRef } from "vue";

import { TerminalWebSocketProtocol } from "./protocol";

export function useKokoTerminalTransport() {
  const socket = shallowRef<WebSocket | null>(null);

  function connect(url: string) {
    const { ws } = useWebSocket(url, {
      protocols: [TerminalWebSocketProtocol.Koko],
      autoReconnect: { retries: 5, delay: 3000 }
    });
    if (ws.value) {
      ws.value.binaryType = "arraybuffer";
      socket.value = ws.value;
    }
    return socket.value;
  }

  function close() {
    socket.value?.close();
    socket.value = null;
  }

  function isClosing() {
    const value = socket.value;
    return !value || value.readyState === WebSocket.CLOSING || value.readyState === WebSocket.CLOSED;
  }

  return { socket, connect, close, isClosing };
}
