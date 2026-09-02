import type { SftpDataMessage } from "../protocol";
import type { FileTransferResumeState, FileTransferWriteAck } from "@jumpserver/connectors-core";

interface TransferResponseWire {
  transfer_id?: string;
  committed_bytes?: number;
  total_bytes?: number;
  state?: FileTransferResumeState["state"];
  duplicate?: boolean;
}

const INVALID_TRANSFER_RESPONSE_ERROR = "Invalid SFTP transfer response";
const INVALID_TRANSFER_WRITE_ACK_ERROR = "Invalid SFTP transfer write acknowledgement";

function parseTransferPayload<T>(message: SftpDataMessage) {
  if (message.err) throw new Error(message.err);

  try {
    return JSON.parse(message.data || "{}") as T;
  } catch {
    throw new Error(INVALID_TRANSFER_RESPONSE_ERROR);
  }
}

export function parseSftpTransferState(message: SftpDataMessage): FileTransferResumeState {
  const response = parseTransferPayload<TransferResponseWire>(message);
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
    throw new Error(INVALID_TRANSFER_RESPONSE_ERROR);
  }

  return {
    transferId,
    committedBytes,
    totalBytes,
    state
  };
}

export function parseSftpTransferWriteAck(message: SftpDataMessage): FileTransferWriteAck {
  const response = parseTransferPayload<TransferResponseWire>(message);
  const committedBytes = response.committed_bytes;

  if (typeof committedBytes !== "number" || !Number.isSafeInteger(committedBytes)) {
    throw new TypeError(INVALID_TRANSFER_WRITE_ACK_ERROR);
  }

  return {
    committedBytes,
    duplicate: Boolean(response.duplicate)
  };
}
