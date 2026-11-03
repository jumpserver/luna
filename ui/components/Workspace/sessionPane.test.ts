import type { AssetItem } from "~/types";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import * as Vue from "vue";
import { useResizeObserver } from "@vueuse/core";
import { compileScript, parse } from "vue/compiler-sfc";
import * as broadcast from "#koko/composables/terminal/useTerminalBroadcast";
import * as surfaces from "~/composables/useWorkspacePaneSurfaceRegistry";
import { useWorkspaceTabs } from "~/composables/useWorkspaceTabs";
import * as layout from "~/utils/workspaceLayout";
import paneSource from "./sessionPane.vue?raw";
import headerSource from "./tabHeader.vue?raw";
import broadcastSource from "./terminalBroadcast.vue?raw";
import surfaceSource from "./paneSurfaceHost.vue?raw";

vi.mock("~/composables/useRecentConnections", () => ({
  useRecentConnections: () => ({ recordRecentConnection: vi.fn() })
}));
vi.mock("~/composables/useAclDialog", () => ({ closeAclScope: vi.fn(), trackAclBatchConnection: vi.fn() }));
vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: () => ({ loggedIn: false }) }));
vi.mock("~/composables/useSettingManager", () => ({ useSettingManager: () => ({ collapse: { value: false } }) }));

const workspace = useWorkspaceTabs();
const cleanups: Array<() => void> = [];
afterEach(async () => {
  broadcast.stopKokoTerminalBroadcast();
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup());
  await workspace.closeAllSessions({ force: true });
});

