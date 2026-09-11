import { gzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  assignPartTotals,
  classifyOfflineName,
  isTarBuffer,
  isTarPackageName,
  parsePartIndex,
  resolvePlayableMedia,
  stripOfflineExtension,
  stripReplayJsonExtension
} from "./offlineMedia";

function toBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function gzipNamed(bytes: Uint8Array) {
  const gz = gzipSync(bytes);
  return toBuffer(gz);
}

function mp4Bytes() {
  const mp4 = new Uint8Array(32);
  mp4.set([0x66, 0x74, 0x79, 0x70], 4);
  return mp4;
}

const CAST = new TextEncoder().encode('{"version":2,"width":80,"height":24}\n');
const GUA = new TextEncoder().encode("4.size,1024,768;");

describe("classifyOfflineName", () => {
  it.each([
    ["generated_video (8).mp4", "mp4", undefined],
    ["session.0.part.mp4", "mp4", 0],
    ["session.replay.mp4", "mp4", undefined],
    ["session.0.part.gz", "gua", 0],
    ["session.replay.gz", "gua", undefined],
    ["session.cast", "cast", undefined],
    ["session.cast.gz", "cast", undefined],
    ["session.1.part.cast.gz", "cast", 1],
    ["session.0.cast", "cast", 0],
    ["session.replay.json", "metadata", undefined],
    ["generated_video.gz", null, undefined]
  ] as const)("%s → %s", (name, kind, partIndex) => {
    expect(classifyOfflineName(name)).toEqual({ kind, partIndex });
  });
});

describe("resolvePlayableMedia", () => {
  it("unwraps gzipped mp4 named .gz", () => {
    const resolved = resolvePlayableMedia("generated_video.gz", gzipNamed(mp4Bytes()));
    expect(resolved?.type).toBe("mp4");
    expect(resolved && new Uint8Array(resolved.buffer).slice(4, 8)).toEqual(new Uint8Array([0x66, 0x74, 0x79, 0x70]));
  });

  it("does not treat gzipped cast or gua as mp4", () => {
    expect(resolvePlayableMedia("generated_video.gz", gzipNamed(CAST))?.type).toBe("cast");
    expect(resolvePlayableMedia("generated_video.gz", gzipNamed(GUA))?.type).toBe("gua");
  });

  it("keeps named gua/cast gzip buffers compressed", () => {
    const gua = gzipNamed(GUA);
    const cast = gzipNamed(CAST);
    expect(resolvePlayableMedia("session.replay.gz", gua)?.buffer).toBe(gua);
    expect(resolvePlayableMedia("session.cast.gz", cast)?.buffer).toBe(cast);
  });

  it("returns null for unknown gzip", () => {
    expect(resolvePlayableMedia("notes.gz", gzipNamed(new TextEncoder().encode("hello")))).toBeNull();
  });

  it("parses part indexes for all three media types", () => {
    expect(parsePartIndex("a.1.part.mp4")).toBe(1);
    expect(parsePartIndex("a.1.part.cast.gz")).toBe(1);
    expect(parsePartIndex("a.0.part.gz")).toBe(0);
    expect(isTarPackageName("session.tar.gz")).toBe(true);
    expect(isTarPackageName("generated_video.gz")).toBe(false);
    expect(stripOfflineExtension("session.0.part.gz")).toBe("session");
    expect(stripReplayJsonExtension("session.replay.json")).toBe("session");
    expect(stripReplayJsonExtension("session.json")).toBe("session");
  });

  it("assigns part totals per media type", () => {
    const items: Array<{ type: string; name: string; partIndex?: number; partTotal?: number }> = [
      { type: "gua", name: "a.0.part.gz", partIndex: 1 },
      { type: "gua", name: "a.1.part.gz", partIndex: 2 },
      { type: "mp4", name: "clip.mp4" }
    ];
    assignPartTotals(items);
    expect(items[0]?.partTotal).toBe(2);
    expect(items[1]?.partTotal).toBe(2);
    expect(items[2]?.partTotal).toBeUndefined();
  });

  it("does not merge part totals across different gua stems", () => {
    const items: Array<{ type: string; name: string; partIndex?: number; partTotal?: number }> = [
      { type: "gua", name: "alpha.0.part.gz", partIndex: 1 },
      { type: "gua", name: "alpha.1.part.gz", partIndex: 2 },
      { type: "gua", name: "beta.0.part.gz", partIndex: 1 },
      { type: "gua", name: "beta.1.part.gz", partIndex: 2 }
    ];
    assignPartTotals(items);
    expect(items[0]?.partTotal).toBe(2);
    expect(items[1]?.partTotal).toBe(2);
    expect(items[2]?.partTotal).toBe(2);
    expect(items[3]?.partTotal).toBe(2);
  });

  it("sniffs tar magic and rejects a gzip-wrapped tar named as replay", () => {
    const tar = new Uint8Array(300);
    tar.set([0x75, 0x73, 0x74, 0x61, 0x72], 257);
    expect(isTarBuffer(toBuffer(tar))).toBe(true);
    expect(resolvePlayableMedia("session.replay.gz", gzipNamed(tar))).toBeNull();
  });
});
