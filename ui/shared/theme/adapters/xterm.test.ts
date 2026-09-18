import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const terminalThemePreset = ref("Atom");

vi.mock("~/composables/useSettingManager", () => ({
  useSettingManager: () => ({ terminalThemePreset })
}));

const tokens = {
  background: "#111111",
  foreground: "#eeeeee",
  cursor: "#eeeeee",
  selection: "#333333"
};

describe("named xterm themes", () => {
  it("keeps follow-app colors until named themes load", async () => {
    const { ensureNamedXtermThemes, toXtermTheme } = await import("./xterm");

    const before = toXtermTheme(tokens);
    expect(before.background).toBe("#111111");

    await ensureNamedXtermThemes();

    const after = toXtermTheme(tokens);
    expect(after.background).not.toBe("#111111");
    expect(after.background).toBeTruthy();
  });

  it("maps ANSI white to the theme foreground so MOTD follows light and dark", async () => {
    terminalThemePreset.value = "follow-app";
    const { toXtermTheme } = await import("./xterm");
    const dark = toXtermTheme(tokens);
    const light = toXtermTheme({
      background: "#fafafa",
      foreground: "#222222",
      cursor: "#222222",
      selection: "#dddddd"
    });

    expect(dark.white).toBe(tokens.foreground);
    expect(dark.brightWhite).toBe(tokens.foreground);
    expect(light.white).toBe("#222222");
    expect(light.brightWhite).toBe("#222222");
  });
});
