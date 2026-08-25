import { gzipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { decodeRecordingBytes } from "#online-player/utils/recordingSource";

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("decodeRecordingBytes", () => {
  it("keeps plain recording data unchanged", () => {
    const source = strToU8('{"version":2,"width":80,"height":24}\n');
    expect(decode(decodeRecordingBytes(source.buffer as ArrayBuffer))).toBe(decode(source));
  });

  it("decompresses gzip recording data", () => {
    const source = "4.size,1.0,3.800,3.600;4.sync,3.100;";
    const compressed = gzipSync(strToU8(source));
    expect(decode(decodeRecordingBytes(compressed.buffer as ArrayBuffer))).toBe(source);
  });
});
