import type { Terminal } from "@xterm/xterm";
import type { Ref } from "vue";
import type { KokoZmodemSentry } from "./zmodemTypes";
import { writeBufferToTerminal } from "#koko/utils/terminalUtils";

export function useKokoTerminalBinaryHandler(options: {
  terminalRef: Ref<Terminal | null>;
  sentryRef: Ref<KokoZmodemSentry | null>;
  abortActiveSession: () => void;
  addErrorToast: ReturnType<typeof useErrorToast>["addErrorToast"];
  t: ReturnType<typeof useI18n>["t"];
}) {
  const handleBinaryMessage = (payload: ArrayBufferLike | Uint8Array) => {
    if (!options.terminalRef.value || !options.sentryRef.value) return;
    const bytes = payload instanceof Uint8Array ? Uint8Array.from(payload) : new Uint8Array(payload);

    try {
      options.sentryRef.value.consume(bytes);
    } catch {
      if (options.sentryRef.value.get_confirmed_session()) {
        options.abortActiveSession();
        options.addErrorToast({ title: options.t("koko.terminal.fileTransferInterrupted") });
      } else {
        writeBufferToTerminal(true, false, options.terminalRef.value, bytes, options.addErrorToast, "");
      }
    }
  };

  return { handleBinaryMessage };
}
