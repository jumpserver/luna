import type { Driver } from "driver.js";
import { getKokoTerminalElement } from "#koko";
import { useDeferredTourStart } from "~/composables/useDeferredTourStart";
import { isWorkspaceTourActive } from "~/composables/useWorkspaceTour";
import { buildTerminalAiTourSteps, TERMINAL_AI_TOUR_STORAGE_KEY } from "~/utils/terminalAiTour";

export function useTerminalAiTour(options: {
  paneId: () => string;
  protocol: () => string;
  available: () => boolean;
  sessionInfoReady: () => boolean;
  shortcut: () => string;
  isOpen: () => boolean;
  panelEl: () => HTMLElement | null;
  openHud: (xterm: HTMLElement) => Promise<void>;
  connectionBusy: () => boolean;
  root: () => Element | null;
}) {
  const { t } = useI18n();
  const tourActive = ref(false);
  let activeTour: Driver | null = null;
  let retryTimer = 0;

  const deferred = useDeferredTourStart({
    root: options.root,
    start: startOnce
  });

  function clearRetry() {
    if (retryTimer) window.clearTimeout(retryTimer);
    retryTimer = 0;
  }

  function scheduleRetry() {
    clearRetry();
    retryTimer = window.setTimeout(() => deferred.schedule(), 600);
  }

  function stop() {
    activeTour?.destroy();
    activeTour = null;
    tourActive.value = false;
  }

  async function run(force = false) {
    if (options.protocol() !== "ssh") return;
    if (!options.available() || !options.sessionInfoReady() || options.connectionBusy()) return;
    if (!force && globalThis.localStorage?.getItem(TERMINAL_AI_TOUR_STORAGE_KEY)) return;
    if (isWorkspaceTourActive()) {
      scheduleRetry();
      return;
    }
    const xterm = getKokoTerminalElement(options.paneId());
    if (!xterm) return;
    await options.openHud(xterm);
    await nextTick();
    if (!options.isOpen() || !options.panelEl()) return;
    const { driver } = await import("driver.js");
    const acknowledge = () => {
      globalThis.localStorage?.setItem(TERMINAL_AI_TOUR_STORAGE_KEY, "completed");
      stop();
    };
    const tour = driver({
      steps: buildTerminalAiTourSteps((key) => t(key, { shortcut: options.shortcut() })),
      animate: true,
      duration: 260,
      overlayColor: "#05070b",
      overlayOpacity: 0.68,
      allowClose: true,
      allowScroll: true,
      skipMissingElement: true,
      waitForElement: 1800,
      stagePadding: 6,
      stageRadius: 7,
      popoverClass: "workspace-driver-popover",
      popoverOffset: 10,
      showProgress: true,
      progressText: t("WorkspaceTour.progress", { current: "{{current}}", total: "{{total}}" }),
      nextBtnText: t("WorkspaceTour.next"),
      prevBtnText: t("WorkspaceTour.previous"),
      doneBtnText: t("WorkspaceTour.done"),
      onDoneClick: acknowledge,
      onCloseClick: acknowledge,
      onDestroyed: () => {
        tourActive.value = false;
        if (activeTour === tour) activeTour = null;
      }
    });
    activeTour = tour;
    tourActive.value = true;
    tour.drive();
  }

  async function startOnce() {
    await run(false);
  }

  async function start() {
    deferred.suppress();
    await run(true);
  }

  function scheduleOnce() {
    if (options.protocol() !== "ssh") return;
    if (!options.available() || !options.sessionInfoReady() || options.connectionBusy()) return;
    if (globalThis.localStorage?.getItem(TERMINAL_AI_TOUR_STORAGE_KEY)) return;
    deferred.schedule();
  }

  function cancelScheduled() {
    clearRetry();
    deferred.cancel();
  }

  function destroy() {
    clearRetry();
    deferred.destroy();
    stop();
  }

  return { cancelScheduled, destroy, scheduleOnce, start, startOnce, stop, tourActive };
}
