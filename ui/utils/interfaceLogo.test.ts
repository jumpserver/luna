import { describe, expect, it } from "vitest";
import { isDefaultInterfaceLogo } from "./interfaceLogo";

describe("isDefaultInterfaceLogo", () => {
  it.each([
    undefined,
    "",
    "  ",
    "/static/img/logo.png",
    "/static/img/logo_white.png",
    "/static/img/logo_text_white.svg",
    "https://example.com/jumpserver/static/img/logo.png?v=5#logo"
  ])("uses local branding for %s", (value) => {
    expect(isDefaultInterfaceLogo(value)).toBe(true);
  });

  it.each([
    "/media/interface/logo.png",
    "/media/logo_text_white.svg",
    "https://example.com/custom/logo.png",
    "/media/brand.svg?original=/static/img/logo.png"
  ])("preserves custom branding for %s", (value) => {
    expect(isDefaultInterfaceLogo(value)).toBe(false);
  });
});
