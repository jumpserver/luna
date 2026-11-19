import ts from "typescript";
import { expect, it, vi } from "vitest";
import * as Vue from "vue";
import * as broadcast from "#koko/composables/terminal/useTerminalBroadcast";
import * as layout from "~/utils/workspaceLayout";
import { compileScript, parse } from "vue/compiler-sfc";
import source from "./sessionPane.vue?raw";

it.skipIf(typeof document === "undefined")(
  "focuses new empty panes and scopes connection keys to their buttons",
  async () => {
    const { userEvent } = await import("vitest/browser");
    const activeTabId = Vue.ref("tab");
    const activePaneId = Vue.ref("terminal");
    const settingsOpen = Vue.ref(false);
    const tourActive = Vue.ref(false);
    const connectCurrentPane = vi.fn();
    const setActivePane = (id: string) => {
      activePaneId.value = id;
    };
    const tab = Vue.reactive({
      id: "tab",
      layoutMode: "columns-2",
      panes: [
        { id: "terminal", mode: "session", protocol: "ssh", payload: { id: "token" } },
        { id: "empty", mode: "empty", protocol: "" }
      ]
    });
    const scope = {
      ...Vue,
      ...broadcast,
      ...layout,
      isWorkspaceTourActive: () => tourActive.value,
      shouldShowConnectionProgress: () => false,
      findDeclaredCapability: () => null,
      useUserInfoStore: () => ({ currentUser: Vue.ref(null) }),
      storeToRefs: (store: unknown) => store,
      useI18n: () => ({ t: (key: string) => key }),
      useColorMode: () => Vue.ref("light"),
      useToast: () => ({}),
      useSettingsWindow: () => ({ open: settingsOpen }),
      useAppShortcuts: () => ({
        blocked: (event: KeyboardEvent) =>
          event.defaultPrevented || event.isComposing || settingsOpen.value || tourActive.value
      }),
      useWorkspaceTabs: () => ({ activePaneId, activeTabId, setActivePane, draggedTabId: Vue.ref("") }),
      useWorkspacePaneSurfaceRegistry: () => ({
        focusPaneSurface: vi.fn(),
        registerPaneTarget: vi.fn(),
        unregisterPaneTarget: vi.fn()
      }),
      useAclDialog: () => ({ hasScopeGroup: () => false }),
      useWorkspaceTabMenu: () => ({ connectCurrentPane })
    };
    const script = compileScript(parse(source).descriptor, { id: "pane-shortcut-test", inlineTemplate: true });
    const { outputText } = ts.transpileModule(script.content, {
      compilerOptions: { module: ts.ModuleKind.CommonJS }
    });
    const component = new Function(
      "require",
      ...Object.keys(scope),
      `const exports = {}; ${outputText}; return exports.default;`
    )((name: string) => (name === "vue" ? Vue : scope), ...Object.values(scope));
    const host = document.createElement("div");
    document.body.append(host);
    const terminalInput = document.createElement("textarea");
    document.body.append(terminalInput);
    terminalInput.focus();
    const app = Vue.createApp(component, { tab });
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
      "UModal",
      Vue.defineComponent({
        props: { open: Boolean },
        setup: (props) => () => (props.open ? Vue.h("div", { role: "dialog" }) : null)
      })
    );
    for (const name of ["UBadge", "UIcon", "UKbd"]) app.component(name, { render: () => Vue.h("span") });
    app.component(
      "UTooltip",
      Vue.defineComponent({
        inheritAttrs: false,
        setup:
          (_props, { slots }) =>
          () =>
            slots.default?.()
      })
    );
    for (const name of [
      "WorkspaceConnectionProgressOverlay",
      "WorkspaceAclPaneHost",
      "WorkspaceConnectionSetupPane",
      "UInput",
      "SideBarAssetTree"
    ]) {
      app.component(name, { render: () => null });
    }
    app.mount(host);
    const current = () => host.querySelector<HTMLButtonElement>('[data-connect-current="empty"]')!;
    const settle = async () => {
      await Vue.nextTick();
      await Vue.nextTick();
    };
    try {
      await settle();
      expect(document.activeElement).toBe(terminalInput);
      activePaneId.value = "empty";
      await settle();
      expect(document.activeElement).toBe(current());
      await userEvent.keyboard("{Enter}");
      expect(connectCurrentPane).toHaveBeenCalledExactlyOnceWith(tab, tab.panes[1]);

      for (const properties of [
        { repeat: true },
        { isComposing: true },
        { ctrlKey: true },
        { metaKey: true },
        { altKey: true }
      ]) {
        current().dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true, ...properties })
        );
        expect(host.querySelector('[role="dialog"]')).toBeNull();
      }
      settingsOpen.value = true;
      await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
      expect(host.querySelector('[role="dialog"]')).toBeNull();
      settingsOpen.value = false;

      // Hidden/inactive workspaces must leave the terminal's Enter alone.
      activePaneId.value = "terminal";
      await settle();
      terminalInput.focus();
      await userEvent.keyboard("{Enter}");
      expect(connectCurrentPane).toHaveBeenCalledOnce();
      settingsOpen.value = true;
      activePaneId.value = "empty";
      await settle();
      expect(document.activeElement).toBe(terminalInput);
      settingsOpen.value = false;
      activePaneId.value = "terminal";
      await settle();
      activePaneId.value = "empty";
      await settle();
      expect(document.activeElement).toBe(current());
      await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
      expect(host.querySelector('[role="dialog"]')).not.toBeNull();
      expect(connectCurrentPane).toHaveBeenCalledOnce();
    } finally {
      app.unmount();
      host.remove();
      terminalInput.remove();
    }
  }
);
