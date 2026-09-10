import type { Driver } from "driver.js";
import {
  buildVideoPlayerTourSteps,
  hasVisibleVideoPlayerTourTargets,
  VIDEO_PLAYER_TOUR_STORAGE_KEY
} from "~/utils/videoPlayerTour";

const TARGET_WAIT_MS = 5000;
const TARGET_POLL_MS = 100;

let activeTour: Driver | null = null;
let autoStartPending = false;
let startGeneration = 0;

export const videoPlayerTourDemo = ref(false);
export const videoPlayerTourFilled = ref(false);

function waitForTargets(generation: number) {
  return new Promise<boolean>((resolve) => {
    const deadline = Date.now() + TARGET_WAIT_MS;
    let timer: ReturnType<typeof globalThis.setInterval>;
    const check = () => {
      if (generation !== startGeneration) {
        globalThis.clearInterval(timer);
        resolve(false);
      } else if (hasVisibleVideoPlayerTourTargets()) {
        globalThis.clearInterval(timer);
        resolve(true);
      } else if (Date.now() >= deadline) {
        globalThis.clearInterval(timer);
        resolve(false);
      }
    };
    timer = globalThis.setInterval(check, TARGET_POLL_MS);
    check();
  });
}

export function useVideoPlayerTour() {
  const { t } = useI18n();

  async function start() {
    const generation = ++startGeneration;
    activeTour?.destroy();
    videoPlayerTourDemo.value = true;
    await nextTick();

    if (!(await waitForTargets(generation)) || generation !== startGeneration) {
      if (generation === startGeneration) {
        videoPlayerTourDemo.value = false;
        videoPlayerTourFilled.value = false;
      }
      autoStartPending = false;
      return false;
    }

    const { driver } = await import("driver.js");
    if (generation !== startGeneration || !hasVisibleVideoPlayerTourTargets()) {
      if (generation === startGeneration) {
        videoPlayerTourDemo.value = false;
        videoPlayerTourFilled.value = false;
      }
      autoStartPending = false;
      return false;
    }

    const complete = () => {
      globalThis.localStorage?.setItem(VIDEO_PLAYER_TOUR_STORAGE_KEY, "completed");
    };
    const tour = driver({
      steps: buildVideoPlayerTourSteps((key) => t(key)),
      animate: true,
      duration: 260,
      overlayColor: "#05070b",
      overlayOpacity: 0.68,
      smoothScroll: true,
      allowClose: true,
      allowKeyboardControl: false,
      allowScroll: true,
      overlayClickBehavior: () => {},
      disableActiveInteraction: true,
      skipMissingElement: false,
      stagePadding: 4,
      stageRadius: 6,
      popoverClass: "workspace-driver-popover",
      popoverOffset: 10,
      showButtons: ["next", "previous", "close"],
      showProgress: true,
      progressText: t("VideoPlayerTour.progress", { current: "{{current}}", total: "{{total}}" }),
      nextBtnText: t("VideoPlayerTour.next"),
      prevBtnText: t("VideoPlayerTour.previous"),
      doneBtnText: t("VideoPlayerTour.done"),
      onNextClick: async () => {
        if ((tour.getActiveIndex() ?? 0) === 0) {
          videoPlayerTourFilled.value = true;
          await nextTick();
        }
        tour.moveNext();
      },
      onPrevClick: async () => {
        if ((tour.getActiveIndex() ?? 0) === 1) {
          videoPlayerTourFilled.value = false;
          await nextTick();
        }
        tour.movePrevious();
      },
      onDoneClick: () => {
        complete();
        tour.destroy();
      },
      onCloseClick: () => {
        complete();
        tour.destroy();
      },
      onDestroyed: () => {
        videoPlayerTourDemo.value = false;
        videoPlayerTourFilled.value = false;
        if (activeTour === tour) activeTour = null;
        autoStartPending = false;
      }
    });

    if (generation !== startGeneration) return false;
    activeTour = tour;
    tour.drive();
    return true;
  }

  async function startOnce() {
    if (autoStartPending || activeTour || globalThis.localStorage?.getItem(VIDEO_PLAYER_TOUR_STORAGE_KEY)) return;
    autoStartPending = true;
    try {
      await start();
    } catch (error) {
      autoStartPending = false;
      videoPlayerTourDemo.value = false;
      videoPlayerTourFilled.value = false;
      throw error;
    }
  }

  function destroy() {
    startGeneration += 1;
    autoStartPending = false;
    videoPlayerTourDemo.value = false;
    videoPlayerTourFilled.value = false;
    activeTour?.destroy();
  }

  return { destroy, start, startOnce };
}
