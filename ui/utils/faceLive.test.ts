import { describe, expect, it } from "vitest";

import {
  buildFaceLivePageUrl,
  buildFaceLiveRendererPageUrl,
  buildFaceLiveWebSocketUrl,
  collectActiveFaceMonitorTokens,
  createFaceMonitorToken,
  isFaceCaptureToken,
  isFaceLiveHostMessage,
  resolveJumpServerPrefix
} from "./faceLive";

describe("face live routing", () => {
  it("keeps a deployment prefix for Luna pages and WebSocket routes", () => {
    expect(resolveJumpServerPrefix("/tenant-a", "/tenant-a/luna/workspace")).toBe("/tenant-a");
    expect(
      buildFaceLivePageUrl({
        siteUrl: "https://jump.example/tenant-a",
        rendererPath: "/tenant-a/luna/workspace",
        token: "a".repeat(32)
      })
    ).toBe(`https://jump.example/tenant-a/luna/facelive/capture?token=${"a".repeat(32)}`);
    expect(
      buildFaceLiveWebSocketUrl({
        siteUrl: "https://jump.example/tenant-a",
        rendererPath: "/tenant-a/luna/facelive/monitor",
        token: "b".repeat(32),
        mode: "monitor"
      })
    ).toBe(`wss://jump.example/tenant-a/ws/facelive/capture/?token=${"b".repeat(32)}&mode=monitor`);
  });

  it("uses root routes without adding duplicate app prefixes", () => {
    expect(resolveJumpServerPrefix("/", "/luna/facelive/capture")).toBe("");
    expect(buildFaceLivePageUrl({ siteUrl: "http://localhost:3000", token: "x".repeat(32), mode: "monitor" })).toBe(
      `http://localhost:3000/luna/facelive/monitor?token=${"x".repeat(32)}`
    );
  });

  it("renders desktop capture locally while retaining the selected site", () => {
    const token = "e".repeat(32);
    expect(
      buildFaceLiveRendererPageUrl({
        rendererUrl: "http://127.0.0.1:3000/luna/",
        siteUrl: "http://localhost:9528",
        token
      })
    ).toBe(`http://127.0.0.1:3000/luna/facelive/capture?token=${token}&site=http%3A%2F%2Flocalhost%3A9528`);
  });

  it("supports a dedicated WebSocket service origin", () => {
    expect(
      buildFaceLiveWebSocketUrl({
        siteUrl: "http://localhost:9528/luna/facelive/capture",
        rendererPath: "/luna/facelive/capture",
        socketBaseUrl: "http://localhost:8080",
        token: "c".repeat(32),
        mode: "capture"
      })
    ).toBe(`ws://localhost:8080/ws/facelive/capture/?token=${"c".repeat(32)}&mode=capture`);

    expect(
      buildFaceLiveWebSocketUrl({
        siteUrl: "https://ui.example/luna/facelive/capture",
        socketBaseUrl: "wss://core.example/tenant-a/",
        token: "d".repeat(32),
        mode: "monitor"
      })
    ).toBe(`wss://core.example/tenant-a/ws/facelive/capture/?token=${"d".repeat(32)}&mode=monitor`);
  });
});

describe("face live security helpers", () => {
  it("accepts only bounded URL-safe tokens and structured host messages", () => {
    expect(isFaceCaptureToken("a".repeat(16))).toBe(true);
    expect(isFaceCaptureToken("short")).toBe(false);
    expect(isFaceCaptureToken(`bad/${"a".repeat(20)}`)).toBe(false);
    expect(isFaceLiveHostMessage({ source: "jumpserver-facelive", event: "retry_requested", mode: "capture" })).toBe(
      true
    );
    expect(isFaceLiveHostMessage({ source: "other", event: "retry_requested", mode: "capture" })).toBe(false);
  });

  it("creates cryptographically generated URL-safe monitor tokens", () => {
    const token = createFaceMonitorToken({
      randomUUID: () => "12345678-1234-1234-1234-123456789abc"
    } as unknown as Crypto);
    expect(token).toBe("12345678123412341234123456789abc");
    expect(isFaceCaptureToken(token)).toBe(true);
  });

  it("deduplicates active monitor sessions and ignores stopped panes", () => {
    const token = "m".repeat(32);
    expect(
      collectActiveFaceMonitorTokens([
        {
          panes: [
            { status: "connected", payload: { token: { face_monitor_token: token } } },
            { status: "ready", payload: { face_monitor_token: token } },
            { status: "disconnected", payload: { face_monitor_token: "n".repeat(32) } }
          ]
        }
      ])
    ).toEqual([{ token, sessions: 2 }]);
  });
});
