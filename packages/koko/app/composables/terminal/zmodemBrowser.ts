import type { KokoZmodemSendSession, KokoZmodemTransfer } from "./zmodemTypes";

const DEFAULT_CHUNK_SIZE = 64 * 1024;
const SOCKET_BUFFER_HIGH_WATERMARK = 256 * 1024;
const SOCKET_BUFFER_LOW_WATERMARK = 64 * 1024;
const SOCKET_DRAIN_TIMEOUT = 30_000;
const PEER_RESPONSE_TIMEOUT = 30_000;

interface SendZmodemFilesOptions {
  onOfferResponse?: (file: File, transfer: KokoZmodemTransfer | undefined) => void;
  onProgress?: (file: File, transfer: KokoZmodemTransfer, payload: Uint8Array) => void;
  onFileComplete?: (file: File, transfer: KokoZmodemTransfer) => void;
  signal?: AbortSignal;
  socket?: WebSocket;
}

interface ZmodemHeader {
  _bytes4?: number[];
  [key: string]: unknown;
}

type InternalSendSession = KokoZmodemSendSession & {
  _create_header_bytes?: (name: string, ...args: unknown[]) => [unknown, ZmodemHeader];
  _get_header_formatter?: (name: string) => string;
  _zencoder?: unknown;
  _file_offset?: number;
  kokoClobberPatched?: boolean;
};

function createAbortError() {
  return new DOMException("File transfer cancelled", "AbortError");
}

function assertNotAborted(session: KokoZmodemSendSession, signal?: AbortSignal) {
  if (session.aborted() || signal?.aborted) throw createAbortError();
}

function abortableDelay(timeout: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const onAbort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, timeout);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function waitForSocketDrain(socket?: WebSocket, signal?: AbortSignal) {
  if (!socket) return;
  if (socket.readyState !== WebSocket.OPEN) throw new Error("WebSocket connection is closed");
  if (socket.bufferedAmount <= SOCKET_BUFFER_HIGH_WATERMARK) {
    await abortableDelay(0, signal);
    return;
  }

  const startedAt = Date.now();
  while (socket.bufferedAmount > SOCKET_BUFFER_LOW_WATERMARK) {
    if (socket.readyState !== WebSocket.OPEN) throw new Error("WebSocket connection is closed");
    if (Date.now() - startedAt >= SOCKET_DRAIN_TIMEOUT) throw new Error("ZMODEM WebSocket drain timeout");
    await abortableDelay(20, signal);
  }
}

function waitForPeer<T>(promise: Promise<T>, signal?: AbortSignal) {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const onAbort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      reject(new Error("ZMODEM peer response timeout"));
    }, PEER_RESPONSE_TIMEOUT);
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

function enableUploadOverwrite(session: KokoZmodemSendSession) {
  const internal = session as InternalSendSession;
  if (internal.kokoClobberPatched || !internal._create_header_bytes || !internal._get_header_formatter) {
    return;
  }

  const originalCreateHeaderBytes = internal._create_header_bytes.bind(internal);
  internal._create_header_bytes = (name, ...args) => {
    const result = originalCreateHeaderBytes(name, ...args);
    const header = result[1];
    if (name !== "ZFILE" || header._bytes4?.length !== 4) return result;

    header._bytes4[2] = 0x04;
    const formatter = internal._get_header_formatter!(name);
    const encode = header[formatter];
    if (typeof encode !== "function") return result;
    return [(encode as (encoder: unknown) => unknown).call(header, internal._zencoder), header];
  };
  internal.kokoClobberPatched = true;
}

async function sendZmodemFile(
  session: KokoZmodemSendSession,
  file: File,
  transfer: KokoZmodemTransfer,
  options: SendZmodemFilesOptions
) {
  if (file.size === 0) {
    await waitForPeer(transfer.end(), options.signal);
    options.onFileComplete?.(file, transfer);
    return;
  }

  let offset = transfer.get_offset();
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > file.size) {
    throw new Error(`Invalid ZMODEM resume offset: ${offset}`);
  }
  if (offset > 0) (session as InternalSendSession)._file_offset = offset;
  if (offset === file.size) {
    await waitForPeer(transfer.end(new Uint8Array()), options.signal);
  } else {
    while (offset < file.size) {
      assertNotAborted(session, options.signal);
      await waitForSocketDrain(options.socket, options.signal);
      const nextOffset = Math.min(offset + DEFAULT_CHUNK_SIZE, file.size);
      const chunk = new Uint8Array(await file.slice(offset, nextOffset).arrayBuffer());
      assertNotAborted(session, options.signal);

      if (nextOffset >= file.size) await waitForPeer(transfer.end(chunk), options.signal);
      else transfer.send(chunk);

      options.onProgress?.(file, transfer, chunk);
      offset = nextOffset;
    }
  }

  options.onFileComplete?.(file, transfer);
}

export async function sendZmodemFiles(
  session: KokoZmodemSendSession,
  files: File[] | FileList,
  options: SendZmodemFilesOptions = {}
) {
  const normalizedFiles = Array.from(files);
  let bytesRemaining = normalizedFiles.reduce((total, file) => total + file.size, 0);
  enableUploadOverwrite(session);

  for (let index = 0; index < normalizedFiles.length; index++) {
    assertNotAborted(session, options.signal);
    const file = normalizedFiles[index]!;
    const transfer = await waitForPeer(
      session.send_offer({
        name: file.name,
        size: file.size,
        mtime: new Date(file.lastModified),
        files_remaining: normalizedFiles.length - index,
        bytes_remaining: bytesRemaining
      }),
      options.signal
    );

    options.onOfferResponse?.(file, transfer);
    bytesRemaining -= file.size;

    if (!transfer) continue;
    await sendZmodemFile(session, file, transfer, options);
  }

  if (session.close) await waitForPeer(session.close(), options.signal);
}

export function saveZmodemPacketsToDisk(packets: BlobPart[], name: string) {
  const blob = new Blob(packets);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.style.display = "none";
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
