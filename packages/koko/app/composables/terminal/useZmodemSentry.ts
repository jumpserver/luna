import type { Terminal } from "@xterm/xterm";
import type { Ref } from "vue";
import type { KokoZmodemDetection } from "./zmodemTypes";
import Zmodem from "zmodem-ts";
import { buildTerminalInput } from "./envelope";

export function createKokoZmodemSentry(options: {
  terminal: Terminal;
  socket: WebSocket;
  terminalId: Ref<string>;
  lastSendTime: Ref<Date>;
  canSend: () => boolean;
  onDetect: (detection: KokoZmodemDetection) => void;
  onWriteFailure: () => void;
  shouldWriteToTerminal: (octets: number[] | Uint8Array) => boolean;
}) {
  return new Zmodem.Sentry({
    to_terminal: (octets: number[] | Uint8Array) => {
      if (!options.shouldWriteToTerminal(octets)) return;
      try {
        options.terminal.write(octets instanceof Uint8Array ? octets : new Uint8Array(octets));
      } catch {
        options.onWriteFailure();
      }
    },
    sender: (octets: Uint8Array) => {
      if (options.socket.readyState !== WebSocket.OPEN || !options.canSend() || !options.terminalId.value) return;
      options.lastSendTime.value = new Date();
      try {
        options.socket.send(buildTerminalInput(options.terminalId.value, new Uint8Array(octets)));
      } catch {
        options.onWriteFailure();
      }
    },
    on_retract: () => {},
    on_detect: (detection: KokoZmodemDetection) => options.onDetect(detection)
  });
}
