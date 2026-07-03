import xtermTheme from "xterm-theme";
import { defaultTheme } from "~/koko/utils/config";

export const terminalTheme = (themeName: string) => {
  if (!(xtermTheme as Record<string, typeof defaultTheme>)[themeName]) {
    return defaultTheme;
  }
  return (xtermTheme as Record<string, typeof defaultTheme>)[themeName];
};
