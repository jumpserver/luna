import { afterEach, describe, expect, it, vi } from "vitest";
import { isFileTransferChecksumState } from "#koko/utils/file-transfer/checksum";
import { chainTransferChecksum, emptyTransferChecksumState, sha256Hex } from "#koko/utils/file-transfer/sha256";

const abc = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const empty = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

describe("file transfer sha256", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("matches the SHA-256 test vectors", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(abc);
    expect(await sha256Hex(new Uint8Array())).toBe(empty);
  });

  it("falls back to JS when crypto.subtle is missing", async () => {
    vi.stubGlobal("crypto", { subtle: undefined });
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(abc);
    expect(await sha256Hex(new Uint8Array())).toBe(empty);
  });

  it("folds chunk hashes in order without re-hashing their contents", async () => {
    let state = emptyTransferChecksumState();
    state = await chainTransferChecksum(state, await sha256Hex(new TextEncoder().encode("hello")));
    state = await chainTransferChecksum(state, await sha256Hex(new TextEncoder().encode("world")));
    expect(state).toBe("98d128df384d428ffe76af3c0198ff1e8945ef71e741ba440bafff0510da8f22");
  });

  it("rejects corrupt persisted chain state", async () => {
    expect(isFileTransferChecksumState(abc)).toBe(true);
    expect(isFileTransferChecksumState('{"h":[]}')).toBe(false);
    expect(() => chainTransferChecksum("broken", abc)).toThrow("Invalid file transfer checksum state");
  });
});
