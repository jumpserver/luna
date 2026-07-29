import type { Terminal } from "@xterm/xterm";
import type { Ref } from "vue";
import type { KokoZmodemSendSession } from "./zmodemTypes";

interface UploadExecutionContext {
  session: KokoZmodemSendSession;
  terminal: Terminal;
  file: File;
}

export function useKokoZmodemUpload(options: {
  t: ReturnType<typeof useI18n>["t"];
  addErrorToast: ReturnType<typeof useErrorToast>["addErrorToast"];
  onUpload: (context: UploadExecutionContext) => void;
  onCancel: () => void;
}) {
  const uploadOpen = ref(false);
  const fileInfo = ref<File | null>(null);
  const pendingSession: Ref<KokoZmodemSendSession | null> = ref(null);
  const pendingTerminal: Ref<Terminal | null> = ref(null);

  const reset = () => {
    uploadOpen.value = false;
    fileInfo.value = null;
    pendingSession.value = null;
    pendingTerminal.value = null;
  };

  const openUploadDialog = (session: KokoZmodemSendSession, terminal: Terminal) => {
    pendingSession.value = session;
    pendingTerminal.value = terminal;
    uploadOpen.value = true;
  };

  const confirmUpload = () => {
    if (!fileInfo.value || !pendingSession.value || !pendingTerminal.value) {
      options.addErrorToast({ title: options.t("koko.terminal.selectFile") });
      return;
    }

    uploadOpen.value = false;
    options.onUpload({
      session: pendingSession.value,
      terminal: pendingTerminal.value,
      file: fileInfo.value
    });
  };

  const cancelUpload = () => {
    pendingTerminal.value?.write("\r\n");
    options.onCancel();
  };

  return {
    uploadOpen,
    fileInfo,
    openUploadDialog,
    confirmUpload,
    cancelUpload,
    reset
  };
}
