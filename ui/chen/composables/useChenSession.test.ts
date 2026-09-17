import { describe, expect, it, vi } from "vitest";
import { useChenSession } from "~/chen/composables/useChenSession";

function createSession() {
  return useChenSession({
    authenticate: async () => "token",
    markConnected: vi.fn(),
    markDisconnected: vi.fn(),
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

  it("closes the previous socket before reauthenticating", async () => {
    const socket = {
      readyState: 0,
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      send: vi.fn(),
      close: vi.fn()
    };
    const session = useChenSession({
      authenticate: async () => "token",
      markConnected: vi.fn(),
      markDisconnected: vi.fn(),
      markFailed: vi.fn(),
      onBeforeReady: async () => {},
      onAfterReady: async () => {},
      onDisconnected: vi.fn(),
      showMessage: vi.fn(),
      resolveUrl: () => "ws://chen.test/ws/session",
      createSocket: () => socket as unknown as WebSocket
    });

    await session.bootstrapSession();
    await session.bootstrapSession();

    expect(socket.close).toHaveBeenCalled();
  });

  it("marks a ready session as disconnected when its socket closes", async () => {
    const markDisconnected = vi.fn();
    const markFailed = vi.fn();
    const socket = {
      readyState: 0,
      onopen: null as ((event: Event) => void) | null,
      onmessage: null as ((event: MessageEvent) => void) | null,
      onerror: null,
      onclose: null as ((event: CloseEvent) => void) | null,
      send: vi.fn(),
      close: vi.fn()
    };
    const session = useChenSession({
      authenticate: async () => "token",
      markConnected: vi.fn(),
      markDisconnected,
      markFailed,
      onBeforeReady: async () => {},
      onAfterReady: async () => {},
      onDisconnected: vi.fn(),
      showMessage: vi.fn(),
      resolveUrl: () => "ws://chen.test/ws/session",
      createSocket: () => socket as unknown as WebSocket
    });

    await session.bootstrapSession();
    socket.readyState = 1;
    socket.onopen?.({} as Event);
    socket.onmessage?.({ data: JSON.stringify({ type: "set_ready" }) } as MessageEvent);
    await Promise.resolve();
    socket.onclose?.({ code: 1006, reason: "" } as CloseEvent);

    expect(markDisconnected).toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
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
      markDisconnected: vi.fn(),
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
