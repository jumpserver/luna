import { expect, it, vi } from "vitest";
import { effectScope, nextTick } from "vue";
import { useMobile } from "./useMobile";

it.skipIf(typeof window === "undefined").each([false, true])(
  "shares a reactive mobile mode without mistaking desktop resizing for touch (touch: %s)",
  async (touch) => {
    const { page } = await import("vitest/browser");
    const matchMedia = window.matchMedia.bind(window);
    // Emulate the primary input device; let Chromium evaluate viewport breakpoints and emit change events.
    const spy = vi
      .spyOn(window, "matchMedia")
      .mockImplementation((query) =>
        matchMedia(
          query
            .replaceAll("(pointer: coarse)", touch ? "(min-width: 0px)" : "(max-width: 0px)")
            .replaceAll("(hover: none)", touch ? "(min-width: 0px)" : "(max-width: 0px)")
        )
      );
    const first = effectScope();
    const second = effectScope();
    try {
      const mobile = first.run(useMobile)!;
      expect(second.run(useMobile)).toBe(mobile);
      await nextTick();
      expect(spy).toHaveBeenCalledTimes(1);
      for (const [width, height, compact] of [
        [1280, 800, false],
        [767, 800, true],
        [768, 601, false],
        [768, 600, true],
        [390, 844, true],
        [844, 390, true],
        [1280, 800, false]
      ] as const) {
        await page.viewport(width, height);
        await vi.waitFor(() => expect(mobile.value).toBe(touch && compact));
      }
    } finally {
      first.stop();
      second.stop();
      spy.mockRestore();
    }
  }
);

it.skipIf(typeof window !== "undefined")("is safe without browser APIs", () => {
  const scope = effectScope();
  try {
    expect(scope.run(useMobile)!.value).toBe(false);
  } finally {
    scope.stop();
  }
});
