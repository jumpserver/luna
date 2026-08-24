import { describe, expect, it } from "vitest";
import { fitDisplayScale } from "#online-player/utils/guacamoleBounds";

describe("fitDisplayScale", () => {
  it("contains the complete display without changing its aspect ratio", () => {
    expect(fitDisplayScale(1920, 1000, 1920, 1080)).toBeCloseTo(1000 / 1080);
    expect(fitDisplayScale(1000, 1080, 1920, 1080)).toBeCloseTo(1000 / 1920);
    expect(fitDisplayScale(1920, 1080, 1920, 1080)).toBe(1);
  });
});
