export const TOUR_IDLE_DELAY_MS = 1500;

interface DeferredTourStartOptions {
  root: () => Element | null;
  start: () => unknown;
  delay?: number;
}

const interactionEvents = ["pointerdown", "keydown", "wheel"] as const;

export function useDeferredTourStart(options: DeferredTourStartOptions) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let interactionRoot: Element | null = null;
  let suppressed = false;

  function detachInteractionListeners() {
    if (!interactionRoot) return;
    for (const event of interactionEvents) interactionRoot.removeEventListener(event, suppress, true);
    interactionRoot = null;
  }

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    detachInteractionListeners();
  }

  function suppress() {
    suppressed = true;
    clearTimer();
  }

  function schedule() {
    if (suppressed || timer) return;
    const root = options.root();
    if (!root) return;
    interactionRoot = root;
    for (const event of interactionEvents) root.addEventListener(event, suppress, true);
    timer = setTimeout(() => {
      timer = undefined;
      detachInteractionListeners();
      if (!suppressed) void options.start();
    }, options.delay ?? TOUR_IDLE_DELAY_MS);
  }

  function cancel() {
    clearTimer();
  }

  function destroy() {
    suppressed = true;
    clearTimer();
  }

  return { cancel, destroy, schedule, suppress };
}
