import type { ITheme, Terminal } from "@xterm/xterm";

import { getKokoThemeAdapter } from "#koko/host";
import xtermTheme from "xterm-theme";
import { defaultTheme } from "#koko/utils/config";

/** 跟随项目主题（data-theme-preset / dark-light / Luna 动态预设）的终端配色 */
export function appTerminalTheme(): ITheme {
  return getKokoThemeAdapter().xterm();
}

/** xterm-theme 具名主题，用于显式指定 terminal_theme_name 的场景（独立 /koko/connect 路由） */
export const terminalTheme = (themeName: string) => {
  return (xtermTheme as Record<string, ITheme>)[themeName] || defaultTheme;
};

/** Keep xterm's padded root and legacy viewport aligned with the active renderer theme. */
export function syncXtermBackground(terminal: Terminal, theme: ITheme | undefined = terminal.options.theme) {
  const background = theme?.background;
  if (background) terminal.element?.style.setProperty("--xterm-theme-background", background);
  else terminal.element?.style.removeProperty("--xterm-theme-background");
}

export function applyXtermTheme(terminal: Terminal, theme: ITheme) {
  terminal.options.theme = theme;
  syncXtermBackground(terminal, theme);
}
