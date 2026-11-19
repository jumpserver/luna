import type { Ref } from "vue";
import type { UserSettingPersistedState } from "~/composables/useSettingStorage";
import ts from "typescript";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as Vue from "vue";
import { compileScript, parse } from "vue/compiler-sfc";
import panelSource from "./bottomPanels.vue?raw";

const disk = vi.hoisted(() => ({ value: {} as Partial<UserSettingPersistedState> }));
vi.mock("~/shared/desktop/bridge", () => ({
  desktopStore: {
    load: async () => ({
      get: async () => structuredClone(disk.value),
      set: async (_key: string, value: UserSettingPersistedState) => {
        disk.value = structuredClone(value);
      },
      save: async () => {},
      onChange: async () => () => {}
    })
  }
}));

const unmounts: Array<() => void> = [];
beforeEach(() => {
  vi.resetModules();
  disk.value = {};
  vi.stubGlobal("isDesktopRuntime", () => true);
});
afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount());
  vi.unstubAllGlobals();
});

const { descriptor } = parse(panelSource);
const script = compileScript(descriptor, { id: "sidebar-panels" });
const { outputText } = ts.transpileModule(script.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
});

type Settings = ReturnType<typeof import("~/composables/useSettingManager").useSettingManager>;

async function loadSettings() {
  const { useSettingManager } = await import("~/composables/useSettingManager");
  const settings = useSettingManager();
  await settings.hydrationPromise.value;
  return settings;
}

function mountPanels(settings: Settings, visible = true, hideChrome = false) {
  const loadFavorites = vi.fn();
  const loadSnippets = vi.fn();
  const props = Vue.reactive({
    mainPanelOpen: settings.sidebarAssetsOpen.value,
    visiblePanels: { favorites: visible, snippets: visible },
    hideChrome
  });
  const globals = {
    ref: Vue.ref,
    computed: Vue.computed,
    watch: Vue.watch,
    useState: (_key: string, init: () => unknown) => Vue.ref(init()),
    useI18n: () => ({ t: (key: string) => key }),
    useToast: () => ({ add: vi.fn() }),
    useErrorToast: () => ({ addErrorToast: vi.fn() }),
    useSettingManager: () => settings,
    useFavoriteFolders: () => ({ folders: Vue.ref([]), rootAssets: Vue.ref([]), load: loadFavorites }),
    useSnippets: () => ({ snippets: Vue.ref([]), load: loadSnippets }),
    useWorkspaceTabs: () => ({ openScriptEditor: vi.fn() }),
    useEventBus: () => ({ on: vi.fn() })
  };
  const component = new Function(
    "require",
    ...Object.keys(globals),
    `const exports = {};\n${outputText}\nreturn exports.default;`
  )((name: string) => (name === "vue" ? Vue : {}), ...Object.values(globals));
  let state!: {
    isOpen: (kind: "favorites" | "snippets") => boolean;
    togglePanel: (kind: "favorites" | "snippets") => void;
    sidebarOpenPanel: Ref<UserSettingPersistedState["sidebarOpenPanel"]>;
  };
  const setup = component.setup;
  component.setup = (props: unknown, context: unknown) => {
    state = setup(props, context);
    return () => null;
  };
  const renderer = Vue.createRenderer({
    insert() {},
    remove() {},
    patchProp() {},
    createElement: () => ({}),
    createText: () => ({}),
    createComment: () => ({}),
    setText() {},
    setElementText() {},
    parentNode: () => null,
    nextSibling: () => null
  });
  const app = renderer.createApp({ render: () => Vue.h(component, props) });
  app.mount({});
  unmounts.push(() => app.unmount());
  return { state, props, loadFavorites, loadSnippets };
}

