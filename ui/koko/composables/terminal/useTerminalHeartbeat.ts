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

  const stop = () => {
    if (intervalRef.value) clearInterval(intervalRef.value);
    intervalRef.value = null;
  };

  const start = () => {
    stop();

    intervalRef.value = setInterval(() => {
      const socket = options.socket();
      if (!socket || socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) {
        stop();
        return;
      }

      const currentDate = new Date();
      if (options.lastReceiveTime.value.getTime() - currentDate.getTime() > MaxTimeout) {
        console.error("More than 30 seconds do not receive data");
      }

      const pingTimeout = currentDate.getTime() - options.lastSendTime.value.getTime() - MaxTimeout;
      if (pingTimeout < 0) return;
      socket.send(formatMessage("", FORMATTER_MESSAGE_TYPE.PING, ""));
    }, 25_000);
  };

  return { start, stop, intervalRef };
}
