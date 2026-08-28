import { describe, expect, it } from "vitest";
import {
  buildWatermarkViewer,
  resolveWatermarkTemplate,
  shouldShowAppWatermark,
  softenWatermarkColor
} from "~/utils/watermark";

describe("resolveWatermarkTemplate", () => {
  it("prefers console content over session content", () => {
    const consoleContent = ["console $", "{name}"].join("");
    const sessionContent = ["session $", "{name}"].join("");
    expect(
      resolveWatermarkTemplate({
        SECURITY_WATERMARK_CONSOLE_CONTENT: consoleContent,
        SECURITY_WATERMARK_SESSION_CONTENT: sessionContent
      })
    ).toBe(consoleContent);
  });

  it("falls back to session content when console is blank", () => {
    const sessionContent = ["session $", "{name}"].join("");
    expect(
      resolveWatermarkTemplate({
        SECURITY_WATERMARK_CONSOLE_CONTENT: "  ",
        SECURITY_WATERMARK_SESSION_CONTENT: sessionContent
      })
    ).toBe(sessionContent);
  });
});

describe("shouldShowAppWatermark", () => {
  it("hides when logged out, disabled, or on replay routes", () => {
    expect(shouldShowAppWatermark({ loggedIn: false, enabled: true, path: "/" })).toBe(false);
    expect(shouldShowAppWatermark({ loggedIn: true, enabled: false, path: "/" })).toBe(false);
    expect(shouldShowAppWatermark({ loggedIn: true, enabled: true, path: "/replay/sid-1" })).toBe(false);
  });

  it("shows after login on non-replay routes", () => {
    expect(shouldShowAppWatermark({ loggedIn: true, enabled: true, path: "/" })).toBe(true);
  });
});

describe("buildWatermarkViewer", () => {
  it("formats name(username) and falls back to name", () => {
    expect(buildWatermarkViewer("张三", "zhangsan")).toBe("张三(zhangsan)");
    expect(buildWatermarkViewer("张三", "")).toBe("张三");
  });
});

describe("softenWatermarkColor", () => {
  it("clamps opaque rgb and hex colors to a light overlay alpha", () => {
    expect(softenWatermarkColor("rgba(255, 255, 255, 0.4)")).toBe("rgba(255, 255, 255, 0.1)");
    expect(softenWatermarkColor("#fff")).toBe("rgba(255, 255, 255, 0.1)");
    expect(softenWatermarkColor("#cccccc")).toBe("rgba(204, 204, 204, 0.1)");
  });

  it("keeps colors that are already at or below the max alpha", () => {
    expect(softenWatermarkColor("rgba(255,255,255,0.08)")).toBe("rgba(255, 255, 255, 0.08)");
  });
});
