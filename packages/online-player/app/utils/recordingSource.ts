import { gunzipSync } from "fflate";

export function decodeRecordingBytes(buffer: ArrayBuffer): Uint8Array {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  return gunzipSync(bytes);
}

export async function fetchRecordingBuffer(src: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(src, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = decodeRecordingBytes(await response.arrayBuffer());
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function fetchRecordingText(src: string, signal?: AbortSignal): Promise<string> {
  return new TextDecoder("utf-8").decode(await fetchRecordingBuffer(src, signal));
}
