import type { ITheme } from "@xterm/xterm";

import { getKokoThemeAdapter } from "#koko/host";
import xtermTheme from "xterm-theme";
import { defaultTheme } from "#koko/utils/config";

/** 跟随项目主题（data-theme-preset / dark-light / Luna 动态预设）的终端配色 */
export function appTerminalTheme(): ITheme {
  return getKokoThemeAdapter().xterm();
}

/** xterm-theme 具名主题，用于显式指定 terminal_theme_name 的场景（独立 /koko/connect 路由） */
export const terminalTheme = (themeName: string) => {
  if (!(xtermTheme as Record<string, typeof defaultTheme>)[themeName]) {
    return defaultTheme;
  }
  return (xtermTheme as Record<string, typeof defaultTheme>)[themeName];
};
