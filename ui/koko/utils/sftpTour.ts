import type { DriveStep } from "driver.js";

/** Bump when tour steps/copy change so users see the updated guide once. */
export const SFTP_TOUR_STORAGE_KEY = "koko:sftp-tour:v3";
export const SFTP_TOUR_TARGETS = [
  "workspace",
  "navigation",
  "file-actions",
  "file-table",
  "remote-connect",
  "transfer-center"
] as const;

export type SftpTourMode = "global" | "session";
export type SftpTourTarget = (typeof SFTP_TOUR_TARGETS)[number];

const globalRequiredTargets: SftpTourTarget[] = ["workspace", "remote-connect", "transfer-center"];

function isVisible(element: Element) {
  const htmlElement = element as HTMLElement;
  const style = globalThis.getComputedStyle?.(htmlElement);
  const rect = htmlElement.getBoundingClientRect();
  return style?.display !== "none" && style?.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
}

export function getVisibleSftpTourTarget(target: SftpTourTarget) {
  if (typeof document === "undefined") return undefined;
  return [...document.querySelectorAll(`[data-sftp-tour="${target}"]`)].find(isVisible);
}

export function hasVisibleSftpTourTargets(mode: SftpTourMode) {
  const required = mode === "session" ? SFTP_TOUR_TARGETS : globalRequiredTargets;
  return required.every((target) => getVisibleSftpTourTarget(target));
}

export function visibleSftpTourTargets(mode: SftpTourMode): SftpTourTarget[] {
  if (mode === "session") return [...SFTP_TOUR_TARGETS];
  return SFTP_TOUR_TARGETS.filter(
    (target) => globalRequiredTargets.includes(target) || Boolean(getVisibleSftpTourTarget(target))
  );
}

export function buildSftpTourSteps(
  t: (key: string) => string,
  targets: readonly SftpTourTarget[] = SFTP_TOUR_TARGETS
): DriveStep[] {
  const available = new Set(targets);
  const step = (target: SftpTourTarget, popover: DriveStep["popover"]): DriveStep | null =>
    available.has(target) ? { element: () => getVisibleSftpTourTarget(target)!, popover } : null;

  return [
    step("workspace", {
      title: t("koko.sftpTour.workspaceTitle"),
      description: t("koko.sftpTour.workspaceDescription"),
      side: "bottom",
      align: "start"
    }),
    step("navigation", {
      title: t("koko.sftpTour.navigationTitle"),
      description: t("koko.sftpTour.navigationDescription"),
      side: "bottom",
      align: "start"
    }),
    step("file-actions", {
      title: t("koko.sftpTour.fileActionsTitle"),
      description: t("koko.sftpTour.fileActionsDescription"),
      side: "bottom",
      align: "end"
    }),
    step("file-table", {
      title: t("koko.sftpTour.fileTableTitle"),
      description: t("koko.sftpTour.fileTableDescription"),
      side: "top",
      align: "center"
    }),
    step("remote-connect", {
      title: t("koko.sftpTour.remoteConnectTitle"),
      description: t("koko.sftpTour.remoteConnectDescription"),
      side: "bottom",
      align: "end"
    }),
    step("transfer-center", {
      title: t("koko.sftpTour.transferCenterTitle"),
      description: t("koko.sftpTour.transferCenterDescription"),
      side: "top",
      align: "end"
    })
  ].filter((item): item is DriveStep => Boolean(item));
}
