export type ThemePresetId
  = | "latte"
    | "matcha"
    | "claude"
    | "gemini"
    | "mono"
    | "luna-default"
    | "luna-darkgray"
    | "luna-deepblue"
    | "mocha"
    | "macchiato"
    | "frappe"
    | "kanagawa"
    | "ayu"
    | "rose-pine"
    | "codex"
    | "cursor"
    | "mono-dark";

export interface ThemePresetOption {
  id: ThemePresetId
  label: string
  accent: string
  family?: "markamd" | "luna"
  baseColor?: string
}

export const LIGHT_THEME_PRESETS: ThemePresetOption[] = [
  { id: "latte", label: "Catppuccin Latte", accent: "#fe640b" },
  { id: "matcha", label: "Matcha Washi", accent: "#7b9a4e" },
  { id: "claude", label: "Claude Parchment", accent: "#c96442" },
  { id: "gemini", label: "Gemini Air", accent: "#1a73e8" },
  { id: "mono", label: "Mono Paper", accent: "#111111" }
];

export const DARK_THEME_PRESETS: ThemePresetOption[] = [
  { id: "luna-default", label: "Luna Default", accent: "#1ab394", family: "luna", baseColor: "#483D3D" },
  { id: "luna-darkgray", label: "Luna DarkGray", accent: "#1ab394", family: "luna", baseColor: "#303237" },
  { id: "luna-deepblue", label: "Luna DeepBlue", accent: "#1ab394", family: "luna", baseColor: "#1A212C" },
  { id: "mocha", label: "Catppuccin Mocha", accent: "#fab387" },
  { id: "macchiato", label: "Catppuccin Macchiato", accent: "#f5a97f" },
  { id: "frappe", label: "Catppuccin Frappe", accent: "#ca9ee6" },
  { id: "kanagawa", label: "Kanagawa Ink", accent: "#7e9cd8" },
  { id: "ayu", label: "Ayu Mirage", accent: "#ffa759" },
  { id: "rose-pine", label: "Rosé Pine", accent: "#ebbcba" },
  { id: "codex", label: "Codex Graphite", accent: "#10a37f" },
  { id: "cursor", label: "Cursor Noir", accent: "#f7f7f4" },
  { id: "mono-dark", label: "Mono Dark", accent: "#ffffff" }
];

const presetMap = new Map(
  [...LIGHT_THEME_PRESETS, ...DARK_THEME_PRESETS].map((preset) => [preset.id, preset] as const)
);

export const DEFAULT_LIGHT_THEME_PRESET: ThemePresetId = "latte";
export const DEFAULT_DARK_THEME_PRESET: ThemePresetId = "mocha";

export const isThemePresetId = (value: string): value is ThemePresetId => presetMap.has(value as ThemePresetId);

export const getThemePreset = (id: string | null | undefined) => (id && presetMap.get(id as ThemePresetId)) || null;

export const isLunaThemePreset = (id: string | null | undefined) => getThemePreset(id)?.family === "luna";
