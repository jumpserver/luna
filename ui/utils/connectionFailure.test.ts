import { describe, expect, it } from "vitest";
import { normalizeConnectionFailure } from "~/utils/connectionFailure";

describe("normalizeConnectionFailure", () => {
  it("removes terminal control sequences and HTML while preserving readable lines", () => {
    expect(
      normalizeConnectionFailure("\u001B[31m<p>Connecting</p>\r\n<p>Authentication failed\u0000</p>\u001B[0m")
    ).toBe("Connecting\nAuthentication failed");
  });

  it("drops a binary prefix while retaining the terminal diagnostic", () => {
    expect(normalizeConnectionFailure("\u0000\u0000\u0000\u00102.3.4开始连接 root: ssh: handshake failed: EOF")).toBe(
      "开始连接 root: ssh: handshake failed: EOF"
    );
  });

  it("removes binary packets embedded between terminal lines", () => {
    expect(
      normalizeConnectionFailure(
        "开始连接 root(root)\u0000.\u0001.\u0002.\u0003.\u0004.\u0005.\u0006.\u0007.\u0008.\u0009开始连接 root(root) error: ssh: handshake failed: EOF"
      )
    ).toBe("开始连接 root(root)\n开始连接 root(root) error: ssh: handshake failed: EOF");
  });

  it("keeps the last ten non-empty lines", () => {
    const message = Array.from({ length: 12 }, (_, index) => `line-${index + 1}`).join("\n");

    expect(normalizeConnectionFailure(message)).toBe(
      Array.from({ length: 10 }, (_, index) => `line-${index + 3}`).join("\n")
    );
  });
});
