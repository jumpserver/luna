import type { Terminal } from "@xterm/xterm";
import { MESSAGE_TYPE } from "@jumpserver/connectors-core";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref, shallowRef } from "vue";
import { createKokoTerminalMessageHandlers } from "#koko/composables/terminal/useTerminalMessageHandler";
import { parseEnvelope, parseJSONPayload } from "#koko/composables/terminal/envelope";
import { useKokoConnectionStore } from "#koko/stores/connection";
import {
  clearWorkspaceSessionDetails,
  setWorkspaceSessionDetails,
  useWorkspaceSessionDetails
} from "~/composables/useWorkspaceSessionDetails";

// Two SSH terminals open at the same time. Everything the right panel shows must
// stay attached to the pane that produced it, whichever connected last.
const PANE_A = "pane-a";
const PANE_B = "pane-b";

const { getSessionDetails } = useWorkspaceSessionDetails();

function createPaneHandlers(paneId: string) {
  const onServerClose = vi.fn();
  const socket = { send: vi.fn(), close: vi.fn(), readyState: WebSocket.OPEN } as unknown as WebSocket;
  const terminal = { cols: 80, rows: 24, write: vi.fn(), focus: vi.fn() } as unknown as Terminal;
  const handlers = createKokoTerminalMessageHandlers({
    socketRef: ref(socket),
    terminalRef: shallowRef(terminal),
    featureSetting: ref({ SECURITY_SESSION_SHARE: true }),
    onlineUsers: ref([]),
    userOptions: ref([]),
    shareId: ref(""),
    shareCode: ref(""),
    sessionId: ref(""),
    terminalId: ref(""),
    warningInterval: ref(null),
    queryTerminalThemeName: computed(() => ""),
    followAppTheme: computed(() => true),
    sessionCtxRef: computed(() => ({ tabId: paneId })),
    t: ((key: string) => key) as never,
    toast: { add: vi.fn() } as never,
    connectionStore: useKokoConnectionStore(),
    terminalSettingsStore: { setDefaultTerminalConfig: vi.fn() } as never,
    hostAdapter: {
      setSessionDetails: setWorkspaceSessionDetails,
      clearSessionDetails: clearWorkspaceSessionDetails
    } as never,
    hostBridge: { once: vi.fn(), sendHost: vi.fn() } as never,
    sendHostEvent: vi.fn(),
    emitTerminalConnect: vi.fn(),
    emitTerminalSession: vi.fn(),
    setClipboardAccess: vi.fn(),
    showInfoOnce: vi.fn(),
    onConnected: vi.fn(),
    onZmodemEnd: vi.fn(),
    onZmodemAbort: vi.fn(),
    onServerClose
  });

  return {
    handlers,
    onServerClose,
    socket,
    terminal,
    created: (terminalId: number) => {
      handlers.created({ id: "", type: "created", terminalId });
    },
    session: (session: Record<string, unknown>) => {
      handlers[MESSAGE_TYPE.TERMINAL_SESSION]!({
        id: "",
        type: MESSAGE_TYPE.TERMINAL_SESSION,
        data: JSON.stringify({ session, permission: { actions: ["share"] } })
      });
    },
    share: (shareId: string, code: string) => {
      handlers[MESSAGE_TYPE.TERMINAL_SHARE]!({
        id: "",
        type: MESSAGE_TYPE.TERMINAL_SHARE,
        data: JSON.stringify({ share_id: shareId, code })
      });
    }
  };
}

describe("koko pane connection isolation", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    clearWorkspaceSessionDetails(PANE_A);
    clearWorkspaceSessionDetails(PANE_B);
  });

  it("replies to Koko heartbeats and records its close reason before acknowledging close", () => {
    const pane = createPaneHandlers(PANE_A);
    pane.created(7);
    pane.handlers[MESSAGE_TYPE.PING]();
    const sent = vi.mocked(pane.socket.send).mock.calls.at(-1)![0] as ArrayBuffer;
    expect(parseJSONPayload<{ command: string }>(parseEnvelope(sent).payload).command).toBe("PONG");
    pane.handlers[MESSAGE_TYPE.CLOSE]({ id: "", type: MESSAGE_TYPE.CLOSE, terminalId: 8 });
    expect(pane.socket.close).not.toHaveBeenCalled();
    pane.handlers[MESSAGE_TYPE.CLOSE]({ id: "", type: MESSAGE_TYPE.CLOSE, terminalId: 7, data: "idle_disconnect" });
    expect(pane.onServerClose).toHaveBeenCalledWith("idle_disconnect");
    expect(pane.socket.close).toHaveBeenCalledWith(1000, "luna:koko_close");
    expect(pane.onServerClose.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(pane.socket.close).mock.invocationCallOrder[0]!
    );
  });

  it("keeps each terminal's session, asset and share state on its own pane", () => {
    const store = useKokoConnectionStore();
    const paneA = createPaneHandlers(PANE_A);
    const paneB = createPaneHandlers(PANE_B);

    paneA.created(1);
    paneA.session({
      id: "session-a",
      asset: "Asset A(10.0.0.1)",
      user: "Administrator(admin)",
      account: "root(root)"
    });
    paneA.share("share-a", "1234");

    // The second connection finishes later; it must not overwrite the first one.
    paneB.created(2);
    paneB.session({
      id: "session-b",
      asset: "Asset B(10.0.0.2)",
      user: "Administrator(admin)",
      account: "Administrator(administrator)"
    });

    expect(getSessionDetails(PANE_A)).toMatchObject({
      sessionId: "session-a",
      account: "root(root)"
    });
    expect(getSessionDetails(PANE_B)).toMatchObject({
      sessionId: "session-b",
      account: "Administrator(administrator)"
    });

    expect(store.pane(PANE_A)).toMatchObject({
      sessionId: "session-a",
      terminalId: "1",
      shareId: "share-a",
      shareCode: "1234",
      enableShare: true,
      socket: paneA.socket
    });
    expect(store.pane(PANE_B)).toMatchObject({
      sessionId: "session-b",
      terminalId: "2",
      shareId: "",
      shareCode: "",
      socket: paneB.socket
    });
  });

  it("reports the asset account, not the JumpServer login user", () => {
    const pane = createPaneHandlers(PANE_A);

    // koko's model.Session carries both: `user` is the login user and must never
    // reach the account row of the session panel.
    pane.session({ id: "session-a", user: "Administrator(admin)", account: "root(root)" });

    expect(getSessionDetails(PANE_A)?.account).toBe("root(root)");

    // Older payloads without an account leave the field empty so the panel keeps
    // the account picked in the connect form.
    clearWorkspaceSessionDetails(PANE_A);
    pane.session({ id: "session-a", user: "Administrator(admin)" });

    expect(getSessionDetails(PANE_A)?.account).toBeUndefined();
  });

  it("leaves other panes untouched when one terminal is closed", () => {
    const store = useKokoConnectionStore();
    const paneA = createPaneHandlers(PANE_A);
    const paneB = createPaneHandlers(PANE_B);

    paneA.created(1);
    paneA.session({ id: "session-a", account: "root(root)" });
    paneB.created(2);
    paneB.session({ id: "session-b", account: "Administrator(administrator)" });

    store.resetPane(PANE_A);
    clearWorkspaceSessionDetails(PANE_A);

    expect(store.pane(PANE_A).sessionId).toBe("");
    expect(getSessionDetails(PANE_A)).toBeUndefined();
    expect(store.pane(PANE_B).sessionId).toBe("session-b");
    expect(getSessionDetails(PANE_B)?.account).toBe("Administrator(administrator)");
  });
});
