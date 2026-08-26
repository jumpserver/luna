import type { Terminal } from "@xterm/xterm";
import type { OnlineUser, ShareUserOptions } from "#koko/types/session";

import { defineStore } from "pinia";

export interface ConnectionState {
  origin: string;
  lunaId: string;
  shareId: string;
  shareCode: string;
  assetName: string;
  sessionId: string;
  terminalId: string;
  enableShare: boolean;
  terminal: Terminal;
  socket: WebSocket | null;
  userOptions: ShareUserOptions[];
  onlineUsers: OnlineUser[];
  drawerOpenState: boolean;
  drawerTabIndex: number;
}

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
