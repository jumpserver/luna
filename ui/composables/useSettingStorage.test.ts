import { describe, expect, it } from "vitest";
import {
  DEFAULT_FONT_SIZE,
  DEFAULT_STATE,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  normalizeFontSize
} from "~/composables/useSettingStorage";

describe("user setting defaults", () => {
  it("enables terminal command suggestions for existing settings without the field", () => {
    expect(DEFAULT_STATE.terminalCommandSuggestionsEnabled).toBe(true);
  });

  it("keeps modern island layout off until the user opts in", () => {
    expect(DEFAULT_STATE.modernIsland).toBe(false);
  });

  it("defaults corner radius to the current small control radius", () => {
    expect(DEFAULT_STATE.uiRadius).toBe("small");
  });

  it("keeps debug logging off by default", () => {
    expect(DEFAULT_STATE.debugLog).toBe(false);
  });
});

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
