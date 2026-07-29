import type { Terminal } from "@xterm/xterm";
import type { Ref } from "vue";
import type { KokoZmodemDetection } from "./zmodemTypes";
import Zmodem from "zmodem-ts";

export function createKokoZmodemSentry(options: {
  terminal: Terminal;
  socket: WebSocket;
  lastSendTime: Ref<Date>;
  onDetect: (detection: KokoZmodemDetection) => void;
  onWriteFailure: () => void;
  shouldWriteToTerminal: () => boolean;
}) {
  return new Zmodem.Sentry({
    to_terminal: (octets: string) => {
      if (!options.shouldWriteToTerminal()) return;
      try {
        options.terminal.write(octets);
      } catch {
        options.onWriteFailure();
      }
    },
    sender: (octets: Uint8Array) => {
      options.lastSendTime.value = new Date();
      try {
        options.socket.send(new Uint8Array(octets));
      } catch {
        options.onWriteFailure();
      }
    },
    on_retract: () => {},
    on_detect: (detection) => options.onDetect(detection as KokoZmodemDetection)
  });
}
