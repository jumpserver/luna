import type { AppThemeDefinition, ThemeSeedTokens } from "./schema";

interface ZedThemeStyleContent {
  appearance?: "light" | "dark";
  theme?: Record<string, string>;
  style?: Record<string, string>;
  name?: string;
}

interface ZedThemeFile {
  $schema?: string;
  name?: string;
  author?: string;
  themes?: ZedThemeStyleContent[];
}

const pick = (record: Record<string, string> | undefined, ...keys: string[]) => {
  for (const key of keys) {
    const value = record?.[key];
    if (value) return value;
  }
  return undefined;
};

export function mapZedThemeToAppTheme(zedTheme: ZedThemeFile, appearance: "light" | "dark"): AppThemeDefinition | null {
  const source = zedTheme.themes?.find((item) => item.appearance === appearance) || zedTheme.themes?.[0];
  if (!source) return null;

  const theme = source.theme || {};
  const style = source.style || {};

  const seed: ThemeSeedTokens = {
    bg: pick(theme, "background", "editor.background") || (appearance === "dark" ? "#1e1e1e" : "#ffffff"),
    fg: pick(theme, "text", "editor.foreground") || (appearance === "dark" ? "#e5e5e5" : "#222222"),
    muted: pick(theme, "text.muted", "text.disabled") || (appearance === "dark" ? "#8a8a8a" : "#777777"),
    border: pick(theme, "border", "border.variant") || (appearance === "dark" ? "#333333" : "#d9d9d9"),
    accent: pick(theme, "element.active", "status_bar.background", "link_text.hover") || "#1ab394",
    surface:
      pick(theme, "surface.background", "panel.background", "tab.inactive_background") ||
      (appearance === "dark" ? "#252525" : "#f5f5f5"),
    surfaceHover:
      pick(theme, "element.hover", "tab.active_background", "panel.focused_border") ||
      (appearance === "dark" ? "#313131" : "#ececec"),
    shadowSoft:
      appearance === "dark"
        ? "0 1px 2px rgba(0, 0, 0, 0.42), 0 2px 8px rgba(0, 0, 0, 0.3)"
        : "0 1px 2px rgba(17, 17, 17, 0.05), 0 2px 8px rgba(17, 17, 17, 0.04)"
  };

  return {
    id: `zed-${zedTheme.name || source.name || appearance}`,
    label: source.name || zedTheme.name || `Zed ${appearance} theme`,
    appearance,
    seed,
    ui: {},
    editor: {
      background: pick(theme, "editor.background") || seed.bg,
      foreground: pick(theme, "editor.foreground") || seed.fg,
      gutterBackground: pick(theme, "editor.gutter.background") || seed.surface,
      gutterForeground: pick(theme, "editor.gutter.foreground", "editor.line_number") || seed.muted,
      lineHighlight: pick(theme, "editor.line_background") || seed.surfaceHover,
      selection: pick(theme, "editor.selection_background") || style["selection.background"] || seed.accent,
      cursor: pick(theme, "editor.cursor") || style.cursor || seed.accent
    },
    syntax: {
      keyword: pick(style, "syntax.keyword") || seed.accent,
      string: pick(style, "syntax.string") || "#2f8f5b",
      number: pick(style, "syntax.number") || "#c05a2b",
      comment: pick(style, "syntax.comment") || seed.muted,
      variable: pick(style, "syntax.variable") || seed.fg,
      type: pick(style, "syntax.type") || "#2f6fda",
      function: pick(style, "syntax.function") || "#8a4ecb",
      operator: pick(style, "syntax.operator") || seed.fg
    },
    terminal: {
      background: pick(theme, "terminal.background") || seed.bg,
      foreground: pick(theme, "terminal.foreground") || seed.fg,
      cursor: pick(theme, "terminal.cursor") || seed.accent,
      selection: pick(theme, "terminal.selection_background") || seed.accent
    },
    dataGrid: {},
    workspace: {},
    metadata: {
      source: "zed-import",
      sourceThemeId: zedTheme.name || source.name || appearance,
      sourceThemeName: source.name || zedTheme.name || "Zed Theme"
    }
  };
}
