import type { ITheme, Terminal } from "@xterm/xterm";
import { describe, expect, it } from "vitest";
import { applyXtermTheme, syncXtermBackground } from "#koko/utils/terminalTheme";
import baseCss from "../../../assets/css/base.css?raw";

function createTerminalStub(initialTheme: ITheme = {}) {
  const styles = new Map<string, string>();
  const terminal = {
    options: { theme: initialTheme },
    element: {
      style: {
        setProperty: (name: string, value: string) => styles.set(name, value),
        removeProperty: (name: string) => styles.delete(name)
      }
    }
  } as unknown as Terminal;

  return { terminal, styles };
}

describe("terminal theme background", () => {
  it("paints the xterm root and legacy viewport with the resolved theme background", () => {
    expect(baseCss).toMatch(/\.xterm\s*\{[^}]*background-color:\s*var\(--xterm-theme-background/);
    expect(baseCss).toMatch(/\.xterm \.xterm-viewport\s*\{[^}]*background-color:\s*var\(--xterm-theme-background/);
  });

  it("uses the xterm theme background for the padded root and legacy viewport", () => {
    const { terminal, styles } = createTerminalStub();
    const theme = { background: "#221f4b", foreground: "#ffffff" };

    applyXtermTheme(terminal, theme);

    expect(terminal.options.theme).toBe(theme);
    expect(styles.get("--xterm-theme-background")).toBe("#221f4b");
  });

  it("clears the override when a theme has no explicit background", () => {
    const { terminal, styles } = createTerminalStub({ background: "#ffffff" });
    syncXtermBackground(terminal);
    expect(styles.get("--xterm-theme-background")).toBe("#ffffff");

    syncXtermBackground(terminal, {});
    expect(styles.has("--xterm-theme-background")).toBe(false);
  });
});