function mountWorkspace() {
  const mounted = vi.fn();
  const unmounted = vi.fn();
  const focused = vi.fn();
  const terminal = Vue.defineComponent({
    props: ["tab"],
    setup(props, { expose }) {
      const paneId = props.tab.id;
      Vue.onMounted(() => {
        mounted(paneId);
        broadcast.registerKokoBroadcastEndpoint(paneId, { canSend: () => true, send: vi.fn() });
      });
      Vue.onUnmounted(() => {
        unmounted(paneId);
        broadcast.unregisterKokoBroadcastEndpoint(paneId);
      });
      expose({ focus: () => focused(paneId) });
      return () => Vue.h("div", "Connected SSH terminal");
    }
  });
  const globals = {
    ...Vue,
    useWorkspaceTabs: () => workspace,
    useWorkspaceMode: () => ({ activeWorkspaceMode: Vue.ref("assets") }),
    useWorkspacePaneSurfaceRegistry: surfaces.useWorkspacePaneSurfaceRegistry,
    useWorkspaceTabMenu: () => ({
      reconnectSession: vi.fn(),
      splitSession: (tab: { id: string }, direction: "horizontal" | "vertical", paneId: string) => {
        workspace.setActiveSession(tab.id);
        workspace.splitWorkspace(tab.id, direction, paneId);
      },
      connectCurrentPane: vi.fn(),
      connectOtherPane: vi.fn(),
      mergeWorkspaceTabIntoCurrent: workspace.mergeTabIntoWorkspace
    }),
    useAclDialog: () => ({ hasScopeGroup: () => false }),
    storeToRefs: () => ({ currentUser: Vue.ref(null), loggedIn: Vue.ref(true) }),
    useRuntimeConfig: () => ({ app: { baseURL: "/luna/" } }),
    usePlatform: () => ({ isMacOS: Vue.ref(false) }),
    useAppShortcuts: () => ({ kbds: () => [], sessionDigitShortcuts: Vue.ref(false), blocked: () => false }),
    useSettingsWindow: () => ({ open: Vue.ref(false) }),
    useEventListener: vi.fn(),
    isDesktopRuntime: () => false,
    useI18n: () => ({
      t: (key: string, params?: Record<string, unknown>) => (params ? `${key} ${params.count}` : key)
    }),
    useColorMode: () => Vue.ref("dark"),
    useToast: () => ({ add: vi.fn() })
  };
  const services = {
    useResizeObserver,
    sessionGroupSaveError: Vue.ref(""),
    resolveAssetIconFromFields: () => ({ src: "", fallback: "i-lucide-terminal" }),
    ...layout,
    ...broadcast,
    ...surfaces,
    isWorkspaceTourActive: () => false,
    useUserInfoStore: () => ({}),
    findDeclaredCapability: () => ({ surface: "terminal" }),
    shouldShowConnectionProgress: () => false,
    resolveSessionSurface: () => terminal
  };
  function component(source: string, id: string) {
    const script = compileScript(parse(source).descriptor, { id, inlineTemplate: true });
    const output = ts.transpileModule(script.content, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ESNext }
    }).outputText;
    return new Function("require", ...Object.keys(globals), `const exports = {}; ${output}; return exports.default;`)(
      (name: string) => (name === "vue" ? Vue : services),
      ...Object.values(globals)
    );
  }
  const Pane = component(paneSource, "split-workspace");
  const Header = component(headerSource, "tab-header");
  const Broadcast = component(broadcastSource, "broadcast-control");
  const Surface = component(surfaceSource, "terminal-surface");
  const host = document.createElement("div");
  document.body.append(host);
  const style = document.createElement("style");
  style.textContent =
    ".h-full{height:100%}.relative{position:relative}.absolute{position:absolute}.flex{display:flex}.flex-col{flex-direction:column}.flex-1{flex:1}.min-h-0{min-height:0}.min-w-0{min-width:0}.pointer-events-none{pointer-events:none}section.group{box-sizing:border-box}[draggable=true]{width:20px;height:20px;right:4px;top:4px;z-index:6}[data-pane-drop-target]{inset:0;z-index:4}";
  document.head.append(style);
  const app = Vue.createApp({
    render: () =>
      Vue.h("div", [
        Vue.h(Header),
        Vue.h("div", { style: "width:1200px;height:900px" }, [
          ...workspace.tabs.value.map((tab) =>
            Vue.h(
              "div",
              {
                key: `workspace:${tab.id}`,
                "data-workspace": tab.id,
                style: { height: "100%", display: workspace.activeTabId.value === tab.id ? "block" : "none" }
              },
              [Vue.h(Pane, { tab })]
            )
          ),
          ...workspace.tabs.value
            .flatMap((tab) => tab.panes)
            .map((pane) => Vue.h(Surface, { key: `surface:${pane.id}`, pane }))
        ])
      ])
  });
  const empty = { render: () => null };
  for (const name of [
    "UIcon",
    "UKbd",
    "WorkspaceConnectionProgressOverlay",
    "WorkspaceConnectionSetupPane",
    "WorkspaceAclPaneHost",
    "UInput",
    "SideBarAssetTree",
    "AppAssetIcon",
    "WorkspaceAddSessionPopover"
  ])
    app.component(name, empty);
  app.component("WorkspaceTerminalBroadcast", Broadcast);
  app.component("UBadge", {
    setup:
      (_props: unknown, { slots }: any) =>
      () =>
        Vue.h("span", slots.default?.())
  });
  app.component("UButton", {
    inheritAttrs: false,
    props: ["label", "disabled"],
    setup:
      (props: any, { attrs, slots }: any) =>
      () =>
        Vue.h("button", { ...attrs, disabled: props.disabled }, props.label || slots.default?.())
  });
  app.component("UTooltip", {
    inheritAttrs: false,
    setup:
      (_props: unknown, { slots }: any) =>
      () =>
        slots.default?.()
  });
  app.component("UModal", {
    props: ["open"],
    setup:
      (props: any, { slots }: any) =>
      () =>
        props.open ? Vue.h("div", [slots.body?.(), slots.footer?.()]) : null
  });
  app.component("UDropdownMenu", {
    props: ["open", "items"],
    setup: (props: any, { slots }: any) => {
      const renderItem = (item: any): any =>
        Vue.h("div", { "data-menu-label": item.label }, [
          item.onSelect
            ? Vue.h("button", { disabled: item.disabled, onClick: item.onSelect }, item.label)
            : Vue.h("span", item.label),
          item.children?.map(renderItem)
        ]);
      return () => Vue.h("div", [slots.default?.(), props.open ? props.items.map(renderItem) : null]);
    }
  });
  app.component("UCheckbox", {
    props: ["label", "modelValue"],
    emits: ["update:modelValue"],
    setup:
      (props: any, { emit }: any) =>
      () =>
        Vue.h("label", [
          Vue.h("input", {
            type: "checkbox",
            checked: props.modelValue,
            onChange: (event: Event) => emit("update:modelValue", (event.target as HTMLInputElement).checked)
          }),
          props.label
        ])
  });
  const warnings: string[] = [];
  app.config.warnHandler = (message) => warnings.push(message);
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
    style.remove();
  });
  return { host, mounted, unmounted, focused, warnings };
}

