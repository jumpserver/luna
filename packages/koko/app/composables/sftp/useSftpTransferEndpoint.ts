import type { SftpDataMessage, SftpIncomingMessage } from "./protocol";
import type { SftpSocketClient } from "./useSftpSocket";
import type {
  FileTransferChunk,
  FileTransferCommitInput,
  FileTransferEndpoint,
  FileTransferEndpointRef,
  FileTransferPrepareInput,
  FileTransferResumeState,
  FileTransferWriteAck,
  FileTransferWriteInput
} from "~/shared/file-transfer/types";
import { getCurrentInstance, onUnmounted } from "vue";
import { FileTransferUnavailableError } from "~/shared/file-transfer/types";
import { SftpCommand, SftpMessageType } from "./protocol";

interface PendingRequest {
  command: SftpCommand;
  resolve: (message: SftpIncomingMessage) => void;
  reject: (error: Error) => void;
}

interface TransferResponseWire {
  transfer_id?: string;
  committed_bytes?: number;
  total_bytes?: number;
  state?: FileTransferResumeState["state"];
  duplicate?: boolean;
}

const messageId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

function decodeRaw(raw: unknown) {
  if (typeof raw === "string") {
    if (!raw) return new Uint8Array();

    const binary = atob(raw);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  if (Array.isArray(raw)) return Uint8Array.from(raw);

  return new Uint8Array();
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function parsePayload<T>(message: SftpDataMessage) {
  if (message.err) throw new Error(message.err);

  try {
    return JSON.parse(message.data || "{}") as T;
  } catch {
    throw new Error("Invalid SFTP transfer response");
  }
}

function parseTransferState(message: SftpDataMessage): FileTransferResumeState {
  const response = parsePayload<TransferResponseWire>(message);
  const transferId = response.transfer_id;
  const state = response.state;
  const committedBytes = response.committed_bytes;
  const totalBytes = response.total_bytes;
  if (
    !transferId ||
    !state ||
    typeof committedBytes !== "number" ||
    typeof totalBytes !== "number" ||
    !Number.isSafeInteger(committedBytes) ||
    !Number.isSafeInteger(totalBytes)
  ) {
    throw new Error("Invalid SFTP transfer response");
  }
  return {
    transferId,
    committedBytes,
    totalBytes,
    state
  };
}

function parseTransferWriteAck(message: SftpDataMessage): FileTransferWriteAck {
  const response = parsePayload<TransferResponseWire>(message);
  const committedBytes = response.committed_bytes;
  if (typeof committedBytes !== "number" || !Number.isSafeInteger(committedBytes)) {
    throw new TypeError("Invalid SFTP transfer write acknowledgement");
  }
  return { committedBytes, duplicate: Boolean(response.duplicate) };
}

export function useSftpTransferEndpoint(
  socket: SftpSocketClient,
  ref: FileTransferEndpointRef,
  onTransferCommitted?: FileTransferEndpoint["onTransferCommitted"]
): FileTransferEndpoint {
  const pending = new Map<string, PendingRequest>();

  const removeMessageListener = socket.onMessage((message) => {
    const request = pending.get(message.id);
    if (!request) return;
    if (
      message.type === SftpMessageType.Error ||
      message.type === SftpMessageType.Close ||
      message.type === SftpMessageType.Closed
    ) {
      pending.delete(message.id);
      request.reject(new FileTransferUnavailableError(message.err || message.type));
      return;
    }
    if (message.type === SftpMessageType.Binary && request.command === SftpCommand.TransferRead) {
      pending.delete(message.id);
      request.resolve(message);
      return;
    }
    if (message.type === SftpMessageType.Data && message.cmd === request.command) {
      pending.delete(message.id);
      request.resolve(message);
    }
  });
  const removeFailureListener = socket.onFailure((failure) => {
    for (const [id, request] of pending) {
      pending.delete(id);
      request.reject(new FileTransferUnavailableError(failure.message));
    }
  });

  if (getCurrentInstance()) {
    onUnmounted(() => {
      removeMessageListener();
      removeFailureListener();
      for (const request of pending.values()) request.reject(new FileTransferUnavailableError());
      pending.clear();
    });
  }

  function request(command: SftpCommand, data: Record<string, unknown>, raw = "") {
    if (!socket.connected.value) return Promise.reject(new FileTransferUnavailableError());
    const id = messageId();
    return new Promise<SftpIncomingMessage>((resolve, reject) => {
      pending.set(id, { command, resolve, reject });
      try {
        socket.send({ id, type: SftpMessageType.Data, cmd: command, data: JSON.stringify(data), raw });
      } catch (error) {
        pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  const requestState = async (command: SftpCommand, data: Record<string, unknown>) => {
    const message = await request(command, data);
    if (message.type !== SftpMessageType.Data) throw new Error("Invalid SFTP transfer response");
    return parseTransferState(message);
  };

  return {
    ref,
    isAvailable: () => socket.connected.value,
    onTransferCommitted,
    prepareTransfer: (input: FileTransferPrepareInput) =>
      requestState(SftpCommand.TransferPrepare, {
        transfer_id: input.transferId,
        path: input.targetPath,
        file_name: input.fileName,
        size: input.size,
        conflict_policy: input.conflictPolicy
      }),
    readChunk: async (input) => {
      const message = await request(SftpCommand.TransferRead, {
        transfer_id: input.transferId,
        path: input.path,
        offset: input.offset,
        length: input.length
      });
      if (message.type !== SftpMessageType.Binary) throw new Error("Invalid SFTP transfer chunk response");
      const metadata = JSON.parse(message.data || "{}") as Omit<FileTransferChunk, "data">;
      if (!metadata.sha256 || !Number.isSafeInteger(metadata.offset))
        throw new Error("Invalid SFTP transfer chunk metadata");
      return { ...metadata, data: decodeRaw(message.raw) };
    },
    writeChunk: async (input: FileTransferWriteInput) => {
      const message = await request(
        SftpCommand.TransferWrite,
        {
          transfer_id: input.transferId,
          path: input.targetPath,
          size: input.totalBytes,
          offset: input.offset,
          sha256: input.sha256
        },
        bytesToBase64(input.data)
      );
      if (message.type !== SftpMessageType.Data) throw new Error("Invalid SFTP transfer write acknowledgement");
      return parseTransferWriteAck(message);
    },
    getTransferStatus: (input) =>
      requestState(SftpCommand.TransferStatus, {
        transfer_id: input.transferId,
        path: input.targetPath,
        size: input.totalBytes
      }),
    commitTransfer: async (input: FileTransferCommitInput) => {
      await requestState(SftpCommand.TransferCommit, {
        transfer_id: input.transferId,
        path: input.targetPath,
        size: input.totalBytes,
        sha256: input.sha256,
        conflict_policy: input.conflictPolicy
      });
    },
    cancelTransfer: async (input) => {
      await requestState(SftpCommand.TransferCancel, {
        transfer_id: input.transferId,
        path: input.targetPath,
        discard: input.discard
      });
    }
  };
}
