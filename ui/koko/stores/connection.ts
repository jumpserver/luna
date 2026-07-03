import type { ConnectionState } from "~/koko/types";

import { defineStore } from "pinia";

export const useKokoConnectionStore = defineStore("koko-connection", {
  state: (): Partial<ConnectionState> => ({
    origin: "",
    lunaId: "",
    shareId: "",
    shareCode: "",
    sessionId: "",
    assetName: "",
    terminalId: "",
    enableShare: false,
    terminal: undefined,
    socket: null,
    userOptions: [],
    onlineUsers: [],
    drawerOpenState: false,
    drawerTabIndex: 0
  }),
  getters: {
    isConnected: (state) => !!state.socket && state.socket.readyState === WebSocket.OPEN,
    hasShare: (state) => !!state.shareId && !!state.shareCode
  },
  actions: {
    setConnectionState(connectionState: Partial<ConnectionState>) {
      Object.assign(this, connectionState);
    },
    updateConnectionState(connectionState: Partial<ConnectionState>) {
      Object.assign(this, connectionState);
    },
    resetConnectionState() {
      this.$reset();
    }
  }
});
