import type { KokoZmodemSendSession, KokoZmodemTransfer } from "./zmodemTypes";

const DEFAULT_CHUNK_SIZE = 64 * 1024;

interface SendZmodemFilesOptions {
  onOfferResponse?: (file: File, transfer: KokoZmodemTransfer | undefined) => void;
  onProgress?: (file: File, transfer: KokoZmodemTransfer, payload: Uint8Array) => void;
  onFileComplete?: (file: File, transfer: KokoZmodemTransfer) => void;
}

function assertNotAborted(session: KokoZmodemSendSession) {
  if (session.aborted()) throw new Error("aborted");
}

async function sendZmodemFile(
  session: KokoZmodemSendSession,
  file: File,
  transfer: KokoZmodemTransfer,
  options: SendZmodemFilesOptions
) {
  const buffer = new Uint8Array(await file.arrayBuffer());

  if (buffer.length === 0) {
    await transfer.end();
    options.onFileComplete?.(file, transfer);
    return;
  }

  let offset = 0;
  while (offset < buffer.length) {
    assertNotAborted(session);
    const nextOffset = Math.min(offset + DEFAULT_CHUNK_SIZE, buffer.length);
    const chunk = buffer.subarray(offset, nextOffset);

    if (nextOffset >= buffer.length) await transfer.end(chunk);
    else transfer.send(chunk);

    options.onProgress?.(file, transfer, chunk);
    offset = nextOffset;
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

  for (let index = 0; index < normalizedFiles.length; index++) {
    const file = normalizedFiles[index]!;
    const transfer = await session.send_offer({
      name: file.name,
      size: file.size,
      mtime: new Date(file.lastModified),
      files_remaining: normalizedFiles.length - index,
      bytes_remaining: bytesRemaining
    });

    options.onOfferResponse?.(file, transfer);
    bytesRemaining -= file.size;

    if (!transfer) continue;
    await sendZmodemFile(session, file, transfer, options);
  }
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
