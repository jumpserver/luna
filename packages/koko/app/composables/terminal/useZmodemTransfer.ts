import type { Terminal } from "@xterm/xterm";
import type { KokoZmodemReceiveSession, KokoZmodemSendSession, KokoZmodemTransfer } from "./zmodemTypes";
import prettyBytes from "pretty-bytes";
import { MAX_TRANSFER_SIZE } from "#koko/utils/config";
import { saveZmodemPacketsToDisk, sendZmodemFiles } from "./zmodemBrowser";

export function useKokoZmodemTransfer(options: {
  t: ReturnType<typeof useI18n>["t"];
  toast: ReturnType<typeof useToast>;
  addErrorToast: ReturnType<typeof useErrorToast>["addErrorToast"];
  onCleanup: () => void;
  onActivateSession: (session: KokoZmodemReceiveSession | KokoZmodemSendSession) => void;
  onAbortSession: () => void;
}) {
  let lastPercent = -1;
  let messageShown = false;

  const resetTransferState = () => {
    lastPercent = -1;
    messageShown = false;
  };

  const writeUploadProgress = (file: File, transfer: KokoZmodemTransfer, terminal: Terminal) => {
    const detail = transfer.get_details();
    const percent = detail.size === 0 ? 100 : Math.min(100, Math.round((transfer.get_offset() / detail.size) * 100));
    if (percent === lastPercent) return;

    const progressLength = Math.floor(percent / 2);
    const progressBar = `${"=".repeat(progressLength)}${" ".repeat(50 - progressLength)}`;
    const message = options.t("koko.terminal.uploadProgress", {
      name: file.name,
      size: prettyBytes(detail.size),
      percent,
      progress: progressBar
    });

    if (percent === 100 && !messageShown) {
      options.toast.add({ title: options.t("koko.terminal.uploadComplete"), color: "info" });
      messageShown = true;
    }

    terminal.write(`\r${message}`);
    lastPercent = percent;
  };

  const writeDownloadProgress = (transfer: KokoZmodemTransfer, terminal: Terminal) => {
    const detail = transfer.get_details();
    const offset = transfer.get_offset();
    const total = detail.size;
    const percent = total === 0 || total === offset ? 100 : Math.round((offset / total) * 100);

    terminal.write(`\r${options.t("koko.terminal.downloadProgress", { name: detail.name, size: prettyBytes(total), percent })} `);
  };

  const uploadFile = async (session: KokoZmodemSendSession, terminal: Terminal, file: File) => {
    resetTransferState();

    if (file.size >= MAX_TRANSFER_SIZE) {
      options.addErrorToast({
        title: `${options.t("koko.terminal.transferSizeExceeded")}: ${prettyBytes(MAX_TRANSFER_SIZE)}`
      });
      options.onCleanup();
      return;
    }

    options.onActivateSession(session);

    try {
      await sendZmodemFiles(session, [file], {
        onProgress: (currentFile, transfer) => writeUploadProgress(currentFile, transfer, terminal),
        onFileComplete: (currentFile) => {
          options.toast.add({
            title: `${options.t("koko.terminal.transferComplete")}: ${currentFile.name}`,
            color: "success"
          });
        }
      });

      options.onCleanup();
    } catch (error) {
      options.addErrorToast({ title: error instanceof Error ? error.message : String(error) });
      options.onCleanup();
      options.onAbortSession();
    }
  };

  const handleReceiveSession = (session: KokoZmodemReceiveSession, terminal: Terminal) => {
    options.onActivateSession(session);

    session.on("offer", (transfer) => {
      const detail = transfer.get_details();

      if (detail.size >= MAX_TRANSFER_SIZE) {
        options.toast.add({
          title: `${options.t("koko.terminal.transferSizeExceeded")}: ${prettyBytes(MAX_TRANSFER_SIZE)}`,
          color: "info"
        });
        transfer.skip();
        return;
      }

      transfer.on("input", (payload: Uint8Array) => {
        writeDownloadProgress(transfer, terminal);
        void payload;
      });

      transfer
        .accept()
        .then((packets) => {
          saveZmodemPacketsToDisk(packets, detail.name);
          options.toast.add({ title: `${options.t("koko.terminal.downloaded")}: ${detail.name}`, color: "success" });
          terminal.write("\r\n");
        })
        .catch((error: Error) => options.addErrorToast({ title: String(error) }));
    });

    session.on("session_end", () => {
      terminal.write("\r\n");
      options.onCleanup();
    });

    void session.start();
  };

  return {
    uploadFile,
    handleReceiveSession,
    resetTransferState
  };
}
