import type { WebContents } from "electron";

/** Observe native input without trusting page-generated DOM events. */
export function observeClientActivity(
  contents: WebContents,
  report: () => Promise<unknown>,
  enabled: () => boolean = () => true
) {
  let nextReportAt = 0;
  const onInput = (_event: unknown, input: { type: string }) => {
    if (!["keyDown", "rawKeyDown", "mouseDown", "mouseMove", "mouseWheel"].includes(input.type) || !enabled()) return;
    const now = performance.now();
    if (now < nextReportAt) return;
    // Coalesce native input locally; the auth service owns the shared network limit.
    nextReportAt = now + 1_000;
    void report().catch(() => {
      // Authentication failures use the existing expiry flow; network failures wait for new input.
    });
  };
  contents.on("before-input-event", onInput);
  contents.on("before-mouse-event", onInput);
  // Wheel events are delivered here on Electron 44, rather than before-mouse-event.
  // ponytail: out-of-process iframe input is only partially exposed by Electron;
  // complete coverage would need a separately secured frame activity channel.
  contents.on("input-event", onInput);
  contents.once("destroyed", () => {
    contents.removeListener("before-input-event", onInput);
    contents.removeListener("before-mouse-event", onInput);
    contents.removeListener("input-event", onInput);
  });
}
