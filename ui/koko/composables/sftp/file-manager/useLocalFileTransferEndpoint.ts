import type {
  FileTransferChunk,
  FileTransferCommitInput,
  FileTransferEndpoint,
  FileTransferEndpointRef,
  FileTransferPrepareInput,
  FileTransferResumeState,
  FileTransferWriteInput
} from "@jumpserver/connectors-core";
import { useKokoHostAdapter } from "#koko/host";

const LOCAL_ENDPOINT_ID = "local:fs";

function isWindowsPath(path: string): boolean {
  return /^[a-z]:[\\/]/i.test(path) || path.startsWith("\\\\");
}

/** Join directory + name for local FS (POSIX or Windows). */
export function joinLocalFsPath(base: string, name: string): string {
  if (!base) return name;
  if (isWindowsPath(base)) {
    const sep = base.includes("\\") ? "\\" : "/";
    return `${base.replace(/[\\/]+$/, "")}${sep}${name}`;
  }
  return `${base.replace(/\/+$/, "") || "/"}/${name}`.replace(/\/+/g, "/");
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data.slice());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function partialPathFor(targetPath: string, transferId: string): string {
  const safeId = transferId.replace(/[^\w-]/g, "").slice(0, 12) || "tmp";
  return `${targetPath}.jms-partial-${safeId}`;
}

function keepBothPath(targetPath: string, index: number) {
  const separator = Math.max(targetPath.lastIndexOf("/"), targetPath.lastIndexOf("\\"));
  const dot = targetPath.lastIndexOf(".");
  return dot > separator
    ? `${targetPath.slice(0, dot)} (${index})${targetPath.slice(dot)}`
    : `${targetPath} (${index})`;
}

export function useLocalFileTransferEndpoint(options: {
  id?: string;
  label: string;
  /** Current directory of the local pane (absolute). */
  getCurrentPath: () => string;
  isAvailable?: () => boolean;
  onTransferCommitted?: (input: { targetPath: string }) => Promise<void> | void;
}): FileTransferEndpoint {
  const { localFiles } = useKokoHostAdapter();
  const ref: FileTransferEndpointRef = { id: options.id || LOCAL_ENDPOINT_ID, label: options.label };
  /** transferId → partial file absolute path */
  const partials = new Map<string, string>();

  async function exists(path: string): Promise<boolean> {
    try {
      return Boolean(await localFiles.exists(path));
    } catch {
      return false;
    }
  }

  async function ensureParentDir(filePath: string): Promise<void> {
    const normalized = filePath.replace(/\\/g, "/");
    const idx = Math.max(normalized.lastIndexOf("/"), filePath.lastIndexOf("\\"));
    if (idx <= 0) return;
    const parent = filePath.slice(0, idx);
    if (!parent || (await exists(parent))) return;
    await localFiles.mkdir(parent, { recursive: true });
  }

  return {
    ref,
    isAvailable: () => options.isAvailable?.() ?? true,
    onTransferCommitted: options.onTransferCommitted,

    async prepareTransfer(input: FileTransferPrepareInput): Promise<FileTransferResumeState> {
      const finalPath = input.targetPath;
      const partial = partialPathFor(finalPath, input.transferId);
      partials.set(input.transferId, partial);

      const finalExists = await exists(finalPath);
      if (finalExists) {
        if (input.conflictPolicy === "skip") {
          return {
            transferId: input.transferId,
            committedBytes: input.size,
            totalBytes: input.size,
            state: "skipped"
          };
        }
        if (input.conflictPolicy === "ask") {
          return {
            transferId: input.transferId,
            committedBytes: 0,
            totalBytes: input.size,
            state: "conflict"
          };
        }
      }

      await ensureParentDir(finalPath);
      // Always restart local partials from zero for a consistent checksum chain.
      await localFiles.writeFile(partial, new Uint8Array());
      return {
        transferId: input.transferId,
        committedBytes: 0,
        totalBytes: input.size,
        state: "ready"
      };
    },

    async readChunk(input: {
      transferId: string;
      path: string;
      offset: number;
      length: number;
    }): Promise<FileTransferChunk> {
      const data = await localFiles.readFile(input.path, { offset: input.offset, length: input.length });
      return {
        offset: input.offset,
        data,
        sha256: await sha256Hex(data),
        eof: data.length < input.length
      };
    },

    async writeChunk(input: FileTransferWriteInput) {
      const partial = partials.get(input.transferId) || partialPathFor(input.targetPath, input.transferId);
      partials.set(input.transferId, partial);
      await localFiles.writeFile(partial, input.data, { offset: input.offset });
      return {
        committedBytes: input.offset + input.data.length,
        duplicate: false
      };
    },

    async getTransferStatus(input: {
      transferId: string;
      targetPath: string;
      totalBytes: number;
    }): Promise<FileTransferResumeState> {
      const partial = partials.get(input.transferId) || partialPathFor(input.targetPath, input.transferId);
      if (!(await exists(partial))) {
        return {
          transferId: input.transferId,
          committedBytes: 0,
          totalBytes: input.totalBytes,
          state: "missing"
        };
      }
      const info = await localFiles.stat(partial);
      return {
        transferId: input.transferId,
        committedBytes: info.size,
        totalBytes: input.totalBytes,
        state: "ready"
      };
    },

    async commitTransfer(input: FileTransferCommitInput): Promise<void> {
      const partial = partials.get(input.transferId) || partialPathFor(input.targetPath, input.transferId);
      if (input.conflictPolicy === "skip" && (await exists(input.targetPath))) {
        if (await exists(partial)) await localFiles.remove(partial);
        partials.delete(input.transferId);
        return;
      }

      const info = await localFiles.stat(partial);
      if (info.size !== input.totalBytes) throw new Error("Local transfer size mismatch");

      if (input.conflictPolicy === "keep_both") {
        for (let index = 0; index < 10_000; index++) {
          const destination = index ? keepBothPath(input.targetPath, index) : input.targetPath;
          if (await exists(destination)) continue;
          await localFiles.rename(partial, destination);
          partials.delete(input.transferId);
          return;
        }
        throw new Error("Unable to allocate a unique local file name");
      }

      if (input.conflictPolicy === "overwrite" && (await exists(input.targetPath))) {
        await localFiles.remove(input.targetPath);
      }
      await localFiles.rename(partial, input.targetPath);
      partials.delete(input.transferId);
    },

    async cancelTransfer(input: { transferId: string; targetPath: string; discard: boolean }): Promise<void> {
      const partial = partials.get(input.transferId) || partialPathFor(input.targetPath, input.transferId);
      partials.delete(input.transferId);
      if (!input.discard) return;
      try {
        if (await exists(partial)) await localFiles.remove(partial);
      } catch {
        // Best-effort cleanup.
      }
    }
  };
}

export { LOCAL_ENDPOINT_ID };
