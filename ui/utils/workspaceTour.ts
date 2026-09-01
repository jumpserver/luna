import type { DriveStep } from "driver.js";
import type { AssetTreeNode } from "~/types";

/** Persisted after a user completes the first-run workspace guide. */
export const WORKSPACE_TOUR_STORAGE_KEY = "luna:workspace-tour:v3";
export const WORKSPACE_TOUR_INITIAL_NEXT_DELAY_MS = 1000;
export const WORKSPACE_TOUR_TARGETS = ["organization", "asset", "node", "favorites", "add-session"] as const;
export const WORKSPACE_TOUR_DEMO_NODE_ID = "luna-workspace-tour-demo-node";
export const WORKSPACE_TOUR_DEMO_ASSET_ID = "luna-workspace-tour-demo-asset";

type WorkspaceTourTarget = (typeof WORKSPACE_TOUR_TARGETS)[number];

function isVisible(element: Element) {
  const htmlElement = element as HTMLElement;
  const style = globalThis.getComputedStyle?.(htmlElement);
  const rect = htmlElement.getBoundingClientRect();
  return style?.display !== "none" && style?.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
}

export function getVisibleWorkspaceTourTarget(target: WorkspaceTourTarget) {
  if (typeof document === "undefined") return undefined;
  return [...document.querySelectorAll(`[data-workspace-tour="${target}"]`)].find(isVisible);
}

export function hasVisibleWorkspaceTourTargets() {
  return WORKSPACE_TOUR_TARGETS.every((target) => getVisibleWorkspaceTourTarget(target));
}

export function suppressWorkspaceShortcut(event: KeyboardEvent, tourActive: boolean) {
  if (!tourActive) return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  return true;
}

export function isWorkspaceTourDemoNode(id: string) {
  return id === WORKSPACE_TOUR_DEMO_NODE_ID || id === WORKSPACE_TOUR_DEMO_ASSET_ID;
}

function isIgnoredAuthorizationTourNode(node: AssetTreeNode) {
  return node.meta?.type === "recent-connections" || isWorkspaceTourDemoNode(node.id);
}

export function authorizationTreeHasLoadedNodes(nodes: AssetTreeNode[]): boolean {
  return nodes.some((node) => !isIgnoredAuthorizationTourNode(node));
}

export function shouldShowWorkspaceTourDemoTree(options: {
  authorizationLoaded: boolean;
  hasLoadedNodes: boolean;
  tourCompleted: boolean;
  tourArmed: boolean;
}) {
  return options.authorizationLoaded && !options.hasLoadedNodes && !options.tourCompleted && options.tourArmed;
}

export function buildWorkspaceTourDemoTree(t: (key: string) => string): AssetTreeNode[] {
  return [
    {
      id: WORKSPACE_TOUR_DEMO_NODE_ID,
      key: WORKSPACE_TOUR_DEMO_NODE_ID,
      name: t("WorkspaceTour.DemoNode"),
      isParent: true,
      open: true,
      loaded: true,
      level: 0,
      children: [
        {
          id: WORKSPACE_TOUR_DEMO_ASSET_ID,
          key: WORKSPACE_TOUR_DEMO_ASSET_ID,
          name: t("WorkspaceTour.DemoAsset"),
          level: 1,
          meta: {
            type: "tour-demo",
            data: {
              name: t("WorkspaceTour.DemoAsset"),
              platform: { name: "Linux" }
            }
          }
        }
      ]
    }
  ];
}

function emphasizeTourCopy(text: string) {
  return `<span class="workspace-tour-emphasis">${text}</span>`;
}

export function buildWorkspaceTourSteps(t: (key: string) => string): DriveStep[] {
  return [
    {
      element: () => getVisibleWorkspaceTourTarget("organization")!,
      popover: {
        title: t("WorkspaceTour.SwitchOrganizationTitle"),
        description: t("WorkspaceTour.SwitchOrganizationDescription"),
        side: "right",
        align: "start"
      }
    },
    {
      element: () => getVisibleWorkspaceTourTarget("asset")!,
      popover: {
        title: t("WorkspaceTour.ConnectAssetTitle"),
        description: emphasizeTourCopy(t("WorkspaceTour.ConnectAssetDescription")),
        side: "right",
        align: "start"
      }
    },
    {
      element: () => getVisibleWorkspaceTourTarget("node")!,
      popover: {
        title: t("WorkspaceTour.ExpandNodeTitle"),
        description: t("WorkspaceTour.ExpandNodeDescription"),
        side: "right",
        align: "start"
      }
    },
    {
      element: () => getVisibleWorkspaceTourTarget("favorites")!,
      popover: {
        title: t("WorkspaceTour.FavoriteTitle"),
        description: `${t("WorkspaceTour.FavoriteDescription")} ${emphasizeTourCopy(t("WorkspaceTour.FavoriteGroupHint"))}`,
        side: "right",
        align: "start"
      }
    },
    {
      element: () => getVisibleWorkspaceTourTarget("add-session")!,
      popover: {
        title: t("WorkspaceTour.AddSessionTitle"),
        description: t("WorkspaceTour.AddSessionDescription"),
        side: "bottom",
        align: "start"
      }
    }
  ];
}
