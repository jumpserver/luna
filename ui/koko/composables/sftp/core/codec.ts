export function createSftpMessageId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

export function joinSftpPath(currentPath: string, name: string) {
  if (name.includes("/") || name.includes("\0")) throw new Error("sftp_invalid_name");
  return `${currentPath.replace(/\/$/, "")}/${name}`;
}

const sftpBinaryVersion = 1;
const sftpBinaryHeaderSize = 5;
const sftpBinaryJsonMax = 64 * 1024;
const sftpBinaryPayloadMax = 2 * 1024 * 1024;

export function decodeSftpRawBytes(raw: unknown) {
  if (raw instanceof Uint8Array) return raw;
  if (typeof raw === "string") {
    if (!raw) return new Uint8Array();

    const binary = atob(raw);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  if (Array.isArray(raw)) return Uint8Array.from(raw);

  return new Uint8Array();
}

export function encodeSftpBytes(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export function encodeSftpBinaryFrame(message: {
  id: string;
  type: string;
  cmd?: string;
  data?: string;
  err?: string;
  error_code?: string;
  raw?: Uint8Array;
}) {
  const header = JSON.stringify({
    id: message.id,
    type: message.type,
    cmd: message.cmd || undefined,
    data: message.data || undefined,
    err: message.err || undefined,
    error_code: message.error_code || undefined
  });
  const headerBytes = new TextEncoder().encode(header);
  const payload = message.raw || new Uint8Array();
  if (headerBytes.length > sftpBinaryJsonMax || payload.length > sftpBinaryPayloadMax) {
    throw new Error("sftp binary frame too large");
  }
  const frame = new Uint8Array(sftpBinaryHeaderSize + headerBytes.length + payload.length);
  frame[0] = sftpBinaryVersion;
  new DataView(frame.buffer).setUint32(1, headerBytes.length);
  frame.set(headerBytes, sftpBinaryHeaderSize);
  frame.set(payload, sftpBinaryHeaderSize + headerBytes.length);
  return frame;
}

export function parseSftpBinaryFrame(frame: Uint8Array) {
  if (frame.length < sftpBinaryHeaderSize || frame[0] !== sftpBinaryVersion) return null;
  const jsonLen = new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint32(1);
  const headerEnd = sftpBinaryHeaderSize + jsonLen;
  if (jsonLen > sftpBinaryJsonMax || headerEnd > frame.length || frame.length - headerEnd > sftpBinaryPayloadMax) {
    return null;
  }
  let header: {
    id?: string;
    type?: string;
    cmd?: string;
    data?: string;
    err?: string;
    error_code?: string;
  };
  try {
    header = JSON.parse(new TextDecoder().decode(frame.subarray(sftpBinaryHeaderSize, headerEnd))) as typeof header;
  } catch {
    return null;
  }
  if (!header.id || !header.type) return null;
  return {
    id: header.id,
    type: header.type,
    cmd: header.cmd,
    data: header.data,
    err: header.err,
    error_code: header.error_code,
    raw: frame.subarray(headerEnd)
  };
}
