import type { Terminal } from "@xterm/xterm";
import type { Ref } from "vue";
import type { KokoZmodemSendSession, KokoZmodemSession } from "./zmodemTypes";
import { createKokoZmodemSentry } from "./useZmodemSentry";
import { useKokoZmodemTransfer } from "./useZmodemTransfer";
import { useKokoZmodemUpload } from "./useZmodemUpload";

export const useKokoZmodem = () => {
  const { t } = useI18n();
  const toast = useToast();
  const { addErrorToast } = useErrorToast();
  const sentryRef = ref<ReturnType<typeof createKokoZmodemSentry> | null>(null);
  const activeSession = ref<KokoZmodemSession | null>(null);
  let transfer!: ReturnType<typeof useKokoZmodemTransfer>;
  let upload!: ReturnType<typeof useKokoZmodemUpload>;

  const cleanupSession = () => {
    if (activeSession.value) {
      try {
        if (!activeSession.value.has_ended() && !activeSession.value.aborted()) {
          activeSession.value.abort();
        }
      } catch (error) {
        console.warn("Error cleaning up session:", error);
      }
      activeSession.value = null;
    }
    upload.reset();
    transfer.resetTransferState();
  };

  transfer = useKokoZmodemTransfer({
    t,
    toast,
    addErrorToast,
    onCleanup: cleanupSession,
    onActivateSession: (session) => {
      activeSession.value = session;
    },
    onAbortSession: () => activeSession.value?.abort()
  });
  upload = useKokoZmodemUpload({
    t,
    addErrorToast,
    onUpload: ({ session, terminal, file }) => void transfer.uploadFile(session, terminal, file),
    onCancel: cleanupSession
  });

  const openUploadDialog = (session: KokoZmodemSendSession, terminal: Terminal) => {
    activeSession.value = session;
    upload.openUploadDialog(session, terminal);

    session.on("session_end", () => {
      terminal.write("\r\n");
      activeSession.value = null;
      cleanupSession();
    });
  };

  const createSentry = (terminal: Terminal, socket: WebSocket, lastSendTime: Ref<Date>) => {
    const sentry = createKokoZmodemSentry({
      terminal,
      socket,
      lastSendTime,
      onWriteFailure: () => addErrorToast({ title: t("koko.terminal.writeFailed") }),
      shouldWriteToTerminal: () => !sentryRef.value?.get_confirmed_session(),
      onDetect: (detection) => {
        try {
          const session = detection.confirm();
          terminal.write("\r\n");
          if (session.type === "send") openUploadDialog(session, terminal);
          else transfer.handleReceiveSession(session, terminal);
        } catch (error) {
          console.warn("Error in ZMODEM detection:", error);
          cleanupSession();
          activeSession.value?.abort();
        }
      }
    });

    sentryRef.value = sentry;
    return sentry;
  };

  return {
    createSentry,
    cleanupSession,
    uploadOpen: upload.uploadOpen,
    fileInfo: upload.fileInfo,
    confirmUpload: upload.confirmUpload,
    cancelUpload: upload.cancelUpload
  };
};
