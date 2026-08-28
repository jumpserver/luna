import type { DriveStep } from "driver.js";

/** Bump when tour steps/copy change so users see the updated guide once. */
export const WORKSPACE_TOUR_STORAGE_KEY = "luna:workspace-tour:v1";

export function buildWorkspaceTourSteps(t: (key: string) => string): DriveStep[] {
  return [
    {
      element: '[data-workspace-tour="assets"]',
      popover: {
        title: t("WorkspaceTour.ConnectAssetTitle"),
        description: t("WorkspaceTour.ConnectAssetDescription"),
        side: "right",
        align: "start"
      }
    },
    {
      element: '[data-workspace-tour="node"]',
      popover: {
        title: t("WorkspaceTour.ExpandNodeTitle"),
        description: t("WorkspaceTour.ExpandNodeDescription"),
        side: "right",
        align: "start"
      }
    },
    {
      element: '[data-workspace-tour="add-session"]',
      popover: {
        title: t("WorkspaceTour.AddSessionTitle"),
        description: t("WorkspaceTour.AddSessionDescription"),
        side: "bottom",
        align: "start"
      }
    }
  ];
}
