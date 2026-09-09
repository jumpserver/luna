import type { Terminal } from "@xterm/xterm";
import type { OnlineUser, ShareUserOptions } from "#koko/types/session";
import type { Raw } from "vue";

import { defineStore } from "pinia";

/**
 * Runtime state of one Koko terminal pane, i.e. one SSH connection.
 * Every field here belongs to a single socket, so it must never be stored
 * globally: several panes are connected at the same time and the last one to
 * finish its handshake would otherwise overwrite the others.
 */
export interface KokoPaneConnectionState {
  shareId: string;
  shareCode: string;
  assetName: string;
  sessionId: string;
  terminalId: string;
  enableShare: boolean;
  terminal: Raw<Terminal> | null;
  socket: WebSocket | null;
  userOptions: ShareUserOptions[];
  onlineUsers: OnlineUser[];
}

const createPaneState = (): KokoPaneConnectionState => ({
  shareId: "",
  shareCode: "",
  assetName: "",
  sessionId: "",
  terminalId: "",
  enableShare: false,
  terminal: null,
  socket: null,
  userOptions: [],
  onlineUsers: []
});

// Read-only stand-in so callers can read a pane that never connected (or was
// already torn down) without null checks.
const EMPTY_PANE_STATE = Object.freeze(createPaneState());

export const useKokoConnectionStore = defineStore("koko-connection", {
  state: () => ({
    panes: {} as Record<string, KokoPaneConnectionState>
  }),
  getters: {
    pane: (state) => {
      return (paneId: string): KokoPaneConnectionState => (paneId && state.panes[paneId]) || EMPTY_PANE_STATE;
    }
  },
  actions: {
    updatePane(paneId: string, patch: Partial<KokoPaneConnectionState>) {
      if (!paneId) return;
      this.panes[paneId] = { ...(this.panes[paneId] || createPaneState()), ...patch };
    },
    resetPane(paneId: string) {
      if (!paneId) return;
      delete this.panes[paneId];
    }
  }
});
