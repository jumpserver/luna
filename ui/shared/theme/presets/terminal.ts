import xtermTheme from "xterm-theme";

export interface TerminalThemePresetOption {
  id: string;
  label: string;
  source: "follow-app" | "xterm-theme";
}

const xtermPresetIds = Object.keys(xtermTheme).sort((a, b) => a.localeCompare(b));

export const TERMINAL_THEME_PRESETS: TerminalThemePresetOption[] = [
  { id: "follow-app", label: "Follow App Theme", source: "follow-app" },
  ...xtermPresetIds.map((id) => ({
    id,
    label: id,
    source: "xterm-theme" as const
  }))
];