it.skipIf(typeof document === "undefined").each(["center", "bottom"] as const)(
  "moves a split pane with a real mouse drag to the %s",
  async (placement) => {
    const { userEvent } = await import("vitest/browser");
    const source = workspace.openSession({ id: "drag-source", name: "Drag source" } as AssetItem, {
      protocol: "ssh",
      account: "root",
      newTab: true,
      payload: { id: "drag-source-token" }
    });
    const main = workspace.activeTab.value!;
    const target = workspace.splitWorkspace(main.id, "vertical")[0]!;
    const { host, mounted, unmounted } = mountWorkspace();
    const container = host.querySelector<HTMLElement>("[data-workspace]")!.parentElement!;
    container.style.width = "300px";
    container.style.height = "300px";
    await Vue.nextTick();
    const before = layout.measureWorkspaceLayout(main.paneLayout!).panes;
    const grip = host.querySelector<HTMLElement>(`[data-pane-id="${source.id}"] [draggable="true"]`)!;
    const targetPane = host.querySelector<HTMLElement>(`[data-pane-id="${target.id}"]`)!;
    const rect = targetPane.getBoundingClientRect();
    await userEvent.dragAndDrop(grip, targetPane, {
      targetPosition: { x: rect.width / 2, y: rect.height * (placement === "center" ? 0.5 : 0.9) },
      timeout: 2000
    });
    await Vue.nextTick();
    const after = layout.measureWorkspaceLayout(main.paneLayout!).panes;
    if (placement === "center") {
      expect(after.get(source.id)).toEqual(before.get(target.id));
      expect(after.get(target.id)).toEqual(before.get(source.id));
    } else {
      expect(after.get(source.id)).toEqual({ left: 0, top: 50, width: 100, height: 50 });
      expect(after.get(target.id)).toEqual({ left: 0, top: 0, width: 100, height: 50 });
    }
    expect(host.querySelector("[data-pane-drop-target]")).toBeNull();
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(unmounted).not.toHaveBeenCalled();
  }
);

