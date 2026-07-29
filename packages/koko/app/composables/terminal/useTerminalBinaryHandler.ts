import type { Terminal } from "@xterm/xterm";
import type { Ref } from "vue";
import type { KokoZmodemSentry } from "./zmodemTypes";
import { writeBufferToTerminal } from "#koko/utils/terminalUtils";

export function useKokoTerminalBinaryHandler(options: {
  terminalRef: Ref<Terminal | null>;
  sentryRef: Ref<KokoZmodemSentry | null>;
  zmodemTransferStatus: Ref<boolean>;
  addErrorToast: ReturnType<typeof useErrorToast>["addErrorToast"];
  t: ReturnType<typeof useI18n>["t"];
}) {
  const handleBinaryMessage = (payload: ArrayBufferLike) => {
    if (!options.terminalRef.value || !options.sentryRef.value) return;

    if (options.zmodemTransferStatus.value) {
      try {
        options.sentryRef.value.consume(payload);
      } catch {
        if (options.sentryRef.value.get_confirmed_session()) {
          options.sentryRef.value.get_confirmed_session()?.abort();
          options.addErrorToast({ title: options.t("koko.terminal.fileTransferInterrupted") });
        }
      }
      return;
    }

    writeBufferToTerminal(
      true,
      false,
      options.terminalRef.value,
      payload,
      options.addErrorToast,
      options.t("koko.errors.zmodemBlocked")
    );
  };

  return { handleBinaryMessage };
}
