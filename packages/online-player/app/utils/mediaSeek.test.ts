import { describe, expect, it } from "vitest";
import { isMediaTimeSeekable } from "#online-player/utils/mediaSeek";

function ranges(entries: Array<[number, number]>): TimeRanges {
  return {
    length: entries.length,
    start(index: number) {
      return entries[index]![0];
    },
    end(index: number) {
      return entries[index]![1];
    }
  };
}

describe("isMediaTimeSeekable", () => {
  it("does not treat a zero-length seekable interval as ready", () => {
    expect(isMediaTimeSeekable(ranges([[0, 0]]), 52.845)).toBe(false);
    expect(isMediaTimeSeekable(ranges([]), 52.845)).toBe(false);
    expect(isMediaTimeSeekable(ranges([[0, 59.938]]), 52.845)).toBe(true);
  });

  it("checks every range and rejects an unavailable target", () => {
    expect(
      isMediaTimeSeekable(
        ranges([
          [0, 10],
          [20, 30]
        ]),
        25
      )
    ).toBe(true);
    expect(
      isMediaTimeSeekable(
        ranges([
          [0, 10],
          [20, 30]
        ]),
        15
      )
    ).toBe(false);
    expect(isMediaTimeSeekable(ranges([[0, 59.938]]), 80)).toBe(false);
    expect(isMediaTimeSeekable(ranges([]), 0)).toBe(true);
  });
});
