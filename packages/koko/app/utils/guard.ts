import type { ITerminalSettings } from "#koko/types/settings";
import { useKokoTerminalSettingsStore } from "#koko/stores/terminalSettings";

interface CommandLineConfig {
  character_terminal_font_size: number;
  is_backspace_as_ctrl_h: boolean;
  is_right_click_quickly_paste: boolean;
  terminal_theme_name: string;
}

function readLocalCommandLine(): CommandLineConfig {
  const defaults: CommandLineConfig = {
    character_terminal_font_size: 13,
    is_backspace_as_ctrl_h: false,
    is_right_click_quickly_paste: true,
    terminal_theme_name: "Default"
  };

  if (!import.meta.client) return defaults;

  const raw = localStorage.getItem("LunaSetting");
  if (!raw) return defaults;

  try {
    const parsed = JSON.parse(raw) as { command_line?: Partial<CommandLineConfig> };
    const line = parsed.command_line;
    if (!line) return defaults;

    return {
      character_terminal_font_size: line.character_terminal_font_size || 13,
      is_backspace_as_ctrl_h: !!line.is_backspace_as_ctrl_h,
      is_right_click_quickly_paste: line.is_right_click_quickly_paste !== false,
      terminal_theme_name: line.terminal_theme_name || "Default"
    };
  } catch {
    return defaults;
  }
}

export function getDefaultTerminalConfig(): ITerminalSettings {
  const commandLine = readLocalCommandLine();
  const settingsStore = useKokoTerminalSettingsStore();

  let fontSize = commandLine.character_terminal_font_size;
  if (!fontSize || fontSize < 5 || fontSize > 50) fontSize = 13;

  settingsStore.setDefaultTerminalConfig("quickPaste", commandLine.is_right_click_quickly_paste ? "1" : "0");
  settingsStore.setDefaultTerminalConfig("backspaceAsCtrlH", commandLine.is_backspace_as_ctrl_h ? "1" : "0");
  settingsStore.setDefaultTerminalConfig("fontSize", fontSize);

  const themeName = commandLine.terminal_theme_name || "Default";

  return {
    fontSize,
    lineHeight: 1.2,
    // 与 main.css --font-mono 一致（xterm 不解析 CSS 变量，写具体字体串）
    fontFamily: '"SFMono-Regular", "JetBrains Mono", "Cascadia Code", "Fira Code", "Menlo", "Consolas", monospace',
    themeName,
    quickPaste: commandLine.is_right_click_quickly_paste ? "1" : "0",
    ctrlCAsCtrlZ: "0",
    backspaceAsCtrlH: commandLine.is_backspace_as_ctrl_h ? "1" : "0",
    theme: themeName
  };
}
