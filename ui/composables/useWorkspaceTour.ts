import type { Driver } from "driver.js";
import { buildWorkspaceTourSteps, WORKSPACE_TOUR_STORAGE_KEY } from "~/utils/workspaceTour";

let activeTour: Driver | null = null;
let autoStartPending = false;

export function useWorkspaceTour() {
  const { t } = useI18n();

  async function start() {
    activeTour?.destroy();

    const { driver } = await import("driver.js");
    const tour = driver({
      steps: buildWorkspaceTourSteps((key) => t(key)),
      animate: true,
      duration: 260,
      overlayColor: "#05070b",
      overlayOpacity: 0.68,
      smoothScroll: true,
      allowClose: true,
      allowScroll: true,
      skipMissingElement: true,
      waitForElement: 1800,
      stagePadding: 6,
      stageRadius: 7,
      popoverClass: "sftp-driver-popover workspace-driver-popover",
      popoverOffset: 10,
      showProgress: true,
      progressText: t("WorkspaceTour.progress", { current: "{{current}}", total: "{{total}}" }),
      nextBtnText: t("WorkspaceTour.next"),
      prevBtnText: t("WorkspaceTour.previous"),
      doneBtnText: t("WorkspaceTour.done"),
      onDestroyed: () => {
        if (activeTour === tour) activeTour = null;
      }
    });

    activeTour = tour;
    tour.drive();
  }

  async function startOnce() {
    if (autoStartPending || globalThis.localStorage?.getItem(WORKSPACE_TOUR_STORAGE_KEY)) return;
    autoStartPending = true;
    try {
      await start();
      globalThis.localStorage?.setItem(WORKSPACE_TOUR_STORAGE_KEY, "completed");
    } finally {
      autoStartPending = false;
    }
  }

  function destroy() {
    activeTour?.destroy();
  }

  return { destroy, start, startOnce };
}
