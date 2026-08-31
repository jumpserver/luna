import { describe, expect, it } from "vitest";
import { resolveReplayWallClock } from "./replayWallClock";

describe("resolveReplayWallClock", () => {
  it("does not treat guacamole file clocks as unix milliseconds", () => {
    const wall = resolveReplayWallClock("2026-08-21 02:42:40 +0000", {
      start: 1_312_864_939,
      end: 1_314_713_747,
      duration: 1_848_808
    });

    expect(wall.date_start).toBe("2026-08-21 02:42:40 +0000");
    expect(wall.date_end).toBe("2026-08-21 03:13:28 +0000");
    expect(wall.date_start).not.toContain("1970");
  });

  it("offsets later parts from the earliest guacamole clock", () => {
    const files = [
      { start: 1000, end: 61_000, duration: 60_000 },
      { start: 61_000, end: 121_000, duration: 60_000 }
    ];

    expect(resolveReplayWallClock("2026-08-21 02:42:40 +0000", files[1], files)).toEqual({
      date_start: "2026-08-21 02:43:40 +0000",
      date_end: "2026-08-21 02:44:40 +0000"
    });
  });

  it("keeps the original timezone offset", () => {
    const wall = resolveReplayWallClock("2026-08-21 10:42:40 +0800", {
      start: 100,
      end: 100,
      duration: 0
    });

    expect(wall.date_start).toBe("2026-08-21 10:42:40 +0800");
  });
});
