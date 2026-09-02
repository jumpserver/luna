export function createSftpMessageId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

export function joinSftpPath(currentPath: string, name: string) {
  return `${currentPath.replace(/\/$/, "")}/${name}`;
}

export function decodeSftpRawBytes(raw: unknown) {
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
