import type { Terminal } from "@xterm/xterm";
import type { Ref } from "vue";
import type { KokoZmodemSendSession, KokoZmodemSession } from "./zmodemTypes";
import { buildTerminalInput } from "./envelope";
import { createKokoZmodemSentry } from "./useZmodemSentry";
import { useKokoZmodemTransfer } from "./useZmodemTransfer";
import { useKokoZmodemUpload } from "./useZmodemUpload";

export const useKokoZmodem = () => {
  const DRAIN_FALLBACK_TIMEOUT = 10_000;
  const { t } = useI18n();
  const toast = useToast();
  const { addErrorToast } = useErrorToast();
  const sentryRef = ref<ReturnType<typeof createKokoZmodemSentry> | null>(null);
  const activeSession = ref<KokoZmodemSession | null>(null);
  const draining = ref(false);
  let drainTimer: ReturnType<typeof setTimeout> | null = null;
  let activeTerminalId: Ref<string> | null = null;
  let transfer!: ReturnType<typeof useKokoZmodemTransfer>;
  let upload!: ReturnType<typeof useKokoZmodemUpload>;

  const stopDraining = () => {
    draining.value = false;
    if (drainTimer) clearTimeout(drainTimer);
    drainTimer = null;
  };

  const startDraining = () => {
    draining.value = true;
    if (drainTimer) clearTimeout(drainTimer);
    drainTimer = setTimeout(stopDraining, DRAIN_FALLBACK_TIMEOUT);
  };

  const finishDraining = () => {
    if (!draining.value) return;
    if (drainTimer) clearTimeout(drainTimer);
    drainTimer = setTimeout(stopDraining, DRAIN_FALLBACK_TIMEOUT);
  };

  const isReadableTerminalText = (octets: number[] | Uint8Array) => {
    const bytes = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
    if (bytes.length >= 4 && bytes[0] === 0x2a && bytes[1] === 0x2a && bytes[2] === 0x18 && bytes[3] === 0x42) {
      return false;
    }
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const visibleLength = Array.from(text).filter((character) => character >= " " && character !== "\x7F").length;
      return (text.includes("\r") || text.includes("\n")) && visibleLength >= 4 && visibleLength / text.length >= 0.6;
    } catch {
      return false;
    }
  };

  const cleanupSession = () => {
    activeSession.value = null;
    activeTerminalId = null;
    upload.reset();
    transfer.resetTransferState();
  };

  const abortActiveSession = () => {
    startDraining();
    const session = activeSession.value;
    if (session) {
      try {
        if (!session.has_ended() && !session.aborted()) session.abort();
      } catch (error) {
        console.warn("Error aborting ZMODEM session:", error);
      }
    }
    cleanupSession();
  };

  const cancelSendSession = (session: KokoZmodemSendSession, socket: WebSocket, terminalId: Ref<string>) => {
    if (socket.readyState === WebSocket.OPEN && terminalId.value) {
      socket.send(buildTerminalInput(Number(terminalId.value), String.fromCharCode(3)));
    }
    if (activeSession.value === session) abortActiveSession();
  };

  transfer = useKokoZmodemTransfer({
    t,
    toast,
    addErrorToast,
    onCleanup: cleanupSession,
    onActivateSession: (session) => {
      activeSession.value = session;
    },
    onAbortSession: abortActiveSession
  });
  upload = useKokoZmodemUpload({
    t,
    addErrorToast,
    onUpload: ({ session, terminal, file, socket }) => void transfer.uploadFile(session, terminal, file, socket),
    onCancel: ({ session, socket }) => {
      if (activeTerminalId) cancelSendSession(session, socket, activeTerminalId);
    }
  });

  const openUploadDialog = (
    session: KokoZmodemSendSession,
    terminal: Terminal,
    socket: WebSocket,
    terminalId: Ref<string>
  ) => {
    activeSession.value = session;
    activeTerminalId = terminalId;
    upload.openUploadDialog(session, terminal, socket);

    session.on("session_end", () => {
      setTimeout(() => {
        if (activeSession.value === session) cleanupSession();
      }, 0);
    });
  };

  const createSentry = (
    terminal: Terminal,
    socket: WebSocket,
    terminalId: Ref<string>,
    lastSendTime: Ref<Date>,
    canSend: () => boolean
  ) => {
    const sentry = createKokoZmodemSentry({
      terminal,
      socket,
      terminalId,
      lastSendTime,
      canSend,
      onWriteFailure: () => addErrorToast({ title: t("koko.terminal.writeFailed") }),
      shouldWriteToTerminal: (octets) => {
        if (draining.value) {
          if (!isReadableTerminalText(octets)) return false;
          stopDraining();
        }
        return !sentryRef.value?.get_confirmed_session();
      },
      onDetect: (detection) => {
        try {
          const session = detection.confirm();
          terminal.write("\r\n");
          if (session.type === "send") openUploadDialog(session, terminal, socket, terminalId);
          else transfer.handleReceiveSession(session, terminal);
        } catch (error) {
          console.warn("Error in ZMODEM detection:", error);
          abortActiveSession();
        }
      }
    });

    sentryRef.value = sentry;
    return sentry;
  };

  return {
    createSentry,
    abortActiveSession,
    finishDraining,
    isActiveSession: () => Boolean(activeSession.value),
    uploadOpen: upload.uploadOpen,
    fileInfo: upload.fileInfo,
    confirmUpload: upload.confirmUpload,
    cancelUpload: upload.cancelUpload
  };
};