it.skipIf(typeof document === "undefined")(
  "merges nine broadcast targets, keeps all terminals mounted, and renders independent separators",
  async () => {
    for (let index = 0; index < 10; index++) {
      const pane = workspace.openSession({ id: `asset-${index}`, name: `Server ${index}` } as AssetItem, {
        protocol: "ssh",
        account: "root",
        newTab: true,
        payload: { id: `token-${index}` }
      });
      workspace.markSessionConnected(pane.id);
      workspace.activeTab.value!.panes[0]!.connectionProgress = undefined;
    }
    const main = workspace.tabs.value[0]!;
    const originalTabIds = workspace.tabs.value.map((tab) => tab.id);
    const originalPaneId = main.panes[0]!.id;
    workspace.setActiveSession(main.id);
    const { host, mounted, unmounted, focused, warnings } = mountWorkspace();
    await Vue.nextTick();
    await Vue.nextTick();
    expect(mounted).toHaveBeenCalledTimes(10);
    const frame = host.querySelector(`[data-workspace="${main.id}"]`)!;
    const button = (label: string) =>
      Array.from(host.querySelectorAll("button")).find((element) => element.textContent === label)!;
    const openMenu = async () => {
      host.querySelector(`[data-tab-id="${main.id}"]`)!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
      await Vue.nextTick();
    };
    expect(frame.querySelector("header")).toBeNull();
    expect(frame.querySelector('[data-slot="pane-title"]')).toBeNull();
    expect(frame.textContent).not.toContain("TerminalBroadcast.Title");
    await openMenu();
    button("TerminalBroadcast.Title").click();
    await Vue.nextTick();
    const checkboxes = host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(9);
    checkboxes.forEach((checkbox) => checkbox.click());
    await Vue.nextTick();
    button("TerminalBroadcast.Start").click();
    await Vue.nextTick();
    await Vue.nextTick();
    expect(main.panes).toHaveLength(10);
    expect(frame.querySelectorAll('[data-slot="pane-title"]')).toHaveLength(10);
    expect(frame.querySelector(`[data-pane-id="${originalPaneId}"] [data-slot="pane-title"]`)!.textContent).toContain(
      "Server 0"
    );
    expect(frame.querySelectorAll('[data-slot="pane-title"][role="status"]')).toHaveLength(10);
    expect(frame.querySelector(`[data-pane-id="${originalPaneId}"] [data-slot="pane-title"]`)!.textContent).toContain(
      "TerminalBroadcast.Active 9"
    );
    expect(frame.querySelectorAll('[data-slot="pane-title"]')[1]!.textContent).toContain("TerminalBroadcast.Receiving");
    expect(workspace.tabs.value).toHaveLength(1);
    expect(unmounted).not.toHaveBeenCalled();
    expect(broadcast.useKokoTerminalBroadcast().broadcast.value?.targetIds).toHaveLength(9);
    const sections = frame.querySelectorAll<HTMLElement>("section.group");
    expect(sections).toHaveLength(10);
    const firstId = main.panes[0]!.id;
    const secondId = main.panes[1]!.id;
    const firstBounds = layout.measureWorkspaceLayout(main.paneLayout!).panes.get(firstId);
    const secondBounds = layout.measureWorkspaceLayout(main.paneLayout!).panes.get(secondId);
    const dragToCenter = async (sourceId: string, targetId: string) => {
      const source = frame.querySelector<HTMLElement>(`[data-pane-id="${sourceId}"]`)!;
      const grip = source.querySelector<HTMLButtonElement>('[draggable="true"]')!;
      expect(source.getAttribute("draggable")).toBeNull();
      const dataTransfer = new DataTransfer();
      grip.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer }));
      await Vue.nextTick();
      const target = frame.querySelector<HTMLElement>(`[data-pane-drop-target="${targetId}"]`)!;
      const rect = target.getBoundingClientRect();
      const event = {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      };
      target.dispatchEvent(new DragEvent("dragover", event));
      await Vue.nextTick();
      expect(target.textContent).toContain("WorkspacePane.SwapPositionHint");
      target.dispatchEvent(new DragEvent("drop", event));
      grip.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer }));
      await Vue.nextTick();
      expect(broadcast.useKokoTerminalBroadcast().broadcast.value?.targetIds).toHaveLength(9);
      expect(unmounted).not.toHaveBeenCalled();
    };
    await dragToCenter(firstId, secondId);
    expect(layout.measureWorkspaceLayout(main.paneLayout!).panes.get(firstId)).toEqual(secondBounds);
    expect(layout.measureWorkspaceLayout(main.paneLayout!).panes.get(secondId)).toEqual(firstBounds);
    await dragToCenter(firstId, secondId);
    expect(layout.measureWorkspaceLayout(main.paneLayout!).panes.get(firstId)).toEqual(firstBounds);
    frame
      .querySelector<HTMLElement>(`[data-pane-id="${secondId}"] .flex-1`)!
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(workspace.activePaneId.value).toBe(secondId);
    expect(broadcast.useKokoTerminalBroadcast().broadcast.value?.sourceId).toBe(firstId);
    expect(frame.querySelectorAll('[role="separator"]')).toHaveLength(9);
    expect(sections[0]!.getBoundingClientRect().height).toBeCloseTo(900);
    expect(sections[1]!.getBoundingClientRect().height).toBeCloseTo(100);
    const separator = frame.querySelector<HTMLElement>('[role="separator"]')!;
    separator.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await Vue.nextTick();
    expect(separator.getAttribute("aria-valuenow")).toBe("52");
    const nestedSeparator = frame.querySelectorAll<HTMLElement>('[role="separator"]')[1]!;
    const previousRatio = Number(nestedSeparator.getAttribute("aria-valuenow"));
    nestedSeparator.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await Vue.nextTick();
    expect(Number(nestedSeparator.getAttribute("aria-valuenow"))).toBe(previousRatio + 2);
    expect(sections[0]!.getBoundingClientRect().height).toBeCloseTo(900);
    expect(unmounted).not.toHaveBeenCalled();
    const grip = frame.querySelector<HTMLElement>(`[data-pane-id="${firstId}"] [draggable="true"]`)!;
    grip.focus();
    expect(workspace.activePaneId.value).toBe(firstId);
    const unchanged = JSON.stringify(main.paneLayout);
    grip.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    await Vue.nextTick();
    expect(JSON.stringify(main.paneLayout)).toBe(unchanged);
    grip.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    await Vue.nextTick();
    expect(JSON.stringify(main.paneLayout)).not.toBe(unchanged);
    expect(broadcast.useKokoTerminalBroadcast().broadcast.value?.targetIds).toHaveLength(9);
    expect(unmounted).not.toHaveBeenCalled();
    workspace.setActivePane(main.panes[1]!.id);
    expect(broadcast.useKokoTerminalBroadcast().broadcast.value?.sourceId).toBe(main.panes[0]!.id);
    const previousSourceId = main.panes[0]!.id;
    const nextSourceId = main.panes[1]!.id;
    const beforeSourceChange = layout.measureWorkspaceLayout(main.paneLayout!);
    await openMenu();
    const sourceChoices = host.querySelector('[data-menu-label="TerminalBroadcast.MakeSource"]')!;
    Array.from(sourceChoices.querySelectorAll("button"))
      .find((element) => element.textContent?.startsWith("2. "))!
      .click();
    await Vue.nextTick();
    const changedGroup = broadcast.useKokoTerminalBroadcast().broadcast.value!;
    expect(changedGroup.sourceId).toBe(nextSourceId);
    expect(changedGroup.targetIds).toContain(previousSourceId);
    expect(changedGroup.targetIds).not.toContain(nextSourceId);
    expect(changedGroup.targetIds).toHaveLength(9);
    expect(main.panes[0]!.id).toBe(nextSourceId);
    expect(workspace.activePaneId.value).toBe(nextSourceId);
    const afterSourceChange = layout.measureWorkspaceLayout(main.paneLayout!);
    for (const [id, bounds] of beforeSourceChange.panes) {
      const swappedId = id === previousSourceId ? nextSourceId : id === nextSourceId ? previousSourceId : id;
      expect(afterSourceChange.panes.get(swappedId)).toEqual(bounds);
    }
    expect(unmounted).not.toHaveBeenCalled();
    expect(mounted).toHaveBeenCalledTimes(10);
    await vi.waitFor(() => expect(focused).toHaveBeenLastCalledWith(nextSourceId));
    const removedTargetId = main.panes.find((pane) => pane.assetName === "Server 2")!.id;
    const extra = workspace.openSession({ id: "extra", name: "Extra server" } as AssetItem, {
      protocol: "ssh",
      account: "root",
      newTab: true,
      payload: { id: "extra-token" }
    });
    const extraTabId = workspace.activeTabId.value;
    workspace.markSessionConnected(extra.id);
    workspace.activeTab.value!.panes[0]!.connectionProgress = undefined;
    await Vue.nextTick();
    await Vue.nextTick();
    expect(broadcast.useKokoTerminalBroadcast().broadcast.value?.targetIds).toHaveLength(9);
    expect(broadcast.useKokoTerminalBroadcast().broadcast.value?.targetIds).not.toContain(extra.id);
    expect(broadcast.dispatchKokoBroadcastInput(nextSourceId, "hidden input")).toBe("blocked");
    expect(mounted).toHaveBeenCalledTimes(11);
    await openMenu();
    button("TerminalBroadcast.EditTargets").click();
    await Vue.nextTick();
    const targetInputs = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    const extraInput = targetInputs.find((input) => input.closest("label")?.textContent === "Extra server")!;
    const removedInput = targetInputs.find((input) => input.closest("label")?.textContent === "Server 2")!;
    expect(extraInput.checked).toBe(false);
    expect(removedInput.checked).toBe(true);
    extraInput.click();
    removedInput.click();
    await Vue.nextTick();
    button("TerminalBroadcast.ApplyTargets").click();
    await Vue.nextTick();
    await Vue.nextTick();
    expect(broadcast.useKokoTerminalBroadcast().broadcast.value?.targetIds).toHaveLength(9);
    expect(broadcast.useKokoTerminalBroadcast().broadcast.value?.targetIds).toContain(extra.id);
    expect(broadcast.useKokoTerminalBroadcast().broadcast.value?.targetIds).not.toContain(removedTargetId);
    expect(
      workspace.tabs.value.some((tab) => tab.panes.some((pane) => pane.id === removedTargetId) && tab.id !== main.id)
    ).toBe(true);
    expect(unmounted).not.toHaveBeenCalled();
    workspace.setActivePane(main.panes[2]!.id);
    await openMenu();
    const broadcastItem = host.querySelector('[data-menu-label="TerminalBroadcast.EditTargets"]')!;
    const broadcastItems = Array.from(broadcastItem.parentElement!.children).map((item) =>
      item.getAttribute("data-menu-label")
    );
    const broadcastIndex = broadcastItems.indexOf("TerminalBroadcast.EditTargets");
    expect(broadcastItems.slice(broadcastIndex, broadcastIndex + 3)).toEqual([
      "TerminalBroadcast.EditTargets",
      "TerminalBroadcast.Stop",
      "TerminalBroadcast.MakeSource"
    ]);
    expect(broadcastItems[broadcastIndex - 1]).toBeNull();
    expect(broadcastItems[broadcastIndex + 3]).toBeNull();
    expect(host.querySelector('[data-menu-label="WorkspacePane.SelectPane"]')).toBeNull();
    expect(host.querySelector('[data-menu-label="WorkspacePane.MovePane"]')).toBeNull();
    expect(host.querySelector('[data-menu-label="TabMenu.SplitHorizontally"]')).toBeNull();
    expect(host.querySelector('[data-menu-label="TabMenu.SplitVertically"]')).toBeNull();
    expect(host.querySelector('[data-menu-label="WorkspacePane.ClosePane"]')).toBeNull();
    expect(workspace.splitWorkspace(main.id, "horizontal")).toEqual([]);
    expect(main.panes).toHaveLength(10);
    expect(broadcast.useKokoTerminalBroadcast().broadcast.value?.targetIds).toHaveLength(9);
    expect(unmounted).not.toHaveBeenCalled();
    await openMenu();
    button("TerminalBroadcast.Stop").click();
    await Vue.nextTick();
    await Vue.nextTick();
    expect(broadcast.useKokoTerminalBroadcast().broadcast.value).toBeNull();
    expect(workspace.tabs.value.map((tab) => tab.id)).toEqual([...originalTabIds, extraTabId]);
    expect(main.panes).toHaveLength(1);
    expect(frame.querySelector('[data-slot="pane-title"]')).toBeNull();
    expect(workspace.activePaneId.value).toBe(originalPaneId);
    await vi.waitFor(() => expect(focused).toHaveBeenLastCalledWith(originalPaneId));
    expect(unmounted).not.toHaveBeenCalled();
    expect(mounted).toHaveBeenCalledTimes(11);
    await openMenu();
    const splitItem = host.querySelector('[data-menu-label="TabMenu.SplitVertically"]')!;
    const layoutItems = Array.from(splitItem.parentElement!.children).map((item) =>
      item.getAttribute("data-menu-label")
    );
    const splitIndex = layoutItems.indexOf("TabMenu.SplitVertically");
    expect(layoutItems.slice(splitIndex, splitIndex + 3)).toEqual([
      "TabMenu.SplitVertically",
      "TabMenu.SplitHorizontally",
      "TerminalBroadcast.Title"
    ]);
    expect(layoutItems[splitIndex - 1]).toBeNull();
    expect(layoutItems[splitIndex + 3]).toBeNull();
    button("TabMenu.SplitHorizontally").click();
    await Vue.nextTick();
    expect(main.panes).toHaveLength(2);
    const paneTitles = frame.querySelectorAll('[data-slot="pane-title"]');
    expect(paneTitles).toHaveLength(2);
    expect(paneTitles[0]!.textContent?.trim()).toBe("Server 0");
    expect(paneTitles[1]!.textContent?.trim()).toBe("WorkspacePane.EmptyTitle");
    expect(frame.querySelectorAll('[data-slot="pane-title"][role="status"]')).toHaveLength(0);
    expect(frame.querySelector("header")).toBeNull();
    workspace.setActivePane(originalPaneId);
    await openMenu();
    const splitPaneItems = Array.from(
      host.querySelector('[data-menu-label="TabMenu.SplitVertically"]')!.parentElement!.children
    ).map((item) => item.getAttribute("data-menu-label"));
    const startIndex = splitPaneItems.indexOf("TabMenu.SplitVertically");
    expect(splitPaneItems.slice(startIndex, startIndex + 4)).toEqual([
      "TabMenu.SplitVertically",
      "TabMenu.SplitHorizontally",
      "WorkspacePane.ClosePane",
      "TerminalBroadcast.Title"
    ]);
    const previousLayout = JSON.stringify(main.paneLayout);
    workspace.setActivePane(originalPaneId);
    await openMenu();
    button("TerminalBroadcast.Title").click();
    await Vue.nextTick();
    host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((checkbox) => checkbox.click());
    await Vue.nextTick();
    button("TerminalBroadcast.Start").click();
    await Vue.nextTick();
    expect(broadcast.useKokoTerminalBroadcast().broadcast.value?.targetIds).toHaveLength(10);
    const closedPane = main.panes.find((pane) => pane.protocol === "ssh" && pane.id !== originalPaneId)!;
    workspace.setActivePane(closedPane.id);
    await openMenu();
    expect(host.querySelector('[data-menu-label="WorkspacePane.ClosePane"]')).toBeNull();
    await workspace.closePane(closedPane.id);
    await Vue.nextTick();
    await Vue.nextTick();
    expect(broadcast.useKokoTerminalBroadcast().broadcast.value).toBeNull();
    await Vue.nextTick();
    expect(workspace.tabs.value).toHaveLength(10);
    expect(JSON.stringify(main.paneLayout)).toBe(previousLayout);
    expect(workspace.tabs.value.flatMap((tab) => tab.panes).some((pane) => pane.id === closedPane.id)).toBe(false);
    expect(unmounted).toHaveBeenCalledExactlyOnceWith(closedPane.id);
    expect(mounted).toHaveBeenCalledTimes(11);
    workspace.setActivePane(originalPaneId);
    await openMenu();
    button("TerminalBroadcast.Title").click();
    await Vue.nextTick();
    host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await Vue.nextTick();
    button("TerminalBroadcast.Start").click();
    await Vue.nextTick();
    await openMenu();
    button("TerminalBroadcast.EditTargets").click();
    await Vue.nextTick();
    host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked').forEach((checkbox) => checkbox.click());
    await Vue.nextTick();
    button("TerminalBroadcast.Stop").click();
    await Vue.nextTick();
    await Vue.nextTick();
    expect(broadcast.useKokoTerminalBroadcast().broadcast.value).toBeNull();
    expect(workspace.tabs.value).toHaveLength(10);
    expect(mounted).toHaveBeenCalledTimes(11);
    expect(unmounted).toHaveBeenCalledExactlyOnceWith(closedPane.id);
    expect(warnings).toEqual([]);
  }
);
