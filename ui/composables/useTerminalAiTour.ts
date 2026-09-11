import type { Driver } from "driver.js";
import { getKokoTerminalElement } from "#koko";
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
}) {
  const { t } = useI18n();
  const tourActive = ref(false);
  let activeTour: Driver | null = null;
  let tourPending = false;
  let tourTimer = 0;

  function clearTourTimer() {
    if (!tourTimer) return;
    window.clearTimeout(tourTimer);
    tourTimer = 0;
  }

  function destroy() {
    clearTourTimer();
    tourPending = false;
    activeTour?.destroy();
    activeTour = null;
    tourActive.value = false;
  }

  async function startOnce() {
    if (options.protocol() !== "ssh") return;
    if (tourPending || tourActive.value) return;
    if (globalThis.localStorage?.getItem(TERMINAL_AI_TOUR_STORAGE_KEY)) return;
    if (!options.available() || !options.sessionInfoReady()) return;
    if (isWorkspaceTourActive()) {
      tourTimer = window.setTimeout(() => void startOnce(), 600);
      return;
    }
    tourPending = true;
    try {
      await new Promise<void>((resolve) => {
        tourTimer = window.setTimeout(resolve, 650);
      });
      tourTimer = 0;
      if (options.protocol() !== "ssh" || !options.available() || !options.sessionInfoReady()) return;
      if (globalThis.localStorage?.getItem(TERMINAL_AI_TOUR_STORAGE_KEY)) return;
      if (isWorkspaceTourActive()) {
        tourPending = false;
        tourTimer = window.setTimeout(() => void startOnce(), 600);
        return;
      }
      const xterm = getKokoTerminalElement(options.paneId());
      if (!xterm) return;
      await options.openHud(xterm);
      await nextTick();
      if (!options.isOpen() || !options.panelEl()) return;
      const { driver } = await import("driver.js");
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
        onDestroyed: () => {
          tourActive.value = false;
          if (activeTour === tour) activeTour = null;
        }
      });
      activeTour = tour;
      tourActive.value = true;
      tour.drive();
      globalThis.localStorage?.setItem(TERMINAL_AI_TOUR_STORAGE_KEY, "completed");
    } finally {
      tourPending = false;
    }
  }

  return { tourActive, destroy, startOnce };
}
