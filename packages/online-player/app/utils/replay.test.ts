import { describe, expect, it } from "vitest";
import {
  commandSeekLeadMs,
  decideReplayPoll,
  initialRailTab,
  isReplayApiPath,
  mapReplayCommands,
  nextReplayPollDelay,
  resolveReplayOverlay,
  resolveReplayPartPayload,
  shouldShowReplayRail
} from "#online-player/utils/replay";

describe("commandSeekLeadMs", () => {
  it("uses 10s for guacamole and 5s otherwise", () => {
    expect(commandSeekLeadMs("guacamole")).toBe(10_000);
    expect(commandSeekLeadMs("asciicast")).toBe(5000);
    expect(commandSeekLeadMs("mp4")).toBe(5000);
    expect(commandSeekLeadMs()).toBe(5000);
  });
});

describe("decideReplayPoll", () => {
  it("returns not-found for explicit errors or timeout", () => {
    expect(decideReplayPoll({ error: "missing" }, 0)).toBe("not-found");
    expect(decideReplayPoll({}, 120_000)).toBe("not-found");
  });

  it("returns ready when a replay type exists", () => {
    expect(decideReplayPoll({ type: "guacamole" }, 0)).toBe("ready");
  });

  it("keeps polling as converting before timeout", () => {
    expect(decideReplayPoll({}, 2_000)).toBe("converting");
    expect(nextReplayPollDelay(2000)).toBe(4000);
    expect(nextReplayPollDelay(8000)).toBe(8000);
  });
});

describe("isReplayApiPath", () => {
  it("detects API paths and ignores media or OSS urls", () => {
    expect(isReplayApiPath("/api/v1/terminal/sessions/1/replay/")).toBe(true);
    expect(isReplayApiPath("https://jms.example/api/v1/terminal/sessions/1/replay/")).toBe(true);
    expect(isReplayApiPath("/media/2026-08-20/session.replay.json")).toBe(false);
    expect(isReplayApiPath("https://oss.example/bucket/session.replay.json")).toBe(false);
  });
});

describe("resolveReplayPartPayload", () => {
  it("unwraps nested resp.data used by converting parts", () => {
    expect(
      resolveReplayPartPayload({
        id: "sid",
        resp: { data: { id: "sid", src: "/part.mp4", type: "mp4" } }
      })
    ).toMatchObject({ src: "/part.mp4", type: "mp4" });
  });

  it("returns the payload when type or src is already present", () => {
    expect(resolveReplayPartPayload({ id: "sid", type: "guacamole", src: "/a.guac" })).toMatchObject({
      type: "guacamole"
    });
    expect(resolveReplayPartPayload({ id: "sid", src: "/a.mp4" })).toMatchObject({ src: "/a.mp4" });
    expect(resolveReplayPartPayload(null)).toBeNull();
  });
});

describe("resolveReplayOverlay", () => {
  it("covers blocked, converting, missing, and parts failure states", () => {
    expect(resolveReplayOverlay({ blocked: true, status: "ready" })).toBe("blocked");
    expect(resolveReplayOverlay({ status: "converting" })).toBe("converting");
    expect(resolveReplayOverlay({ status: "ready", partsLoading: true })).toBe("converting");
    expect(resolveReplayOverlay({ status: "not-found" })).toBe("not-found");
    expect(resolveReplayOverlay({ status: "error" })).toBe("error");
    expect(resolveReplayOverlay({ status: "ready", unsupported: true })).toBe("error");
    expect(resolveReplayOverlay({ status: "ready", isParts: true, partsEmpty: true, partsLoading: false })).toBe(
      "error"
    );
    expect(resolveReplayOverlay({ status: "ready" })).toBeNull();
  });
});

describe("shouldShowReplayRail", () => {
  it("keeps the rail open when command loading fails", () => {
    expect(shouldShowReplayRail({ overlay: true })).toBe(false);
    expect(shouldShowReplayRail({ isParts: true })).toBe(true);
    expect(shouldShowReplayRail({ commandCount: 0, commandsLoading: false })).toBe(false);
    expect(shouldShowReplayRail({ commandCount: 0, commandsError: true })).toBe(true);
  });
});

describe("initialRailTab", () => {
  it("opens playlist first for parts sessions", () => {
    expect(initialRailTab(true)).toBe("parts");
    expect(initialRailTab(false)).toBe("commands");
  });
});

describe("mapReplayCommands", () => {
  it("offsets commands from the session start time", () => {
    const start = "2026-08-20T14:32:00.000Z";
    const startMs = Date.parse(start);
    const mapped = mapReplayCommands([{ input: "ls", timestamp: Math.floor(startMs / 1000) + 12 }], start);

    expect(mapped[0]?.offsetMs).toBe(12_000);
    expect(mapped[0]?.atime).toBe("00:12");
  });
});
