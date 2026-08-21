import type {
  FileTransferChunk,
  FileTransferEndpoint,
  FileTransferEndpointRef,
  FileTransferPrepareInput,
  FileTransferResumeState,
  FileTransferWriteInput
} from "~/shared/file-transfer/types";

export const WEB_UPLOAD_ENDPOINT_ID = "web-upload";
const STAGED_ROOT = "/web-upload";

async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data.slice());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface BrowserStagedUpload {
  sourcePath: string;
  entries: Array<{ name: string; size: string }>;
}

/**
 * Browser-only source endpoint: stages `File` objects in memory so Transfer Center
 * can stream them to remote SFTP the same way as desktop local→remote.
 * It is not a download destination (web has no local FS pane).
 */
export function useBrowserUploadTransferEndpoint(options: { label: string }): FileTransferEndpoint & {
  stageFiles: (files: File[]) => BrowserStagedUpload;
  clearStaged: () => void;
} {
  const ref: FileTransferEndpointRef = { id: WEB_UPLOAD_ENDPOINT_ID, label: options.label };
  const staged = new Map<string, File>();

  function stageFiles(files: File[]): BrowserStagedUpload {
    staged.clear();
    const entries: Array<{ name: string; size: string }> = [];
    for (const file of files) {
      if (!file?.name) continue;
      const path = `${STAGED_ROOT}/${file.name}`.replace(/\/+/g, "/");
      staged.set(path, file);
      entries.push({ name: file.name, size: String(file.size) });
    }
    return { sourcePath: STAGED_ROOT, entries };
  }

  function clearStaged() {
    staged.clear();
  }

  return {
    ref,
    stageFiles,
    clearStaged,
    isAvailable: () => true,

    async prepareTransfer(_input: FileTransferPrepareInput): Promise<FileTransferResumeState> {
      // Web upload pane is source-only.
      throw new Error("Browser upload endpoint cannot receive transfers");
    },

    async readChunk(input: {
      transferId: string;
      path: string;
      offset: number;
      length: number;
    }): Promise<FileTransferChunk> {
      const file = staged.get(input.path);
      if (!file) throw new Error(`Staged browser file not found: ${input.path}`);
      const end = Math.min(file.size, input.offset + input.length);
      const buffer = new Uint8Array(await file.slice(input.offset, end).arrayBuffer());
      return {
        offset: input.offset,
        data: buffer,
        sha256: await sha256Hex(buffer),
        eof: end >= file.size
      };
    },

    async writeChunk(_input: FileTransferWriteInput) {
      throw new Error("Browser upload endpoint cannot receive transfers");
    },

    async getTransferStatus(input: {
      transferId: string;
      targetPath: string;
      totalBytes: number;
    }): Promise<FileTransferResumeState> {
      return {
        transferId: input.transferId,
        committedBytes: 0,
        totalBytes: input.totalBytes,
        state: "missing"
      };
    },

    async commitTransfer(): Promise<void> {
      throw new Error("Browser upload endpoint cannot receive transfers");
    },

    async cancelTransfer(): Promise<void> {
      // no-op for source-only endpoint
    }
  };
}
