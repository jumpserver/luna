import ts from "typescript";
import { expect, it, vi } from "vitest";
import * as Vue from "vue";
import { useResizeObserver } from "@vueuse/core";
import { compileScript, parse } from "vue/compiler-sfc";
import { resolveAssetIconFromFields } from "~/utils/assetIcon";
import source from "./tabHeader.vue?raw";
import iconSource from "../AppAssetIcon.vue?raw";

function compileComponent(source: string, services: Record<string, unknown> = {}) {
  const { descriptor } = parse(source);
  const script = compileScript(descriptor, { id: "tab-header-test", inlineTemplate: true });
  const { outputText } = ts.transpileModule(script.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  });
  const scope = { ...Vue, ...services };
  return new Function("require", ...Object.keys(scope), `const exports = {};\n${outputText}\nreturn exports.default;`)(
    (name: string) => (name === "vue" ? Vue : scope),
    ...Object.values(scope)
  );
}

it.skipIf(typeof document === "undefined").each([false, true])(
  "preserves group icons and excludes hidden tabs from width (standalone: %s)",
  async (standalone) => {
    const group = Vue.reactive({ id: "servers", title: "Servers", collapsed: false });
    const tabs = Vue.ref([
      { id: "linux", assetName: "Linux", assetType: "linux", group },
      { id: "mysql", assetName: "MySQL", assetType: "mysql", group },
      { id: "other", assetName: "Other", assetType: "windows" }
    ]);
    const activeTabId = Vue.ref("mysql");
    const component = compileComponent(source, {
      useResizeObserver,
      sessionGroupSaveError: Vue.ref(""),
      resolveAssetIconFromFields,
      useUserInfoStore: () => ({ loggedIn: Vue.ref(true) }),
      storeToRefs: (store: unknown) => store,
      useI18n: () => ({ t: (key: string) => key }),
      useToast: () => ({ add: vi.fn() }),
      useRuntimeConfig: () => ({ app: { baseURL: "/" } }),
      usePlatform: () => ({ isMacOS: Vue.ref(false) }),
      useSettingsWindow: () => ({ open: Vue.ref(false) }),
      useWorkspaceTabs: () => ({
        tabs,
        activeTabId,
        activeTab: Vue.computed(() => tabs.value.find((tab) => tab.id === activeTabId.value)),
        tabGroups: Vue.ref([group]),
        draggedTabId: Vue.ref(""),
        toggleTabGroup: () => (group.collapsed = !group.collapsed)
      }),
      useWorkspaceTabMenu: () => ({}),
      useEventListener: vi.fn(),
      isDesktopRuntime: () => false
    });
    const host = document.createElement("div");
    host.style.setProperty("--workspace-session-tab-width", "176px");
    document.body.append(host);
    const app = Vue.createApp(component, { standalone });
    app.component("AppAssetIcon", compileComponent(iconSource));
    app.component("UIcon", { render: () => Vue.h("svg") });
    app.component(
      "UButton",
      Vue.defineComponent({
        setup:
          (_props, { slots }) =>
          () =>
            Vue.h("button", slots.default?.())
      })
    );
    app.component(
      "UTooltip",
      Vue.defineComponent({
        setup:
          (_props, { slots }) =>
          () =>
            slots.default?.()
      })
    );
    app.component("WorkspaceAddSessionPopover", { render: () => Vue.h("button", "+") });
    for (const name of ["UDropdownMenu", "UModal", "UInput"]) app.component(name, { render: () => null });
    app.mount(host);
    try {
      await Vue.nextTick();
      const images = [...host.querySelectorAll("img")];
      expect(images).toHaveLength(3);
      const capsule = host.querySelector<HTMLElement>(".workspace-tab-capsule")!;
      const expandedWidth = getComputedStyle(capsule).width;
      for (let i = 0; i < 3; i++) {
        const label = host.querySelector<HTMLButtonElement>(".workspace-tab-group-label");
        if (label) label.click();
        else group.collapsed = true;
        await Vue.nextTick();
        const buttons = [...host.querySelectorAll<HTMLElement>("[data-tab-id]")];
        expect(buttons.filter((button) => button.style.display !== "none")).toHaveLength(standalone ? 3 : 1);
        expect(parseFloat(expandedWidth) - parseFloat(getComputedStyle(capsule).width)).toBe(standalone ? 0 : 360);
        expect(host.querySelector("[data-group-active='true']") !== null).toBe(!standalone);
        if (label) label.click();
        else group.collapsed = false;
        await Vue.nextTick();
        expect(getComputedStyle(capsule).width).toBe(expandedWidth);
        const currentImages = [...host.querySelectorAll("img")];
        images.forEach((image, index) => expect(currentImages[index]).toBe(image));
      }
    } finally {
      app.unmount();
      host.remove();
    }
  }
);
