import { describe, expect, it } from "vitest";
import { formatClock, formatDurationLabel, toStartMs } from "#online-player/utils/time";

describe("formatClock", () => {
  it("formats milliseconds as mm:ss or hh:mm:ss", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(12_000)).toBe("00:12");
    expect(formatClock(3_662_000)).toBe("01:01:02");
    expect(formatClock(Number.NaN)).toBe("00:00");
  });
});

describe("formatDurationLabel", () => {
  it("renders localized duration parts", () => {
    expect(formatDurationLabel(0, true)).toBe("0 秒");
    expect(formatDurationLabel(90_000, true)).toBe("1 分 30 秒");
    expect(formatDurationLabel(90_000, false)).toBe("1 min 30 s");
  });
});

describe("toStartMs", () => {
  it("parses a date or returns 0", () => {
    expect(toStartMs("2026-08-20T14:32:00.000Z")).toBe(Date.parse("2026-08-20T14:32:00.000Z"));
    expect(toStartMs("not-a-date")).toBe(0);
    expect(toStartMs()).toBe(0);
  });
});
