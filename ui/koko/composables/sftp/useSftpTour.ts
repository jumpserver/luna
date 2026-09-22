import type { Driver } from "driver.js";
import type { SftpTourMode } from "#koko/utils/sftpTour";
import {
  buildSftpTourSteps,
  hasVisibleSftpTourTargets,
  SFTP_TOUR_STORAGE_KEY,
  visibleSftpTourTargets
} from "#koko/utils/sftpTour";
import { useDeferredTourStart } from "~/composables/useDeferredTourStart";
import { isWorkspaceTourActive } from "~/composables/useWorkspaceTour";

const TARGET_WAIT_MS = 5000;
const TARGET_POLL_MS = 100;

let activeTour: Driver | null = null;
let autoStartPending = false;
let startGeneration = 0;

function waitForTargets(mode: SftpTourMode, generation: number) {
  return new Promise<boolean>((resolve) => {
    const deadline = Date.now() + TARGET_WAIT_MS;
    let timer: ReturnType<typeof setInterval>;
    const check = () => {
      if (generation !== startGeneration) {
        clearInterval(timer);
        resolve(false);
      } else if (hasVisibleSftpTourTargets(mode)) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() >= deadline) {
        clearInterval(timer);
        resolve(false);
      }
    };
    timer = setInterval(check, TARGET_POLL_MS);
    check();
  });
}

export function useSftpTour(options: { mode: () => SftpTourMode; root: () => Element | null }) {
  const { t } = useI18n();
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const deferred = useDeferredTourStart({ root: options.root, start: startOnce });

  function clearRetryTimer() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = undefined;
  }

  function scheduleRetry() {
    clearRetryTimer();
    retryTimer = setTimeout(() => deferred.schedule(), 600);
  }

  async function run() {
    const generation = ++startGeneration;
    activeTour?.destroy();
    const mode = options.mode();
    if (!(await waitForTargets(mode, generation)) || generation !== startGeneration) return false;

    const { driver } = await import("driver.js");
    if (generation !== startGeneration || !hasVisibleSftpTourTargets(mode)) return false;

    const acknowledge = () => {
      globalThis.localStorage?.setItem(SFTP_TOUR_STORAGE_KEY, "completed");
      activeTour?.destroy();
    };
    const tour = driver({
      steps: buildSftpTourSteps((key) => t(key), visibleSftpTourTargets(mode)),
      animate: true,
      duration: 260,
      overlayColor: "#05070b",
      overlayOpacity: 0.68,
      smoothScroll: true,
      allowClose: true,
      allowScroll: true,
      skipMissingElement: false,
      stagePadding: 6,
      stageRadius: 7,
      popoverClass: "sftp-driver-popover",
      popoverOffset: 10,
      showProgress: true,
      progressText: t("koko.sftpTour.progress", { current: "{{current}}", total: "{{total}}" }),
      nextBtnText: t("koko.sftpTour.next"),
      prevBtnText: t("koko.sftpTour.previous"),
      doneBtnText: t("koko.sftpTour.done"),
      onDoneClick: acknowledge,
      onCloseClick: acknowledge,
      onDestroyed: () => {
        if (activeTour === tour) activeTour = null;
      }
    });

    activeTour = tour;
    tour.drive();
    return true;
  }

  function start() {
    deferred.suppress();
    clearRetryTimer();
    return run();
  }

  async function startOnce() {
    if (autoStartPending || activeTour || globalThis.localStorage?.getItem(SFTP_TOUR_STORAGE_KEY)) return;
    if (isWorkspaceTourActive()) {
      scheduleRetry();
      return;
    }
    autoStartPending = true;
    try {
      await run();
    } finally {
      autoStartPending = false;
    }
  }

  function scheduleOnce() {
    if (autoStartPending || activeTour || globalThis.localStorage?.getItem(SFTP_TOUR_STORAGE_KEY)) return;
    deferred.schedule();
  }

  function cancelScheduled() {
    clearRetryTimer();
    deferred.cancel();
  }

  function destroy() {
    startGeneration += 1;
    clearRetryTimer();
    deferred.destroy();
    activeTour?.destroy();
  }

  return { cancelScheduled, destroy, scheduleOnce, start };
}
