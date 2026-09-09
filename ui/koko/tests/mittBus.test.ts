import { afterEach, describe, expect, it } from "vitest";
import mittBus, { KokoMittEvent } from "#koko/utils/mittBus";

describe("koko mittBus events", () => {
  afterEach(() => {
    mittBus.all.clear();
  });

  it("delivers write-command payloads through KokoMittEvent", () => {
    const received: Array<{ paneId: string; type: string }> = [];
    mittBus.on(KokoMittEvent.WriteCommand, (payload) => {
      received.push(payload);
    });

    mittBus.emit(KokoMittEvent.WriteCommand, { paneId: "pane-a", type: "\x03" });

    expect(received).toEqual([{ paneId: "pane-a", type: "\x03" }]);
  });

  it("stops delivering after off()", () => {
    const received: Array<{ paneId: string; type: string }> = [];
    const listener = (payload: { paneId: string; type: string }) => {
      received.push(payload);
    };

    mittBus.on(KokoMittEvent.WriteCommand, listener);
    mittBus.emit(KokoMittEvent.WriteCommand, { paneId: "pane-a", type: "a" });
    mittBus.off(KokoMittEvent.WriteCommand, listener);
    mittBus.emit(KokoMittEvent.WriteCommand, { paneId: "pane-a", type: "b" });

    expect(received).toEqual([{ paneId: "pane-a", type: "a" }]);
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
