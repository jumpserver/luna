import { describe, expect, it } from "vitest";

import { normalizeLanguageCode, toIntlLocale } from "./index";

describe("language normalization", () => {
  it.each([
    ["zh-CN", "zh"],
    ["zh-Hans-CN", "zh"],
    ["zh-TW", "zh_hant"],
    ["zh-Hant-HK", "zh_hant"],
    ["pt-PT", "pt_br"],
    ["pt_BR", "pt_br"],
    ["es-MX", "es"],
    ["ru-RU", "ru"],
    ["ko-KR", "ko"],
    ["vi-VN", "vi"],
    ["de-DE", "en"]
  ])("maps %s to %s", (input, expected) => {
    expect(normalizeLanguageCode(input)).toBe(expected);
  });

  it("returns valid BCP 47 locale tags for underscored app language codes", () => {
    expect(toIntlLocale("zh_hant")).toBe("zh-TW");
    expect(toIntlLocale("pt_br")).toBe("pt-BR");
    expect(() => new Intl.DateTimeFormat(toIntlLocale("pt_br"))).not.toThrow();
  });
});
