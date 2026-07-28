import type { ITerminalSettings, ObjToKeyValArray } from "#koko/types";

import { defineStore } from "pinia";

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
    setDefaultTerminalConfig(...args: ObjToKeyValArray<ITerminalSettings>) {
      this.$patch({ [args[0]]: args[1] });
    }
  }
});
