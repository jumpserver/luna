import { describe, expect, it } from "vitest";
import {
  bytesPerSecond,
  formatBytesPerSecond,
  formatRemaining,
  pushTransferRateSample,
  remainingSeconds
} from "#koko/utils/file-transfer/rate";

describe("file transfer rate helper", () => {
  it("needs two samples before reporting a rate", () => {
    expect(bytesPerSecond([])).toBeNull();
    expect(bytesPerSecond([{ t: 1000, bytes: 0 }])).toBeNull();
  });

  it("computes bytes per second and remaining time from a window", () => {
    const samples = [
      { t: 1_000, bytes: 0 },
      { t: 2_000, bytes: 2_048 }
    ];
    expect(bytesPerSecond(samples)).toBe(2048);
    expect(remainingSeconds(10_240, 2_048, 2048)).toBe(4);
  });

  it("drops stale samples and ignores zero-size remaining", () => {
    const samples = pushTransferRateSample(
      [
        { t: 1_000, bytes: 0 },
        { t: 2_000, bytes: 100 }
      ],
      200,
      7_000
    );
    expect(samples).toEqual([{ t: 7_000, bytes: 200 }]);
    expect(remainingSeconds(0, 0, 100)).toBeNull();
    expect(remainingSeconds(100, 100, 50)).toBe(0);
  });

  it("formats speed and remaining clocks", () => {
    expect(formatBytesPerSecond(512)).toBe("512 B/s");
    expect(formatBytesPerSecond(12_288)).toBe("12 KB/s");
    expect(formatRemaining(26)).toBe("00:26");
    expect(formatRemaining(3723)).toBe("1:02:03");
  });
});
