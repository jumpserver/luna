import type { Terminal } from "@xterm/xterm";
import type { Detection, Transfer, ZmodemSession } from "nora-zmodemjs/src/zmodem_browser";
import type { Ref } from "vue";

import ZmodemBrowser from "nora-zmodemjs/src/zmodem_browser";
import prettyBytes from "pretty-bytes";

import { MAX_TRANSFER_SIZE } from "~/koko/utils/config";

const fileInfo = ref<File | null>(null);
const sentryRef = ref<ZmodemBrowser.Sentry | null>(null);
const activeSession = ref<ZmodemSession | null>(null);
const uploadOpen = ref(false);
let pendingSession: ZmodemSession | null = null;
let pendingTerminal: Terminal | null = null;
let lastPercent = -1;
let messageShown = false;

export const useKokoZmodem = () => {
  const { t } = useI18n();
  const toast = useToast();
  const { addErrorToast } = useErrorToast();

  const cleanupSession = () => {
    if (activeSession.value) {
      try {
        activeSession.value.close();
      } catch (error) {
        console.warn("Error cleaning up session:", error);
      }
      activeSession.value = null;
    }
    lastPercent = -1;
    messageShown = false;
    uploadOpen.value = false;
    pendingSession = null;
    pendingTerminal = null;
    fileInfo.value = null;
  };

  const terminalProgress = (transfer: Transfer, terminal: Terminal) => {
    const detail = transfer.get_details();
    const offset = transfer.get_offset();
    const total = detail.size;
    const percent = total === 0 || total === offset ? 100 : Math.round((offset / total) * 100);
    terminal.write(`\r${t("Download") || "Download"} ${detail.name}: ${prettyBytes(total)} ${percent}% `);
  };

  const handleUpload = (session: ZmodemSession, terminal: Terminal) => {
    if (!fileInfo.value) return;

    lastPercent = -1;
    messageShown = false;

    const { size } = fileInfo.value;
    if (size >= MAX_TRANSFER_SIZE) {
      addErrorToast({ title: `${t("ExceedTransferSize") || "Exceeds limit"}: ${prettyBytes(MAX_TRANSFER_SIZE)}` });
      cleanupSession();
      return;
    }

    ZmodemBrowser.Browser.send_files(session, [fileInfo.value], {
      on_offer_response: (_obj, transfer) => {
        if (!transfer) return;
        const detail = transfer.get_details();
        transfer.on("send_progress", (percent: number) => {
          const rounded = Math.round(percent);
          if (rounded === lastPercent) return;

          let progressBar = "";
          const progressLength = Math.floor(rounded / 2);
          for (let i = 0; i < progressLength; i++) progressBar += "=";
          for (let i = progressLength; i < 50; i++) progressBar += " ";

          const msg = `${t("Upload") || "Upload"} ${detail.name}: ${prettyBytes(detail.size)} ${rounded}% [${progressBar}]`;
          if (rounded === 100 && !messageShown) {
            toast.add({ title: t("UploadEnd") || "Upload complete", color: "info" });
            messageShown = true;
          }
          terminal.write(`\r${msg}`);
          lastPercent = rounded;
        });
      },
      on_file_complete: (obj: { name: string }) => {
        toast.add({ title: `${t("EndFileTransfer") || "Transfer complete"}: ${obj.name}`, color: "success" });
      }
    })
      .then(() => cleanupSession())
      .catch((error: Error) => {
        addErrorToast({ title: error.message });
        cleanupSession();
        activeSession.value?.abort();
      });
  };

  const openUploadDialog = (session: ZmodemSession, terminal: Terminal) => {
    activeSession.value = session;
    pendingSession = session;
    pendingTerminal = terminal;
    uploadOpen.value = true;

    session.on("session_end", () => {
      terminal.write("\r\n");
      cleanupSession();
    });
  };

  const confirmUpload = () => {
    if (!fileInfo.value || !pendingSession || !pendingTerminal) {
      addErrorToast({ title: t("MustSelectOneFile") || "Select a file" });
      return;
    }
    uploadOpen.value = false;
    handleUpload(pendingSession, pendingTerminal);
  };

  const cancelUpload = () => {
    pendingTerminal?.write("\r\n");
    cleanupSession();
  };

  const handleReceiveSession = (session: ZmodemSession, terminal: Terminal) => {
    activeSession.value = session;

    session.on("offer", (transfer: Transfer) => {
      const buffer: Uint8Array[] = [];
      const detail = transfer.get_details();

      if (detail.size >= MAX_TRANSFER_SIZE) {
        toast.add({ title: `${t("ExceedTransferSize") || "Exceeds limit"}: ${prettyBytes(MAX_TRANSFER_SIZE)}`, color: "info" });
        transfer.skip();
        return;
      }

      transfer.on("input", (payload: Uint8Array) => {
        terminalProgress(transfer, terminal);
        buffer.push(new Uint8Array(payload));
      });

      transfer.accept()
        .then(() => {
          ZmodemBrowser.Browser.save_to_disk(buffer, detail.name);
          toast.add({ title: `${t("DownloadSuccess") || "Downloaded"}: ${detail.name}`, color: "success" });
          terminal.write("\r\n");
        })
        .catch((error: Error) => addErrorToast({ title: String(error) }));
    });

    session.on("session_end", () => {
      terminal.write("\r\n");
      cleanupSession();
    });

    session.start();
  };

  const createSentry = (terminal: Terminal, socket: WebSocket, lastSendTime: Ref<Date>) => {
    const sentry = new ZmodemBrowser.Sentry({
      to_terminal: (octets: string) => {
        try {
          if (sentryRef.value && !sentryRef.value.get_confirmed_session()) terminal.write(octets);
        } catch {
          addErrorToast({ title: t("Failed to write to terminal") || "Write failed" });
        }
      },
      sender: (octets: Uint8Array) => {
        try {
          lastSendTime.value = new Date();
          socket.send(new Uint8Array(octets));
        } catch {
          console.warn("Failed to send octets via WebSocket");
        }
      },
      on_retract: () => {},
      on_detect: (detection: Detection) => {
        try {
          const session = detection.confirm();
          terminal.write("\r\n");
          if (session.type === "send") openUploadDialog(session, terminal);
          else handleReceiveSession(session, terminal);
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
    uploadOpen,
    fileInfo,
    confirmUpload,
    cancelUpload
  };
};
