import type {
  FileTransferCommitInput,
  FileTransferEndpoint,
  FileTransferEndpointRef,
  FileTransferPrepareInput,
  FileTransferResumeState,
  FileTransferWriteInput
} from "@jumpserver/connectors-core";

export const WEB_DOWNLOAD_ENDPOINT_ID = "web-download";

interface BrowserDownloadState {
  bytes: Uint8Array<ArrayBuffer>;
  committedBytes: number;
}

/** Browser-only destination endpoint: buffers one file, then starts a native browser download. */
export function useBrowserDownloadTransferEndpoint(options: { label: string }): FileTransferEndpoint {
  const ref: FileTransferEndpointRef = { id: WEB_DOWNLOAD_ENDPOINT_ID, label: options.label };
  const downloads = new Map<string, BrowserDownloadState>();

  return {
    ref,
    isAvailable: () => import.meta.client,

    async prepareTransfer(input: FileTransferPrepareInput): Promise<FileTransferResumeState> {
      const state = downloads.get(input.transferId) || {
        bytes: new Uint8Array(input.size),
        committedBytes: 0
      };
      downloads.set(input.transferId, state);
      return {
        transferId: input.transferId,
        committedBytes: state.committedBytes,
        totalBytes: input.size,
        state: "ready"
      };
    },

    async readChunk() {
      throw new Error("Browser download endpoint cannot send transfers");
    },

    async writeChunk(input: FileTransferWriteInput) {
      const state = downloads.get(input.transferId);
      if (!state || input.offset !== state.committedBytes || input.offset + input.data.length > state.bytes.length) {
        throw new Error("Invalid browser download chunk");
      }
      state.bytes.set(input.data, input.offset);
      state.committedBytes += input.data.length;
      return { committedBytes: state.committedBytes, duplicate: false };
    },

    async getTransferStatus(input): Promise<FileTransferResumeState> {
      const state = downloads.get(input.transferId);
      return {
        transferId: input.transferId,
        committedBytes: state?.committedBytes || 0,
        totalBytes: input.totalBytes,
        state: state ? "ready" : "missing"
      };
    },

    async commitTransfer(input: FileTransferCommitInput): Promise<void> {
      const state = downloads.get(input.transferId);
      if (!state || state.committedBytes !== input.totalBytes) throw new Error("Browser download is incomplete");

      const url = URL.createObjectURL(new Blob([state.bytes]));
      const anchor = document.createElement("a");
      try {
        anchor.href = url;
        anchor.download = input.targetPath.split(/[\\/]/).pop() || "download";
        anchor.hidden = true;
        document.body.append(anchor);
        anchor.click();
        downloads.delete(input.transferId);
      } finally {
        anchor.remove();
        URL.revokeObjectURL(url);
      }
    },

    async cancelTransfer(input): Promise<void> {
      if (input.discard) downloads.delete(input.transferId);
    }
  };
}
