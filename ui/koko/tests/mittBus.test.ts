import { afterEach, describe, expect, it } from "vitest";
import mittBus, { KokoMittEvent } from "#koko/utils/mittBus";

describe("koko mittBus events", () => {
  afterEach(() => {
    mittBus.all.clear();
  });

  it("delivers write-command payloads through KokoMittEvent", () => {
    const received: Array<{ type: string }> = [];
    mittBus.on(KokoMittEvent.WriteCommand, (payload) => {
      received.push(payload);
    });

    mittBus.emit(KokoMittEvent.WriteCommand, { type: "\x03" });

    expect(received).toEqual([{ type: "\x03" }]);
  });

  it("stops delivering after off()", () => {
    const received: Array<{ type: string }> = [];
    const listener = (payload: { type: string }) => {
      received.push(payload);
    };

    mittBus.on(KokoMittEvent.WriteCommand, listener);
    mittBus.emit(KokoMittEvent.WriteCommand, { type: "a" });
    mittBus.off(KokoMittEvent.WriteCommand, listener);
    mittBus.emit(KokoMittEvent.WriteCommand, { type: "b" });

    expect(received).toEqual([{ type: "a" }]);
  });

  it("forwards remove-share-user metadata to session listeners", () => {
    const received: unknown[] = [];
    mittBus.on(KokoMittEvent.RemoveShareUser, (payload) => {
      received.push(payload);
    });

    const payload = {
      sessionId: "session-1",
      userMeta: {
        user_id: "u1",
        user: "alice",
        created: "now",
        remote_addr: "10.0.0.1",
        terminal_id: "t1",
        primary: false,
        writable: true
      },
      type: "remove"
    };

    mittBus.emit(KokoMittEvent.RemoveShareUser, payload);

    expect(received).toEqual([payload]);
  });

  it("keeps open-setting and close-drawer as distinct events", () => {
    const events: string[] = [];
    mittBus.on(KokoMittEvent.OpenSetting, () => events.push("open"));
    mittBus.on(KokoMittEvent.CloseDrawer, () => events.push("close"));

    mittBus.emit(KokoMittEvent.OpenSetting);
    mittBus.emit(KokoMittEvent.CloseDrawer);

    expect(events).toEqual(["open", "close"]);
  });
});
