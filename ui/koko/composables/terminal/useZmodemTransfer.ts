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
  let uploadController: AbortController | null = null;

  const resetTransferState = () => {
    uploadController?.abort();
    uploadController = null;
    lastPercent = -1;
    messageShown = false;
  };

  const writeUploadProgress = (file: File, transfer: KokoZmodemTransfer, terminal: Terminal) => {
    const detail = transfer.get_details();
    const percent = detail.size === 0 ? 100 : Math.min(100, Math.floor((transfer.get_offset() / detail.size) * 100));
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

    terminal.write(
      `\r${options.t("koko.terminal.downloadProgress", { name: detail.name, size: prettyBytes(total), percent })} `
    );
  };

  const uploadFile = async (session: KokoZmodemSendSession, terminal: Terminal, file: File, socket: WebSocket) => {
    resetTransferState();

    if (file.size >= MAX_TRANSFER_SIZE) {
      options.addErrorToast({
        title: `${options.t("koko.terminal.transferSizeExceeded")}: ${prettyBytes(MAX_TRANSFER_SIZE)}`
      });
      options.onAbortSession();
      return;
    }

    options.onActivateSession(session);
    uploadController = new AbortController();
    let skipped = false;

    try {
      await sendZmodemFiles(session, [file], {
        signal: uploadController.signal,
        socket,
        onOfferResponse: (_currentFile, transfer) => {
          skipped = !transfer;
        },
        onProgress: (currentFile, transfer) => writeUploadProgress(currentFile, transfer, terminal),
        onFileComplete: (currentFile) => {
          options.toast.add({
            title: `${options.t("koko.terminal.transferComplete")}: ${currentFile.name}`,
            color: "success"
          });
        }
      });

      if (skipped) {
        terminal.write(`\r\n${options.t("koko.terminal.uploadSkipped")}\r\n`);
        options.toast.add({ title: options.t("koko.terminal.uploadSkipped"), color: "warning" });
      } else {
        terminal.write("\r\n");
      }
      options.onCleanup();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        options.addErrorToast({ title: error instanceof Error ? error.message : String(error) });
      }
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
          saveZmodemPacketsToDisk(
            packets.map((packet) => new Uint8Array(packet).buffer),
            detail.name
          );
          options.toast.add({ title: `${options.t("koko.terminal.downloaded")}: ${detail.name}`, color: "success" });
          terminal.write("\r\n");
        })
        .catch((error: Error) => {
          options.addErrorToast({ title: String(error) });
          options.onAbortSession();
        });
    });

    session.on("session_end", () => {
      if (session.aborted()) {
        terminal.write(`\r\n${options.t("koko.terminal.downloadFailed")}\r\n`);
      }
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
