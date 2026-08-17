import type { DriveStep } from "driver.js";

export const SFTP_TOUR_STORAGE_KEY = "koko:sftp-tour:v1";

export function buildSftpTourSteps(t: (key: string) => string): DriveStep[] {
  return [
    {
      element: '[data-sftp-tour="workspace"]',
      popover: {
        title: t("koko.sftpTour.workspaceTitle"),
        description: t("koko.sftpTour.workspaceDescription"),
        side: "bottom",
        align: "end"
      }
    },
    {
      element: '[data-sftp-tour="navigation"]',
      popover: {
        title: t("koko.sftpTour.navigationTitle"),
        description: t("koko.sftpTour.navigationDescription"),
        side: "bottom",
        align: "start"
      }
    },
    {
      element: '[data-sftp-tour="file-actions"]',
      popover: {
        title: t("koko.sftpTour.fileActionsTitle"),
        description: t("koko.sftpTour.fileActionsDescription"),
        side: "bottom",
        align: "start"
      }
    },
    {
      element: '[data-sftp-tour="file-table"]',
      popover: {
        title: t("koko.sftpTour.fileTableTitle"),
        description: t("koko.sftpTour.fileTableDescription"),
        side: "top",
        align: "center"
      }
    },
    {
      element: '[data-sftp-tour="remote-connect"]',
      popover: {
        title: t("koko.sftpTour.remoteConnectTitle"),
        description: t("koko.sftpTour.remoteConnectDescription"),
        side: "bottom",
        align: "end"
      }
    },
    {
      element: '[data-sftp-tour="transfer-center"]',
      popover: {
        title: t("koko.sftpTour.transferCenterTitle"),
        description: t("koko.sftpTour.transferCenterDescription"),
        // Floating FAB sits bottom-right; open the coachmark above it.
        side: "top",
        align: "end"
      }
    }
  ];
}
