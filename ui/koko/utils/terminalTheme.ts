import type { ITheme } from "@xterm/xterm";

import xtermTheme from "xterm-theme";
import { isDarkColor, parseColorToRgb } from "~/koko/utils/color";
import { defaultTheme } from "~/koko/utils/config";

// 暗色背景下的 ANSI 16 色（柔和高亮度，保证对比度）
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
};

// 亮色背景下的 ANSI 16 色（加深，避免浅底浅字）
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
};

/**
 * 主题变量大量用 color-mix()，xterm 只认 hex/rgb：
 * 用探针元素让浏览器解析（计算值可能是 color(srgb ...) 形式），再规范化成 rgb() 字符串
 */
function resolveCssColor(varName: string, fallback: string): string {
  if (!import.meta.client) return fallback;

  const probe = document.createElement("span");
  probe.style.setProperty("color", `var(${varName})`);
  probe.style.setProperty("position", "absolute");
  probe.style.setProperty("visibility", "hidden");
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();

  const rgb = parseColorToRgb(resolved);
  return rgb ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : fallback;
}

/** 跟随项目主题（data-theme-preset / dark-light / Luna 动态预设）的终端配色 */
export function appTerminalTheme(): ITheme {
  const background = resolveCssColor("--app-main-bg", "#121414");
  const foreground = resolveCssColor("--app-fg", "#d7dae0");
  const accent = resolveCssColor("--theme-accent", "#1ab394");
  const dark = isDarkColor(background);

  const [fr, fg, fb] = parseColorToRgb(foreground) ?? [215, 218, 224];

  return {
    background,
    foreground,
    cursor: accent,
    cursorAccent: background,
    selectionBackground: `rgba(${fr}, ${fg}, ${fb}, 0.22)`,
    ...(dark ? DARK_ANSI : LIGHT_ANSI)
  };
}

/** xterm-theme 具名主题，用于显式指定 terminal_theme_name 的场景（独立 /koko/connect 路由） */
export const terminalTheme = (themeName: string) => {
  if (!(xtermTheme as Record<string, typeof defaultTheme>)[themeName]) {
    return defaultTheme;
  }
  return (xtermTheme as Record<string, typeof defaultTheme>)[themeName];
};
