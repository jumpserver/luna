import { describe, expect, it } from "vitest";
import { accumulateVisibleBounds, fitDisplayScale, visibleBoundsFromAlpha } from "#online-player/utils/guacamoleBounds";

function alphaCanvas(width: number, height: number, rect?: { x: number; y: number; w: number; h: number }) {
  const image = new Uint8ClampedArray(width * height * 4);
  if (!rect) return image;
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      image[(y * width + x) * 4 + 3] = 255;
    }
  }
  return image;
}

describe("fitDisplayScale", () => {
  it("contains the complete display without changing its aspect ratio", () => {
    expect(fitDisplayScale(1920, 1000, 1920, 1080)).toBeCloseTo(1000 / 1080);
    expect(fitDisplayScale(1000, 1080, 1920, 1080)).toBeCloseTo(1000 / 1920);
    expect(fitDisplayScale(1920, 1080, 1920, 1080)).toBe(1);
  });
});

describe("visibleBoundsFromAlpha", () => {
  it("returns null when nothing is drawn", () => {
    expect(visibleBoundsFromAlpha(alphaCanvas(80, 60), 80, 60)).toBeNull();
  });

  it("crops to opaque content so the visible desktop can fill the stage", () => {
    const bounds = visibleBoundsFromAlpha(alphaCanvas(200, 100, { x: 40, y: 20, w: 80, h: 40 }), 200, 100);
    expect(bounds).not.toBeNull();
    expect(bounds!.left).toBeLessThanOrEqual(40);
    expect(bounds!.top).toBeLessThanOrEqual(20);
    expect(bounds!.left + bounds!.width).toBeGreaterThanOrEqual(120);
    expect(bounds!.top + bounds!.height).toBeGreaterThanOrEqual(60);
    expect(bounds!.width).toBeLessThan(200);
    expect(bounds!.height).toBeLessThan(100);
  });
});

describe("accumulateVisibleBounds", () => {
  it("uses the full canvas when sampled content already fills it", () => {
    expect(accumulateVisibleBounds(null, { left: 1, top: 1, width: 1910, height: 1070 }, 1920, 1080)).toEqual({
      left: 0,
      top: 0,
      width: 1920,
      height: 1080
    });
  });

  it("expands to include later frames", () => {
    const first = accumulateVisibleBounds(null, { left: 40, top: 20, width: 80, height: 40 }, 200, 100);
    const next = accumulateVisibleBounds(first, { left: 100, top: 30, width: 50, height: 50 }, 200, 100);
    expect(next?.left).toBe(40);
    expect(next?.top).toBe(20);
    expect((next?.left ?? 0) + (next?.width ?? 0)).toBe(150);
    expect((next?.top ?? 0) + (next?.height ?? 0)).toBe(80);
  });

  it("keeps a later inset crop after an empty sample instead of locking the full layer", () => {
    const empty = accumulateVisibleBounds(null, visibleBoundsFromAlpha(alphaCanvas(200, 100), 200, 100), 200, 100);
    expect(empty).toBeNull();
    const crop = visibleBoundsFromAlpha(alphaCanvas(200, 100, { x: 40, y: 20, w: 80, h: 40 }), 200, 100);
    const next = accumulateVisibleBounds(empty, crop, 200, 100);
    expect(next).not.toBeNull();
    expect(next!.width).toBeLessThan(200);
    expect(next!.height).toBeLessThan(100);
    expect(next!.left).toBeGreaterThan(0);
    expect(next!.top).toBeGreaterThan(0);
  });
});
