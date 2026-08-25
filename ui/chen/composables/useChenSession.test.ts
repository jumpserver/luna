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
});
