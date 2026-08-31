import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

export function toUint8Array(data: ArrayBufferView | ArrayBuffer): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  const view = data instanceof Uint8Array ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return Uint8Array.from(view);
}

export function readableFromWebBody(body: NodeReadableStream | ReadableStream | null | undefined): Readable {
  if (!body) throw new Error("response body is empty");
  return Readable.fromWeb(body as NodeReadableStream);
}

export function readableToWebBody(stream: Readable) {
  return Readable.toWeb(stream);
}
