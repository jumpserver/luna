import { FORMATTER_MESSAGE_TYPE } from "@jumpserver/connectors-core";
import { writeText } from "clipboard-polyfill";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENVELOPE_TERMINAL_COMMAND, parseEnvelope, parseJSONPayload } from "#koko/composables/terminal/envelope";
import { useKokoSessionAdapter } from "#koko/composables/useSessionAdapter";
import { useKokoConnectionStore } from "#koko/stores/connection";
import mittBus from "#koko/utils/mittBus";

const PANE_A = "pane-a";
const PANE_B = "pane-b";
const runtime = vi.hoisted(() => ({ desktop: false }));

vi.mock("clipboard-polyfill", () => ({
  writeText: vi.fn(async () => undefined)
}));
vi.mock("~/store/modules/userInfo", () => ({
  useUserInfoStore: () => ({ currentSite: "https://desktop.example" })
}));
vi.mock("~/utils/runtime", async (original) => ({
  ...(await original<typeof import("~/utils/runtime")>()),
  isDesktopRuntime: () => runtime.desktop
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
    runtime.desktop = false;
    setActivePinia(createPinia());
    toastAdd.mockReset();
    addErrorToast.mockReset();
    vi.mocked(writeText).mockReset();
    vi.mocked(writeText).mockResolvedValue(undefined);
    mittBus.all.clear();
    if (typeof window === "undefined") {
      vi.stubGlobal("window", { location: { origin: "http://luna.test", pathname: "/luna/" } });
    }
  });

  afterEach(() => {
    mittBus.all.clear();
  });

  it("builds a share URL only when a share id exists", () => {
    const store = useKokoConnectionStore();
    store.updatePane(PANE_A, {
      shareId: "share-1",
      shareCode: "code-1",
      enableShare: true
    });

    const { shareInfo } = useKokoSessionAdapter(PANE_A);

    expect(shareInfo.value.shareURL).toContain("/luna/share/share-1/?code=code-1&component=koko");
    expect(shareInfo.value.enableShare).toBe(true);
  });

  it("keeps share state of other panes out of the requested pane", () => {
    const store = useKokoConnectionStore();
    store.updatePane(PANE_A, { shareId: "share-a", shareCode: "code-a", sessionId: "session-a", enableShare: true });
    store.updatePane(PANE_B, { shareId: "share-b", shareCode: "code-b", sessionId: "session-b", enableShare: true });

    expect(useKokoSessionAdapter(PANE_A).shareInfo.value).toMatchObject({
      shareId: "share-a",
      shareCode: "code-a",
      sessionId: "session-a"
    });
    expect(useKokoSessionAdapter(PANE_B).shareInfo.value).toMatchObject({
      shareId: "share-b",
      shareCode: "code-b",
      sessionId: "session-b"
    });

    store.resetPane(PANE_A);

    expect(useKokoSessionAdapter(PANE_A).shareInfo.value.sessionId).toBe("");
    expect(useKokoSessionAdapter(PANE_B).shareInfo.value.sessionId).toBe("session-b");
  });

  it("uses the public site for desktop share links", () => {
    runtime.desktop = true;
    useKokoConnectionStore().updatePane(PANE_A, { shareId: "share-1", shareCode: "1234" });
    expect(useKokoSessionAdapter(PANE_A).shareInfo.value.shareURL).toBe(
      "https://desktop.example/luna/share/share-1/?code=1234&component=koko"
    );
  });

  it("does not copy a share URL when sharing is disabled", () => {
    const { copyShareURL } = useKokoSessionAdapter(PANE_A);

    copyShareURL();

    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies the share link and verification code", async () => {
    const store = useKokoConnectionStore();
    store.updatePane(PANE_A, {
      shareId: "share-1",
      shareCode: "code-1",
      enableShare: true
    });
    const { copyShareURL } = useKokoSessionAdapter(PANE_A);

    copyShareURL();
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });

    const copied = String(vi.mocked(writeText).mock.calls[0]?.[0]);
    expect(copied).toBe(`${window.location.origin}/luna/share/share-1/?code=code-1&component=koko`);
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: "koko.terminal.shareLinkCopied", color: "success" })
    );
  });

  it("removes a share user through the socket of its own pane", () => {
    const socketA = { send: vi.fn() };
    const socketB = { send: vi.fn() };
    const store = useKokoConnectionStore();
    store.updatePane(PANE_A, {
      socket: socketA as unknown as WebSocket,
      terminalId: "term-a",
      sessionId: "session-a"
    });
    store.updatePane(PANE_B, {
      socket: socketB as unknown as WebSocket,
      terminalId: "term-b",
      sessionId: "session-b"
    });

    useKokoSessionAdapter(PANE_A).removeShareUser(onlineUser);

    expect(socketB.send).not.toHaveBeenCalled();
    expect(socketA.send).toHaveBeenCalledTimes(1);
    const frame = parseEnvelope(socketA.send.mock.calls[0]?.[0] as Uint8Array);
    const command = parseJSONPayload<{ command?: string; params?: { data?: string } }>(frame.payload);
    expect(command.command).toBe(FORMATTER_MESSAGE_TYPE.TERMINAL_SHARE_USER_REMOVE);
    expect(JSON.parse(String(command.params?.data))).toEqual({
      session: "session-a",
      user_meta: onlineUser
    });
  });

  it("sends a share-create command when the socket is ready", () => {
    const socket = { send: vi.fn() };
    const store = useKokoConnectionStore();
    store.updatePane(PANE_A, {
      socket: socket as unknown as WebSocket,
      terminalId: "term-1",
      sessionId: "session-1"
    });

    const { createShareLink } = useKokoSessionAdapter(PANE_A);
    createShareLink({
      expiredTime: 10,
      actionPerm: "writable",
      users: [{ id: "u1", name: "Alice", username: "alice" }]
    });

    expect(socket.send).toHaveBeenCalledTimes(1);
    const frame = parseEnvelope(socket.send.mock.calls[0]?.[0] as Uint8Array);
    expect(frame.type).toBe(ENVELOPE_TERMINAL_COMMAND);
    const command = parseJSONPayload<{ command?: string; params?: { data?: string } }>(frame.payload);
    expect(command.command).toBe(FORMATTER_MESSAGE_TYPE.TERMINAL_SHARE);
    expect(JSON.parse(String(command.params?.data))).toMatchObject({ users: ["u1"], origin: window.location.origin });
  });

  it("toasts when creating a share link without a live socket", () => {
    const { createShareLink } = useKokoSessionAdapter(PANE_A);

    createShareLink({ expiredTime: 10, actionPerm: "writable", users: [] });

    expect(addErrorToast).toHaveBeenCalledWith({ title: "koko.terminal.failedCreateConnection" });
  });
});
