import type { ITerminalSettings } from "#koko/types/settings";

import { defineStore } from "pinia";

type TerminalSettingEntry = {
  [K in keyof ITerminalSettings]-?: [K, ITerminalSettings[K]];
}[keyof ITerminalSettings];

export const useKokoTerminalSettingsStore = defineStore("koko-terminal-settings", {
  state: (): Partial<ITerminalSettings> => ({
    fontSize: 14,
    lineHeight: 1,
    fontFamily: 'monaco, Consolas, "Lucida Console", monospace',
    themeName: "",
    quickPaste: "0",
    ctrlCAsCtrlZ: "0",
    backspaceAsCtrlH: "0",
    theme: ""
  }),
  getters: {
    getConfig: (state) => state
  },
  actions: {
    setDefaultTerminalConfig(...args: TerminalSettingEntry) {
      this.$patch({ [args[0]]: args[1] });
    }
  }
});
