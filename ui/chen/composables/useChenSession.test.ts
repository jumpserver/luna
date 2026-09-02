import { describe, expect, it, vi } from "vitest";
import { useChenSession } from "~/chen/composables/useChenSession";

function createSession() {
  return useChenSession({
    authenticate: async () => "token",
    markConnected: vi.fn(),
    markFailed: vi.fn(),
    onBeforeReady: async () => {},
    onAfterReady: async () => {},
    onDisconnected: vi.fn(),
    showMessage: vi.fn()
  });
}

describe("chen session dialogs", () => {
  it("tracks whether a dialog was opened during startup", () => {
    const session = createSession();

    session.openDialog({ title: "Message", body: "Connecting" });
    expect(session.dialogOpenedDuringStartup.value).toBe(true);

    session.ready.value = true;
    session.openDialog({ title: "Details", body: "Ready" });
    expect(session.dialogOpenedDuringStartup.value).toBe(false);
  });

  it("clears the startup marker when a dialog is dismissed", () => {
    const session = createSession();

    session.openDialog({ title: "Message", body: "Connecting" });
    expect(session.dismissDialog()).toBe(true);
    expect(session.dialogMessage.value).toBeNull();
    expect(session.dialogOpenedDuringStartup.value).toBe(false);
  });

  it("forwards MCP frames received before the main session is ready", async () => {
    const onPacket = vi.fn();
    const socket = {
      readyState: 0,
      onopen: null as ((event: Event) => void) | null,
      onmessage: null as ((event: MessageEvent) => void) | null,
      onerror: null,
      onclose: null,
      send: vi.fn(),
      close: vi.fn()
    };
    const session = useChenSession({
      authenticate: async () => "token",
      markConnected: vi.fn(),
      markFailed: vi.fn(),
      onBeforeReady: async () => {},
      onAfterReady: async () => {},
      onDisconnected: vi.fn(),
      onPacket,
      showMessage: vi.fn(),
      resolveUrl: () => "ws://chen.test/ws/session",
      createSocket: () => socket as unknown as WebSocket
    });

    await session.bootstrapSession();
    socket.readyState = 1;
    socket.onopen?.({} as Event);
    const manifest = { type: "mcp.manifest", data: { profile: "sql" } };
    socket.onmessage?.({ data: JSON.stringify(manifest) } as MessageEvent);

    expect(onPacket).toHaveBeenCalledWith(manifest);
    session.cleanupSession();
  });
});
