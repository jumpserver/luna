import type {
  FileTransferChunk,
  FileTransferEndpoint,
  FileTransferEndpointRef,
  FileTransferPrepareInput,
  FileTransferResumeState,
  FileTransferWriteInput
} from "@jumpserver/connectors-core";
import type { BrowserUploadItem } from "./transfer";
import type { SftpTransferEntry } from "./workspaceTypes";
import { sha256Hex } from "#koko/utils/file-transfer/sha256";

export const WEB_UPLOAD_ENDPOINT_ID = "web-upload";
const STAGED_ROOT = "/web-upload";

export interface BrowserStagedUpload {
  sourcePath: string;
  entries: SftpTransferEntry[];
}

/**
 * Browser-only source endpoint: stages `File` objects in memory so Transfer Center
 * can stream them to remote SFTP the same way as desktop local→remote.
 * It is not a download destination (web has no local FS pane).
 */
export function useBrowserUploadTransferEndpoint(options: { label: string; id?: string }): FileTransferEndpoint & {
  stageFiles: (files: Array<File | BrowserUploadItem>) => BrowserStagedUpload;
  clearStaged: () => void;
} {
  const ref: FileTransferEndpointRef = { id: options.id || WEB_UPLOAD_ENDPOINT_ID, label: options.label };
  const staged = new Map<string, File>();

  function stageFiles(files: Array<File | BrowserUploadItem>): BrowserStagedUpload {
    const batchId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const sourcePath = `${STAGED_ROOT}/${batchId}`.replace(/\/+/g, "/");
    const entries: SftpTransferEntry[] = [];
    const directories = new Set<string>();
    for (const item of files) {
      const file = "relativePath" in item ? item.file : item;
      const relativePath = ("relativePath" in item ? item.relativePath : item.webkitRelativePath || item.name).replace(
        /^\/+|\/+$/g,
        ""
      );
      if (!relativePath || relativePath.split("/").some((part) => !part || part === "." || part === "..")) continue;
      const parts = relativePath.split("/");
      const name = parts.pop() || "";
      const relativeDir = parts.join("/");
      for (let index = 1; index <= parts.length; index++) directories.add(parts.slice(0, index).join("/"));
      if (("relativePath" in item && item.is_dir) || !file) {
        directories.add(relativePath);
        continue;
      }
      staged.set(`${sourcePath}/${relativePath}`.replace(/\/+/g, "/"), file);
      entries.push({ name, size: String(file.size), ...(relativeDir ? { relativeDir } : {}) });
    }
    entries.unshift(
      ...Array.from(directories, (directory) => {
        const parts = directory.split("/");
        const name = parts.pop() || "";
        const relativeDir = parts.join("/");
        return { name, size: "", is_dir: true, ...(relativeDir ? { relativeDir } : {}) };
      })
    );
    return { sourcePath, entries };
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
