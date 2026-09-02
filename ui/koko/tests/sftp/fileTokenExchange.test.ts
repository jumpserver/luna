import { MESSAGE_TYPE } from "@jumpserver/connectors-core";
import { describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";

import { createKokoTerminalMessageHandlers } from "#koko/composables/terminal/useTerminalMessageHandler";

function createHandlers(overrides: {
  tokenId?: string;
  exchangeConnectToken?: ReturnType<typeof vi.fn>;
  hostBridge?: {
    once: ReturnType<typeof vi.fn>;
    sendHost: ReturnType<typeof vi.fn>;
  };
}) {
  const setSessionDetails = vi.fn();
  const exchangeConnectToken =
    overrides.exchangeConnectToken ?? vi.fn().mockResolvedValue({ id: "sftp-token-from-exchange" });
  const hostBridge = overrides.hostBridge ?? {
    once: vi.fn(),
    sendHost: vi.fn()
  };

  const handlers = createKokoTerminalMessageHandlers({
    socketRef: ref(null),
    terminalRef: ref(null),
    featureSetting: ref({}),
    onlineUsers: ref([]),
    userOptions: ref([]),
    shareId: ref(""),
    shareCode: ref(""),
    sessionId: ref(""),
    terminalId: ref(""),
    warningInterval: ref(null),
    queryTerminalThemeName: computed(() => ""),
    followAppTheme: computed(() => true),
    sessionCtxRef: computed(() => ({
      tabId: "ssh-tab-1",
      tokenId: overrides.tokenId
    })),
    t: ((key: string) => key) as never,
    toast: { add: vi.fn() } as never,
    connectionStore: {
      updateConnectionState: vi.fn(),
      setConnectionState: vi.fn()
    } as never,
    terminalSettingsStore: {
      setDefaultTerminalConfig: vi.fn()
    } as never,
    hostAdapter: {
      setSessionDetails,
      sftp: { exchangeConnectToken }
    } as never,
    hostBridge: hostBridge as never,
    sendHostEvent: vi.fn(),
    emitTerminalConnect: vi.fn(),
    emitTerminalSession: vi.fn(),
    setClipboardAccess: vi.fn(),
    showInfoOnce: vi.fn(),
    onConnected: vi.fn(),
    onZmodemEnd: vi.fn(),
    onZmodemAbort: vi.fn()
  });

  return { handlers, setSessionDetails, exchangeConnectToken, hostBridge };
}

describe("sSH session file-token exchange for right-panel SFTP", () => {
  it("exchanges the active SSH connection token when the host adapter supports it", async () => {
    const { handlers, setSessionDetails, exchangeConnectToken, hostBridge } = createHandlers({
      tokenId: "ssh-token-1"
    });

    handlers[MESSAGE_TYPE.TERMINAL_SESSION]!({
      id: "1",
      type: MESSAGE_TYPE.TERMINAL_SESSION,
      data: JSON.stringify({
        session: { id: "session-1", asset: "Asset A", ip: "10.0.0.1", user: "root" },
        permission: { actions: ["upload", "download"] }
      })
    });

    expect(setSessionDetails).toHaveBeenCalledOnce();
    const details = setSessionDetails.mock.calls[0]?.[1] as {
      requestFileToken?: () => Promise<string>;
    };
    await expect(details.requestFileToken?.()).resolves.toBe("sftp-token-from-exchange");
    expect(exchangeConnectToken).toHaveBeenCalledWith("ssh-token-1");
    expect(hostBridge.sendHost).not.toHaveBeenCalled();
  });

  it("falls back to the host-bridge token path when no session token is available", async () => {
    const once = vi.fn((event: string, handler: (message: { token?: string }) => void) => {
      if (event === "GET_FILE_CONNECT_TOKEN") handler({ token: "bridge-token" });
    });
    const sendHost = vi.fn();
    const { handlers, setSessionDetails } = createHandlers({
      tokenId: "",
      hostBridge: { once, sendHost }
    });

    handlers[MESSAGE_TYPE.TERMINAL_SESSION]!({
      id: "1",
      type: MESSAGE_TYPE.TERMINAL_SESSION,
      data: JSON.stringify({
        session: { id: "session-2", asset: "Asset B", ip: "10.0.0.2", user: "admin" },
        permission: { actions: [] }
      })
    });

    const details = setSessionDetails.mock.calls[0]?.[1] as {
      requestFileToken?: () => Promise<string>;
    };
    await expect(details.requestFileToken?.()).resolves.toBe("bridge-token");
    expect(sendHost).toHaveBeenCalled();
  });
});
