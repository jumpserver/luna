import { describe, expect, it } from "vitest";
import { DEFAULT_FONT_SIZE, MAX_FONT_SIZE, MIN_FONT_SIZE, normalizeFontSize } from "~/composables/useSettingStorage";

describe("normalizeFontSize", () => {
  it("uses 13px when a stored value is missing or invalid", () => {
    expect(normalizeFontSize(undefined)).toBe(DEFAULT_FONT_SIZE);
    expect(normalizeFontSize(Number.NaN)).toBe(DEFAULT_FONT_SIZE);
  });

  it("rounds and constrains configured font sizes", () => {
    expect(normalizeFontSize(12.6)).toBe(13);
    expect(normalizeFontSize(MIN_FONT_SIZE - 1)).toBe(MIN_FONT_SIZE);
    expect(normalizeFontSize(MAX_FONT_SIZE + 1)).toBe(MAX_FONT_SIZE);
  });
});
