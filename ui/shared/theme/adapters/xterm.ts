import type { ITheme } from "@xterm/xterm";

import { useSettingManager } from "~/composables/useSettingManager";
import { isDarkColor } from "~/shared/theme/color";
import { readResolvedTerminalTokens } from "~/shared/theme/resolvedTokens";

const DARK_ANSI = {
  black: "#3f4451",
  red: "#e06c75",
  green: "#98c379",
  yellow: "#e5c07b",
  blue: "#61afef",
  magenta: "#c678dd",
  cyan: "#56b6c2",
  white: "#d7dae0",
  brightBlack: "#5c6370",
  brightRed: "#ef7b85",
  brightGreen: "#a9d47f",
  brightYellow: "#f0cf8a",
  brightBlue: "#74bdf7",
  brightMagenta: "#d58ae5",
  brightCyan: "#6cc9d5",
  brightWhite: "#f0f2f5"
} as const;

const LIGHT_ANSI = {
  black: "#3a3d45",
  red: "#ca1243",
  green: "#3d8a26",
  yellow: "#a8660d",
  blue: "#1a5fb4",
  magenta: "#8e3ab5",
  cyan: "#0e7490",
  white: "#a0a1a7",
  brightBlack: "#6b6f7a",
  brightRed: "#e45649",
  brightGreen: "#50a14f",
  brightYellow: "#c18401",
  brightBlue: "#2d78d6",
  brightMagenta: "#a626a4",
  brightCyan: "#0997b3",
  brightWhite: "#111111"
} as const;

let namedThemes: Record<string, ITheme> | undefined;
let namedThemesLoading: Promise<Record<string, ITheme>> | undefined;

function notifyTerminalThemePresetObservers() {
  if (!import.meta.client) return;
  const root = document.documentElement;
  const current = root.dataset.terminalThemePreset ?? "";
  delete root.dataset.terminalThemePreset;
  root.dataset.terminalThemePreset = current;
}

export function ensureNamedXtermThemes() {
  namedThemesLoading ??= import("xterm-theme")
    .then((module) => {
      namedThemes = module.default as Record<string, ITheme>;
      notifyTerminalThemePresetObservers();
      return namedThemes;
    })
    .catch((error: unknown) => {
      namedThemesLoading = undefined;
      throw error;
    });
  return namedThemesLoading;
}

export function toXtermTheme(tokens = readResolvedTerminalTokens()): ITheme {
  const selected = useSettingManager().terminalThemePreset.value;
  if (selected !== "follow-app") {
    const preset = namedThemes?.[selected];
    if (preset) return preset;
    void ensureNamedXtermThemes();
  }

  const dark = isDarkColor(tokens.background);

  return {
    background: tokens.background,
    foreground: tokens.foreground,
    cursor: tokens.cursor,
    cursorAccent: tokens.background,
    selectionBackground: tokens.selection,
    ...(dark ? DARK_ANSI : LIGHT_ANSI)
  };
}
