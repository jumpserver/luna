import type { Driver } from "driver.js";
import {
  buildWorkspaceTourSteps,
  hasVisibleWorkspaceTourTargets,
  suppressWorkspaceShortcut,
  WORKSPACE_TOUR_INITIAL_NEXT_DELAY_MS,
  WORKSPACE_TOUR_STORAGE_KEY
} from "~/utils/workspaceTour";

const TARGET_WAIT_MS = 5000;
const TARGET_POLL_MS = 100;

let activeTour: Driver | null = null;
let autoStartPending = false;
let startGeneration = 0;
export const workspaceTourCompleted = ref(Boolean(globalThis.localStorage?.getItem(WORKSPACE_TOUR_STORAGE_KEY)));
export const workspaceTourArmed = ref(false);
let nextButtonTimer: ReturnType<typeof globalThis.setInterval> | null = null;
let assetRevealTimer: ReturnType<typeof globalThis.setInterval> | null = null;
let retryTimer: ReturnType<typeof globalThis.setInterval> | null = null;

function clearNextButtonTimer() {
  if (!nextButtonTimer) return;
  globalThis.clearInterval(nextButtonTimer);
  nextButtonTimer = null;
}

function clearAssetRevealTimer() {
  if (!assetRevealTimer) return;
  globalThis.clearInterval(assetRevealTimer);
  assetRevealTimer = null;
}

function clearRetryTimer() {
  if (!retryTimer) return;
  globalThis.clearInterval(retryTimer);
  retryTimer = null;
}

function revealFirstAssetTarget() {
  clearAssetRevealTimer();

  const reveal = () => {
    if (document.querySelector('[data-workspace-tour="asset"]')) {
      clearAssetRevealTimer();
      return;
    }

    const collapsedNode = [...document.querySelectorAll<HTMLElement>('[data-workspace-tour="node"]')].find(
      (node) => node.closest('[role="treeitem"]')?.getAttribute("aria-expanded") === "false"
    );
    if (!collapsedNode) {
      clearAssetRevealTimer();
      return;
    }

    collapsedNode.click();
  };

  reveal();
  assetRevealTimer = globalThis.setInterval(reveal, TARGET_POLL_MS);
}

function waitForTargets(generation: number) {
  return new Promise<boolean>((resolve) => {
    const deadline = Date.now() + TARGET_WAIT_MS;
    let timer: ReturnType<typeof globalThis.setInterval>;
    const check = () => {
      if (generation !== startGeneration) {
        globalThis.clearInterval(timer);
        resolve(false);
      } else if (hasVisibleWorkspaceTourTargets()) {
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

export function isWorkspaceTourActive() {
  return activeTour !== null;
}

function preventTourKeyboard(event: KeyboardEvent) {
  suppressWorkspaceShortcut(event, true);
}

function enableKeyboardLock() {
  window.addEventListener("keydown", preventTourKeyboard, true);
}

function disableKeyboardLock() {
  window.removeEventListener("keydown", preventTourKeyboard, true);
}

export function useWorkspaceTour() {
  const { t } = useI18n();

  async function start() {
    const generation = ++startGeneration;
    activeTour?.destroy();
    revealFirstAssetTarget();

    if (!(await waitForTargets(generation)) || generation !== startGeneration) {
      clearAssetRevealTimer();
      autoStartPending = false;
      return false;
    }

    const { driver } = await import("driver.js");
    if (generation !== startGeneration || !hasVisibleWorkspaceTourTargets()) {
      autoStartPending = false;
      return false;
    }

    const steps = buildWorkspaceTourSteps((key) => t(key));
    const tour = driver({
      steps,
      animate: true,
      duration: 260,
      overlayColor: "#05070b",
      overlayOpacity: 0.68,
      smoothScroll: true,
      allowClose: false,
      allowKeyboardControl: false,
      allowScroll: true,
      overlayClickBehavior: () => {},
      disableActiveInteraction: true,
      skipMissingElement: false,
      stagePadding: 4,
      stageRadius: 6,
      popoverClass: "workspace-driver-popover",
      popoverOffset: 10,
      showButtons: ["next", "previous"],
      showProgress: true,
      progressText: t("WorkspaceTour.progress", { current: "{{current}}", total: "{{total}}" }),
      nextBtnText: t("WorkspaceTour.next"),
      prevBtnText: t("WorkspaceTour.previous"),
      doneBtnText: t("WorkspaceTour.done"),
      onPopoverRender: (popover, { index }) => {
        clearNextButtonTimer();

        const actionLabel = index === steps.length - 1 ? t("WorkspaceTour.done") : t("WorkspaceTour.next");
        const unlockAt = Date.now() + WORKSPACE_TOUR_INITIAL_NEXT_DELAY_MS;
        const updateNextButton = () => {
          const seconds = Math.max(0, Math.ceil((unlockAt - Date.now()) / 1000));
          popover.nextButton.disabled = seconds > 0;
          popover.nextButton.textContent = seconds > 0 ? `${actionLabel} (${seconds}s)` : actionLabel;
          if (seconds === 0) clearNextButtonTimer();
        };

        updateNextButton();
        nextButtonTimer = globalThis.setInterval(updateNextButton, 100);
      },
      onDoneClick: () => {
        globalThis.localStorage?.setItem(WORKSPACE_TOUR_STORAGE_KEY, "completed");
        workspaceTourCompleted.value = true;
        tour.destroy();
      },
      onDestroyed: () => {
        clearNextButtonTimer();
        clearAssetRevealTimer();
        disableKeyboardLock();
        if (activeTour === tour) activeTour = null;
        autoStartPending = false;
      }
    });

    if (generation !== startGeneration) return false;
    clearRetryTimer();
    activeTour = tour;
    enableKeyboardLock();
    tour.drive();
    return true;
  }

  function arm() {
    if (workspaceTourCompleted.value || globalThis.localStorage?.getItem(WORKSPACE_TOUR_STORAGE_KEY)) return;
    workspaceTourArmed.value = true;
  }

  function scheduleRetry() {
    clearRetryTimer();
    retryTimer = globalThis.setInterval(() => {
      if (!workspaceTourArmed.value || workspaceTourCompleted.value || activeTour) {
        clearRetryTimer();
        return;
      }
      if (!hasVisibleWorkspaceTourTargets()) return;
      clearRetryTimer();
      void startOnce();
    }, TARGET_POLL_MS);
  }

  async function startOnce() {
    if (autoStartPending || activeTour || globalThis.localStorage?.getItem(WORKSPACE_TOUR_STORAGE_KEY)) return;
    autoStartPending = true;
    workspaceTourArmed.value = true;
    try {
      const started = await start();
      if (!started && workspaceTourArmed.value && !workspaceTourCompleted.value) scheduleRetry();
    } catch (error) {
      autoStartPending = false;
      if (workspaceTourArmed.value && !workspaceTourCompleted.value) scheduleRetry();
      throw error;
    }
  }

  function destroy() {
    startGeneration += 1;
    clearNextButtonTimer();
    clearAssetRevealTimer();
    clearRetryTimer();
    disableKeyboardLock();
    autoStartPending = false;
    workspaceTourArmed.value = false;
    activeTour?.destroy();
  }

  return { arm, destroy, start, startOnce };
}
