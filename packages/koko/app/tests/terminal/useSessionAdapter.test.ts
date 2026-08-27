import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeText } from "clipboard-polyfill";
import { FORMATTER_MESSAGE_TYPE } from "@jumpserver/connectors-core";
import { ENVELOPE_TERMINAL_COMMAND, parseEnvelope, parseJSONPayload } from "#koko/composables/terminal/envelope";
import { useKokoSessionAdapter } from "#koko/composables/useSessionAdapter";
import { useKokoConnectionStore } from "#koko/stores/connection";
import mittBus, { KokoMittEvent } from "#koko/utils/mittBus";

vi.mock("clipboard-polyfill", () => ({
  writeText: vi.fn(async () => undefined)
}));

const toastAdd = vi.fn();
const addErrorToast = vi.fn();

vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
vi.stubGlobal("useToast", () => ({ add: toastAdd }));
vi.stubGlobal("useErrorToast", () => ({ addErrorToast }));

const onlineUser = {
  user_id: "u1",
  user: "alice",
  created: "now",
  remote_addr: "10.0.0.1",
  terminal_id: "t1",
  primary: true,
  writable: true
};

describe("useKokoSessionAdapter", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    toastAdd.mockReset();
    addErrorToast.mockReset();
    vi.mocked(writeText).mockReset();
    vi.mocked(writeText).mockResolvedValue(undefined);
    mittBus.all.clear();
    vi.stubGlobal("window", { location: { origin: "http://luna.test" } });
  });

  afterEach(() => {
    mittBus.all.clear();
  });

  it("builds a share URL only when a share id exists", () => {
    const store = useKokoConnectionStore();
    store.updateConnectionState({
      shareId: "share-1",
      shareCode: "code-1",
      enableShare: true
    });

    const { shareInfo } = useKokoSessionAdapter();

    expect(shareInfo.value.shareURL).toContain("/luna/share/share-1/?code=code-1");
    expect(shareInfo.value.enableShare).toBe(true);
  });

  it("does not copy a share URL when sharing is disabled", () => {
    const { copyShareURL } = useKokoSessionAdapter();

    copyShareURL();

    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies the share link and verification code", async () => {
    const store = useKokoConnectionStore();
    store.updateConnectionState({
      shareId: "share-1",
      shareCode: "code-1",
      enableShare: true
    });
    const { copyShareURL } = useKokoSessionAdapter();

    copyShareURL();
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });

    const copied = String(vi.mocked(writeText).mock.calls[0]?.[0]);
    expect(copied).toContain("/luna/share/share-1");
    expect(copied).toContain("code-1");
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: "koko.terminal.shareLinkCopied", color: "success" })
    );
  });

  it("emits remove-share-user through KokoMittEvent", () => {
    const store = useKokoConnectionStore();
    store.updateConnectionState({ sessionId: "session-1" });
    const received: unknown[] = [];
    mittBus.on(KokoMittEvent.RemoveShareUser, (payload) => received.push(payload));

    const { removeShareUser } = useKokoSessionAdapter();
    removeShareUser(onlineUser);

    expect(received).toEqual([
      {
        sessionId: "session-1",
        userMeta: onlineUser,
        type: "remove"
      }
    ]);
  });

  it("sends a share-create command when the socket is ready", () => {
    const socket = { send: vi.fn() };
    const store = useKokoConnectionStore();
    store.updateConnectionState({
      socket: socket as unknown as WebSocket,
      terminalId: "term-1",
      sessionId: "session-1"
    });

    const { createShareLink } = useKokoSessionAdapter();
    createShareLink({
      expiredTime: 10,
      actionPerm: "writable",
      users: [{ id: "u1", name: "Alice", username: "alice" }]
    });

    expect(socket.send).toHaveBeenCalledTimes(1);
    const frame = parseEnvelope(socket.send.mock.calls[0]?.[0] as Uint8Array);
    expect(frame.type).toBe(ENVELOPE_TERMINAL_COMMAND);
    expect(parseJSONPayload<{ command?: string }>(frame.payload).command).toBe(FORMATTER_MESSAGE_TYPE.TERMINAL_SHARE);
  });

  it("toasts when creating a share link without a live socket", () => {
    const { createShareLink } = useKokoSessionAdapter();

    createShareLink({ expiredTime: 10, actionPerm: "writable", users: [] });

    expect(addErrorToast).toHaveBeenCalledWith({ title: "koko.terminal.failedCreateConnection" });
  });
});
