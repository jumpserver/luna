import { describe, expect, it } from "vitest";
import { CODEMIRROR_THEME_PRESETS, isCodeMirrorThemePresetId } from "./codemirror";

describe("codemirror theme presets", () => {
  it("keeps ids without loading editor theme packages", () => {
    expect(isCodeMirrorThemePresetId("follow-app")).toBe(true);
    expect(isCodeMirrorThemePresetId("tokyo-night")).toBe(true);
    expect(isCodeMirrorThemePresetId("not-a-theme")).toBe(false);
    expect(CODEMIRROR_THEME_PRESETS.every((preset) => !("extension" in preset))).toBe(true);
  });
});
