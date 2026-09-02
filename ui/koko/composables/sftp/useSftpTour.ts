import type { Driver } from "driver.js";
import { buildSftpTourSteps, SFTP_TOUR_STORAGE_KEY } from "#koko/utils/sftpTour";

let activeTour: Driver | null = null;
let autoStartPending = false;

export function useSftpTour() {
  const { t } = useI18n();

  async function start() {
    activeTour?.destroy();

    const { driver } = await import("driver.js");
    const tour = driver({
      steps: buildSftpTourSteps((key) => t(key)),
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
      popoverClass: "sftp-driver-popover",
      popoverOffset: 10,
      showProgress: true,
      progressText: t("koko.sftpTour.progress", { current: "{{current}}", total: "{{total}}" }),
      nextBtnText: t("koko.sftpTour.next"),
      prevBtnText: t("koko.sftpTour.previous"),
      doneBtnText: t("koko.sftpTour.done"),
      onDestroyed: () => {
        if (activeTour === tour) activeTour = null;
      }
    });

    activeTour = tour;
    tour.drive();
  }

  async function startOnce() {
    if (autoStartPending || globalThis.localStorage?.getItem(SFTP_TOUR_STORAGE_KEY)) return;
    autoStartPending = true;
    try {
      await start();
      globalThis.localStorage?.setItem(SFTP_TOUR_STORAGE_KEY, "completed");
    } finally {
      autoStartPending = false;
    }
  }

  function destroy() {
    activeTour?.destroy();
  }

  return { destroy, start, startOnce };
}
