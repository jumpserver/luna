import { describe, expect, it } from "vitest";
import { interpretTouchGesture } from "#online-player/utils/touchSeek";

describe("interpretTouchGesture", () => {
  it("treats a short stationary press as a tap", () => {
    expect(interpretTouchGesture({ x: 10, y: 10, t: 0 }, { x: 12, y: 11, t: 120 })).toEqual({ kind: "tap" });
  });

  it("seeks forward and backward on horizontal swipes", () => {
    expect(interpretTouchGesture({ x: 10, y: 10, t: 0 }, { x: 80, y: 18, t: 180 })).toEqual({
      kind: "seek",
      deltaMs: 5000
    });
    expect(interpretTouchGesture({ x: 80, y: 10, t: 0 }, { x: 10, y: 12, t: 180 })).toEqual({
      kind: "seek",
      deltaMs: -5000
    });
  });

  it("ignores mostly vertical movement", () => {
    expect(interpretTouchGesture({ x: 10, y: 10, t: 0 }, { x: 20, y: 90, t: 180 })).toEqual({ kind: "ignore" });
  });
});