it("keeps the previous defaults for users without saved panel state", async () => {
  const settings = await loadSettings();
  const panels = mountPanels(settings);
  expect(settings.sidebarAssetsOpen.value).toBe(true);
  expect(panels.state.isOpen("favorites")).toBe(false);
  expect(panels.state.isOpen("snippets")).toBe(false);
  expect(panels.loadFavorites).not.toHaveBeenCalled();
  expect(panels.loadSnippets).not.toHaveBeenCalled();
});

it.each(["favorites", "snippets"] as const)("restores %s and loads its data after reopening", async (panel) => {
  const settings = await loadSettings();
  settings.setSidebarAssetsOpen(false);
  mountPanels(settings).state.togglePanel(panel);
  await vi.waitFor(() => {
    expect(disk.value.sidebarAssetsOpen).toBe(false);
    expect(disk.value.sidebarOpenPanel).toBe(panel);
  });

  unmounts.splice(0).forEach((unmount) => unmount());
  vi.resetModules();
  const restored = await loadSettings();
  const panels = mountPanels(restored);
  expect(restored.sidebarAssetsOpen.value).toBe(false);
  expect(panels.state.isOpen(panel)).toBe(true);
  expect(panel === "favorites" ? panels.loadFavorites : panels.loadSnippets).toHaveBeenCalledOnce();
});

it("loads a restored panel when settings hydrate after component setup", async () => {
  disk.value = { sidebarAssetsOpen: false, sidebarOpenPanel: "favorites" };
  const { useSettingManager } = await import("~/composables/useSettingManager");
  const settings = useSettingManager();
  const panels = mountPanels(settings);
  expect(panels.loadFavorites).not.toHaveBeenCalled();
  await settings.hydrationPromise.value;
  await Vue.nextTick();
  expect(settings.sidebarAssetsOpen.value).toBe(false);
  expect(panels.state.isOpen("favorites")).toBe(true);
  expect(panels.loadFavorites).toHaveBeenCalledOnce();
});

it("keeps panels exclusive and remembers closing the active panel", async () => {
  const settings = await loadSettings();
  const panels = mountPanels(settings);
  panels.state.togglePanel("favorites");
  await Vue.nextTick();
  panels.state.togglePanel("snippets");
  await Vue.nextTick();
  expect(panels.state.isOpen("favorites")).toBe(false);
  expect(panels.state.isOpen("snippets")).toBe(true);
  expect(panels.loadFavorites).toHaveBeenCalledOnce();
  expect(panels.loadSnippets).toHaveBeenCalledOnce();
  await vi.waitFor(() => expect(disk.value.sidebarOpenPanel).toBe("snippets"));
  panels.state.togglePanel("snippets");
  await vi.waitFor(() => expect(disk.value.sidebarOpenPanel).toBeNull());
  expect(panels.state.isOpen("snippets")).toBe(false);
});

it("loads hidden restored panels only when shown and preserves their open state", async () => {
  disk.value = { sidebarOpenPanel: "favorites" };
  const settings = await loadSettings();
  const panels = mountPanels(settings, false);
  expect(panels.loadFavorites).not.toHaveBeenCalled();
  panels.props.visiblePanels.favorites = true;
  await Vue.nextTick();
  expect(panels.loadFavorites).toHaveBeenCalledOnce();
  panels.props.visiblePanels.favorites = false;
  await Vue.nextTick();
  expect(settings.sidebarOpenPanel.value).toBe("favorites");
});

it("still loads visible panels when their collapsible headers are hidden", async () => {
  const panels = mountPanels(await loadSettings(), true, true);
  expect(panels.loadFavorites).toHaveBeenCalledOnce();
  expect(panels.loadSnippets).toHaveBeenCalledOnce();
});

it("falls back to defaults for invalid stored expansion values", async () => {
  disk.value = { sidebarAssetsOpen: null, sidebarOpenPanel: "removed-panel" } as unknown as UserSettingPersistedState;
  const settings = await loadSettings();
  expect(settings.sidebarAssetsOpen.value).toBe(true);
  expect(settings.sidebarOpenPanel.value).toBeNull();
});
