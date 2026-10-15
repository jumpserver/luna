import { afterEach, describe, expect, it, vi } from "vitest";
import { TOUR_IDLE_DELAY_MS, useDeferredTourStart } from "./useDeferredTourStart";

describe("useDeferredTourStart", () => {
  afterEach(() => vi.useRealTimers());

  it("starts after an uninterrupted idle period", () => {
    vi.useFakeTimers();
    const root = new EventTarget() as unknown as Element;
    const start = vi.fn();
    const deferred = useDeferredTourStart({ root: () => root, start });

    deferred.schedule();
    vi.advanceTimersByTime(TOUR_IDLE_DELAY_MS - 1);
    expect(start).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(start).toHaveBeenCalledOnce();
  });

  it.each(["pointerdown", "keydown", "wheel"])("suppresses auto-start after %s interaction", (type) => {
    vi.useFakeTimers();
    const root = new EventTarget() as unknown as Element;
    const start = vi.fn();
    const deferred = useDeferredTourStart({ root: () => root, start });

    deferred.schedule();
    root.dispatchEvent(new Event(type, { bubbles: true }));
    vi.advanceTimersByTime(TOUR_IDLE_DELAY_MS);
    deferred.schedule();
    vi.advanceTimersByTime(TOUR_IDLE_DELAY_MS);

    expect(start).not.toHaveBeenCalled();
  });

  it("cancels without suppressing a later readiness attempt", () => {
    vi.useFakeTimers();
    const root = new EventTarget() as unknown as Element;
    const start = vi.fn();
    const deferred = useDeferredTourStart({ root: () => root, start });

    deferred.schedule();
    deferred.cancel();
    deferred.schedule();
    vi.advanceTimersByTime(TOUR_IDLE_DELAY_MS);

    expect(start).toHaveBeenCalledOnce();
  });
});
