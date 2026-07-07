import type { ITheme } from "@xterm/xterm";

import { isDarkColor } from "~/koko/utils/color";
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

export function toXtermTheme(tokens = readResolvedTerminalTokens()): ITheme {
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
