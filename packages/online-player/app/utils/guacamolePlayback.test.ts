import { describe, expect, it, vi } from "vitest";
import { applyGuacamolePlaybackRate } from "#online-player/utils/guacamolePlayback";

describe("applyGuacamolePlaybackRate", () => {
  it("applies a valid rate to the recording", () => {
    const setPlaybackRate = vi.fn();
    expect(applyGuacamolePlaybackRate({ setPlaybackRate }, 2)).toBe(true);
    expect(setPlaybackRate).toHaveBeenCalledWith(2);
  });

  it("ignores missing recordings and invalid rates", () => {
    const setPlaybackRate = vi.fn();
    expect(applyGuacamolePlaybackRate(null, 2)).toBe(false);
    expect(applyGuacamolePlaybackRate({}, 2)).toBe(false);
    expect(applyGuacamolePlaybackRate({ setPlaybackRate }, 0)).toBe(false);
    expect(applyGuacamolePlaybackRate({ setPlaybackRate }, Number.NaN)).toBe(false);
    expect(setPlaybackRate).not.toHaveBeenCalled();
  });
});
