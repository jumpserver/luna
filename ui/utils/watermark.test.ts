import { describe, expect, it } from "vitest";
import {
  buildWatermarkViewer,
  interpolateWatermark,
  isWatermarkSettingEnabled,
  resolveWatermarkTemplate,
  shouldShowAppWatermark,
  softenWatermarkColor
} from "~/utils/watermark";

describe("resolveWatermarkTemplate", () => {
  const consoleContent = `\${userName}(\${name})`;
  const sessionContent = `\${name}(\${userName})(\${assetAddress})\n\${assetName}`;

  it("uses console content outside asset sessions", () => {
    expect(
      resolveWatermarkTemplate(
        {
          SECURITY_WATERMARK_CONSOLE_CONTENT: consoleContent,
          SECURITY_WATERMARK_SESSION_CONTENT: sessionContent
        },
        false
      )
    ).toBe(consoleContent);
  });

  it("renders session asset fields even when console content is configured", () => {
    const template = resolveWatermarkTemplate(
      {
        SECURITY_WATERMARK_CONSOLE_CONTENT: consoleContent,
        SECURITY_WATERMARK_SESSION_CONTENT: sessionContent
      },
      true
    );
    expect(
      interpolateWatermark(template, {
        name: "张三",
        userName: "zhangsan",
        assetName: "服务器01",
        assetAddress: "192.168.1.1"
      })
    ).toBe("张三(zhangsan)(192.168.1.1)\n服务器01");
  });

  it("falls back to session content when console is blank", () => {
    expect(
      resolveWatermarkTemplate(
        {
          SECURITY_WATERMARK_CONSOLE_CONTENT: "  ",
          SECURITY_WATERMARK_SESSION_CONTENT: sessionContent
        },
        false
      )
    ).toBe(sessionContent);
  });

  it.each([undefined, "", "  "])("falls back to console content when session content is %j", (sessionContent) => {
    expect(
      resolveWatermarkTemplate(
        {
          SECURITY_WATERMARK_CONSOLE_CONTENT: consoleContent,
          SECURITY_WATERMARK_SESSION_CONTENT: sessionContent
        },
        true
      )
    ).toBe(consoleContent);
  });
});

describe("isWatermarkSettingEnabled", () => {
  it("accepts boolean, numeric, and string flags", () => {
    expect(isWatermarkSettingEnabled(true)).toBe(true);
    expect(isWatermarkSettingEnabled(1)).toBe(true);
    expect(isWatermarkSettingEnabled("true")).toBe(true);
    expect(isWatermarkSettingEnabled(false)).toBe(false);
    expect(isWatermarkSettingEnabled(undefined)).toBe(false);
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
