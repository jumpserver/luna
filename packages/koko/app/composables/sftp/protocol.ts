export enum SftpMessageType {
  Connect = "CONNECT",
  Ping = "PING",
  Pong = "PONG",
  Data = "SFTP_DATA",
  Binary = "SFTP_BINARY",
  Chat = "CHAT_MESSAGE",
  Error = "ERROR",
  Close = "CLOSE",
  Closed = "closed"
}

export enum SftpCommand {
  List = "list",
  Download = "download",
  Upload = "upload",
  Save = "save",
  TransferPrepare = "transfer_prepare",
  TransferRead = "transfer_read",
  TransferWrite = "transfer_write",
  TransferStatus = "transfer_status",
  TransferCommit = "transfer_commit",
  TransferCancel = "transfer_cancel",
  MakeDirectory = "mkdir",
  Rename = "rename",
  Remove = "rm"
}

export enum SftpDataStatus {
  Ok = "ok"
}

export enum SftpControlData {
  Pong = "pong"
}

export enum SftpWebSocketProtocol {
  Koko = "JMS-KOKO"
}

export enum SftpSocketFailureCode {
  ConnectionFailed = "connection_failed",
  ConnectionClosed = "connection_closed",
  ConnectionReset = "connection_reset",
  MalformedMessage = "malformed_message",
  SendFailed = "send_failed"
}

export const SFTP_REQUEST_TIMEOUT_ERROR = "sftp_request_timeout";
export const SFTP_FILE_CONFLICT_ERROR = "sftp_file_conflict";

export interface SftpFileEntry {
  name: string;
  size: string;
  perm: string;
  mod_time: string;
  type: string;
  is_dir: boolean;
  version?: string;
}

interface SftpMessageBase {
  id: string;
  data?: string;
  raw?: string | number[];
  err?: string;
  error_code?: string;
  current_path?: string;
}

export interface SftpDataMessage extends SftpMessageBase {
  type: SftpMessageType.Data;
  cmd: SftpCommand;
}

export interface SftpBinaryMessage extends SftpMessageBase {
  type: SftpMessageType.Binary;
}

export interface SftpChatMessage extends SftpMessageBase {
  type: SftpMessageType.Chat;
  data: string;
}

export interface SftpControlMessage extends SftpMessageBase {
  type:
    | SftpMessageType.Connect
    | SftpMessageType.Ping
    | SftpMessageType.Pong
    | SftpMessageType.Error
    | SftpMessageType.Close
    | SftpMessageType.Closed;
}

export type SftpWireMessage = SftpDataMessage | SftpBinaryMessage | SftpChatMessage | SftpControlMessage;
export type SftpIncomingMessage = SftpWireMessage;

export interface SftpSocketFailure {
  code: SftpSocketFailureCode;
  message: string;
}

export interface SftpFileOperations {
  listDirectory: (path: string, options?: { background?: boolean; messageId?: string }) => Promise<SftpFileEntry[]>;
  createDirectory: (name: string) => Promise<void>;
  createDirectoryAt: (path: string) => Promise<void>;
  createFileAt: (path: string) => Promise<void>;
  renameEntry: (entry: SftpFileEntry, name: string) => Promise<void>;
  renamePath: (path: string, name: string) => Promise<void>;
  removeEntry: (entry: SftpFileEntry) => Promise<void>;
  removePath: (path: string) => Promise<void>;
  downloadEntry: (entry: SftpFileEntry) => Promise<void>;
  downloadPath: (path: string, isDir: boolean) => Promise<void>;
  readFile: (entry: SftpFileEntry, targetPath?: string) => Promise<Blob>;
  uploadFile: (file: File, targetPath?: string) => Promise<void>;
  uploadBlob: (fileName: string, blob: Blob, targetPath?: string) => Promise<void>;
  saveFile: (
    path: string,
    bytes: Uint8Array,
    options?: { expectedVersion?: string; force?: boolean }
  ) => Promise<SftpFileEntry>;
}

const messageTypes = new Set<string>(Object.values(SftpMessageType));
const commands = new Set<string>(Object.values(SftpCommand));

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function optionalRaw(value: unknown): string | number[] | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "number")) return value;
  return undefined;
}

export function isSftpCommand(value: unknown): value is SftpCommand {
  return typeof value === "string" && commands.has(value);
}

export function isSftpMessageType(value: unknown): value is SftpMessageType {
  return typeof value === "string" && messageTypes.has(value);
}

export function parseSftpIncomingMessage(raw: unknown): SftpIncomingMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const message = raw as Record<string, unknown>;
  if (typeof message.id !== "string" || !isSftpMessageType(message.type)) return null;

  const base = {
    id: message.id,
    data: optionalString(message.data),
    raw: optionalRaw(message.raw),
    err: optionalString(message.err),
    error_code: optionalString(message.error_code),
    current_path: optionalString(message.current_path)
  };

  if (message.type === SftpMessageType.Data) {
    if (!isSftpCommand(message.cmd)) return null;
    return { ...base, type: message.type, cmd: message.cmd };
  }

  if (message.type === SftpMessageType.Binary) return { ...base, type: message.type };
  if (message.type === SftpMessageType.Chat) {
    if (typeof message.data !== "string") return null;
    return { ...base, type: message.type, data: message.data };
  }
  return { ...base, type: message.type };
}
