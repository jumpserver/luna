import type { Ref } from "vue";
import { FORMATTER_MESSAGE_TYPE } from "@jumpserver/connectors-core";
import { MaxTimeout } from "#koko/utils/config";
import { formatMessage } from "#koko/utils/terminalUtils";

export function useKokoTerminalHeartbeat(options: {
  socket: () => WebSocket | null;
  lastSendTime: Ref<Date>;
  lastReceiveTime: Ref<Date>;
}) {
  const intervalRef = ref<ReturnType<typeof setInterval> | null>(null);
  let receiveTimedOut = false;

  const stop = () => {
    if (intervalRef.value) clearInterval(intervalRef.value);
    intervalRef.value = null;
  };

  const start = () => {
    stop();
    receiveTimedOut = false;

    intervalRef.value = setInterval(() => {
      const socket = options.socket();
      if (!socket || socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) {
        stop();
        return;
      }
      if (socket.readyState !== WebSocket.OPEN) return;

      const currentDate = new Date();
      const receiveIdleMs = currentDate.getTime() - options.lastReceiveTime.value.getTime();
      if (receiveIdleMs > MaxTimeout * 2) {
        if (!receiveTimedOut) console.warn("Koko WebSocket has not received data", { receiveIdleMs });
        receiveTimedOut = true;
      } else {
        receiveTimedOut = false;
      }

      if (currentDate.getTime() - options.lastSendTime.value.getTime() < 25_000) return;
      socket.send(formatMessage("", FORMATTER_MESSAGE_TYPE.PING, ""));
      options.lastSendTime.value = currentDate;
    }, 25_000);
  };

  return { start, stop, intervalRef };
}
