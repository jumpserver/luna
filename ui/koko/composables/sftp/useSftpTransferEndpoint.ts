import type {
  FileTransferChunk,
  FileTransferCommitInput,
  FileTransferEndpoint,
  FileTransferEndpointRef,
  FileTransferPrepareInput,
  FileTransferWriteInput
} from "@jumpserver/connectors-core";
import type { SftpIncomingMessage } from "./protocol";
import type { SftpSocketClient } from "./useSftpSocket";
import { FileTransferUnavailableError } from "@jumpserver/connectors-core";
import { getCurrentInstance, onUnmounted } from "vue";
import { createSftpMessageId, decodeSftpRawBytes, encodeSftpBytes } from "./core/codec";
import { rejectPendingRequests } from "./core/pending";
import { parseSftpTransferState, parseSftpTransferWriteAck } from "./core/transfer";
import { SftpCommand, SftpMessageType } from "./protocol";

interface PendingRequest {
  command: SftpCommand;
  resolve: (message: SftpIncomingMessage) => void;
  reject: (error: Error) => void;
}

export function useSftpTransferEndpoint(
  socket: SftpSocketClient,
  ref: FileTransferEndpointRef,
  onTransferCommitted?: FileTransferEndpoint["onTransferCommitted"]
): FileTransferEndpoint {
  const pending = new Map<string, PendingRequest>();
  const rejectAllPending = (error: Error) => {
    rejectPendingRequests(pending.values(), error);
    pending.clear();
  };

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
    rejectAllPending(new FileTransferUnavailableError(failure.message));
  });

  if (getCurrentInstance()) {
    onUnmounted(() => {
      removeMessageListener();
      removeFailureListener();
      rejectAllPending(new FileTransferUnavailableError());
    });
  }

  function request(command: SftpCommand, data: Record<string, unknown>, raw = "") {
    if (!socket.connected.value) return Promise.reject(new FileTransferUnavailableError());
    const id = createSftpMessageId();
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
    return parseSftpTransferState(message);
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
      return { ...metadata, data: decodeSftpRawBytes(message.raw) };
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
        encodeSftpBytes(input.data)
      );
      if (message.type !== SftpMessageType.Data) throw new Error("Invalid SFTP transfer write acknowledgement");
      return parseSftpTransferWriteAck(message);
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
