export type FileTransferStatus
  = | "queued"
    | "preparing"
    | "transferring"
    | "verifying"
    | "paused"
    | "completed"
    | "skipped"
    | "failed"
    | "canceled";

export type FileTransferConflictPolicy = "ask" | "overwrite" | "skip";

export interface FileTransferEndpointRef {
  /** Stable for the lifetime of one authorized connector session. */
  id: string
  label: string
}

export interface FileTransferSource {
  path: string
  name: string
  size: number
}

export interface FileTransferPrepareInput {
  transferId: string
  targetPath: string
  fileName: string
  size: number
  conflictPolicy: FileTransferConflictPolicy
}

export interface FileTransferResumeState {
  transferId: string
  committedBytes: number
  totalBytes: number
  state: "ready" | "completed" | "skipped" | "missing" | "conflict"
}

export interface FileTransferChunk {
  offset: number
  data: Uint8Array
  sha256: string
  eof: boolean
}

export interface FileTransferWriteInput {
  transferId: string
  targetPath: string
  totalBytes: number
  offset: number
  data: Uint8Array
  sha256: string
}

export interface FileTransferWriteAck {
  committedBytes: number
  duplicate: boolean
}

export interface FileTransferCommitInput {
  transferId: string
  targetPath: string
  totalBytes: number
  sha256: string
  conflictPolicy: FileTransferConflictPolicy
}

/**
 * Runtime transport supplied by a connector. The global UI transfer store only
 * knows this interface and never owns connector sockets or credentials.
 */
export interface FileTransferEndpoint {
  ref: FileTransferEndpointRef
  isAvailable: () => boolean
  prepareTransfer: (input: FileTransferPrepareInput) => Promise<FileTransferResumeState>
  readChunk: (input: { transferId: string, path: string, offset: number, length: number }) => Promise<FileTransferChunk>
  writeChunk: (input: FileTransferWriteInput) => Promise<FileTransferWriteAck>
  getTransferStatus: (input: { transferId: string, targetPath: string, totalBytes: number }) => Promise<FileTransferResumeState>
  commitTransfer: (input: FileTransferCommitInput) => Promise<void>
  cancelTransfer: (input: { transferId: string, targetPath: string, discard: boolean }) => Promise<void>
  onTransferCommitted?: (input: { targetPath: string }) => Promise<void> | void
}

export interface FileTransferTask {
  id: string
  batchId: string
  sourceEndpoint: FileTransferEndpointRef
  destinationEndpoint: FileTransferEndpointRef
  source: FileTransferSource
  destinationPath: string
  conflictPolicy: FileTransferConflictPolicy
  status: FileTransferStatus
  confirmedBytes: number
  /** Serialized incremental SHA-256 state. It never contains file bytes. */
  checksumState: string
  checksum?: string
  error?: string
  createdAt: number
  updatedAt: number
}

export interface FileTransferBatch {
  id: string
  taskIds: string[]
  createdAt: number
}

export interface CreateFileTransferTaskInput {
  batchId: string
  sourceEndpoint: FileTransferEndpointRef
  destinationEndpoint: FileTransferEndpointRef
  source: FileTransferSource
  destinationPath: string
  conflictPolicy: FileTransferConflictPolicy
}

export class FileTransferUnavailableError extends Error {
  constructor(message = "File transfer endpoint is unavailable") {
    super(message);
    this.name = "FileTransferUnavailableError";
  }
}
