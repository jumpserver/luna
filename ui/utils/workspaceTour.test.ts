import { describe, expect, it, vi } from "vitest";
import {
  authorizationTreeHasLoadedNodes,
  buildWorkspaceTourDemoTree,
  buildWorkspaceTourSteps,
  isWorkspaceTourDemoNode,
  shouldShowWorkspaceTourDemoTree,
  suppressWorkspaceShortcut,
  WORKSPACE_TOUR_DEMO_ASSET_ID,
  WORKSPACE_TOUR_DEMO_NODE_ID,
  WORKSPACE_TOUR_INITIAL_NEXT_DELAY_MS,
  WORKSPACE_TOUR_STORAGE_KEY,
  WORKSPACE_TOUR_TARGETS
} from "~/utils/workspaceTour";
import enMessages from "../../i18n/locales/en.json";
import zhMessages from "../../i18n/locales/zh.json";

const translate = (messages: unknown) => (key: string) => {
  const value = key.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[segment];
  }, messages);
  if (typeof value !== "string") throw new TypeError(`Missing translation: ${key}`);
  return value;
};

describe("workspace tour", () => {
  it("covers the outer workspace chrome in both languages", () => {
    const chineseSteps = buildWorkspaceTourSteps(translate(zhMessages));
    const englishSteps = buildWorkspaceTourSteps(translate(enMessages));

    expect(WORKSPACE_TOUR_STORAGE_KEY).toBe("luna:workspace-tour:v3");
    expect(WORKSPACE_TOUR_INITIAL_NEXT_DELAY_MS).toBe(1000);
    expect(chineseSteps).toHaveLength(5);
    expect(englishSteps).toHaveLength(chineseSteps.length);
    expect(WORKSPACE_TOUR_TARGETS).toEqual(["organization", "asset", "node", "favorites", "add-session"]);
    expect(chineseSteps.map((step) => typeof step.element)).toEqual([
      "function",
      "function",
      "function",
      "function",
      "function"
    ]);
    expect(chineseSteps[0]?.popover?.title).toBe("切换组织");
    expect(englishSteps[0]?.popover?.title).toBe("Switch organization");
    expect(chineseSteps[3]?.popover?.title).toBe("我的收藏");
    expect(chineseSteps[4]?.popover?.side).toBe("bottom");
  });

  it("keeps workspace tour translation trees aligned", () => {
    const leafKeys = (value: unknown, prefix = ""): string[] => {
      if (!value || typeof value !== "object") return [prefix];
      return Object.entries(value).flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key));
    };

    expect(leafKeys(enMessages.WorkspaceTour).sort()).toEqual(leafKeys(zhMessages.WorkspaceTour).sort());
    expect(leafKeys(enMessages.WorkspaceEmpty).sort()).toEqual(leafKeys(zhMessages.WorkspaceEmpty).sort());
  });

  it("blocks workspace shortcuts only while the tour is active", () => {
    const eventState = {
      defaultPrevented: false,
      preventDefault() {
        eventState.defaultPrevented = true;
      },
      stopImmediatePropagation: vi.fn()
    };
    const event = eventState as unknown as KeyboardEvent;

    expect(suppressWorkspaceShortcut(event, false)).toBe(false);
    expect(eventState.defaultPrevented).toBe(false);
    expect(eventState.stopImmediatePropagation).not.toHaveBeenCalled();

    expect(suppressWorkspaceShortcut(event, true)).toBe(true);
    expect(eventState.defaultPrevented).toBe(true);
    expect(eventState.stopImmediatePropagation).toHaveBeenCalledTimes(1);
  });

  it("builds a disposable demo branch for an empty asset tree", () => {
    const [node] = buildWorkspaceTourDemoTree(translate(zhMessages));

    expect(node?.id).toBe(WORKSPACE_TOUR_DEMO_NODE_ID);
    expect(node?.open).toBe(true);
    expect(node?.loaded).toBe(true);
    expect(node?.children?.[0]?.id).toBe(WORKSPACE_TOUR_DEMO_ASSET_ID);
    expect(isWorkspaceTourDemoNode(WORKSPACE_TOUR_DEMO_NODE_ID)).toBe(true);
    expect(isWorkspaceTourDemoNode(WORKSPACE_TOUR_DEMO_ASSET_ID)).toBe(true);
    expect(isWorkspaceTourDemoNode("web-01")).toBe(false);
    node!.open = false;
    expect(node?.loaded).toBe(true);
  });

  it("shows the demo tree only when no authorization nodes or assets have loaded", () => {
    expect(authorizationTreeHasLoadedNodes([])).toBe(false);
    expect(
      authorizationTreeHasLoadedNodes([
        {
          id: "ROOT",
          name: "Default",
          isParent: true,
          children: [{ id: "folder", name: "linux", isParent: true, children: [] }]
        }
      ])
    ).toBe(true);
    expect(
      authorizationTreeHasLoadedNodes([
        {
          id: "__recent_connections__",
          name: "Recent",
          isParent: true,
          meta: { type: "recent-connections" },
          children: [{ id: "recent-web-01", name: "web-01" }]
        },
        ...buildWorkspaceTourDemoTree(translate(zhMessages))
      ])
    ).toBe(false);
    expect(
      authorizationTreeHasLoadedNodes([
        {
          id: "ROOT",
          name: "Default",
          isParent: true,
          children: [{ id: "web-01", name: "web-01" }]
        }
      ])
    ).toBe(true);
  });

  it("shows the demo tree only for an unfinished armed first-run after authorization load", () => {
    expect(
      shouldShowWorkspaceTourDemoTree({
        authorizationLoaded: true,
        hasLoadedNodes: false,
        tourCompleted: false,
        tourArmed: true
      })
    ).toBe(true);
    expect(
      shouldShowWorkspaceTourDemoTree({
        authorizationLoaded: false,
        hasLoadedNodes: false,
        tourCompleted: false,
        tourArmed: true
      })
    ).toBe(false);
    expect(
      shouldShowWorkspaceTourDemoTree({
        authorizationLoaded: true,
        hasLoadedNodes: true,
        tourCompleted: false,
        tourArmed: true
      })
    ).toBe(false);
    expect(
      shouldShowWorkspaceTourDemoTree({
        authorizationLoaded: true,
        hasLoadedNodes: false,
        tourCompleted: true,
        tourArmed: true
      })
    ).toBe(false);
    expect(
      shouldShowWorkspaceTourDemoTree({
        authorizationLoaded: true,
        hasLoadedNodes: false,
        tourCompleted: false,
        tourArmed: false
      })
    ).toBe(false);
  });
});
