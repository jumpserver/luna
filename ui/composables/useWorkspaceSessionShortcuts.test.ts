import { expect, it, vi } from "vitest";
import ts from "typescript";
import source from "./useWorkspaceSessionShortcuts.ts?raw";
import type { ShortcutId, ShortcutOverrides } from "~/shared/shortcuts";
import { matchesShortcut, shortcutBindings } from "~/shared/shortcuts";
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";

class Target {
  isContentEditable = false;
  constructor(private kind = "terminal") {}
  closest(selector: string) {
    return (this.kind === "terminal" && selector === ".xterm") ||
      (this.kind === "editor" && selector.includes(".cm-editor")) ||
      (this.kind === "input" && selector.includes("input"))
      ? this
      : null;
  }
}

function setup(desktop = false, mac = false, standalone = false) {
  const state = {
    overrides: {} as ShortcutOverrides,
    digits: { value: true },
    settings: { value: false },
    enabled: true,
    activeTabId: { value: "one" },
    focusMode: { value: false },
    tabs: { value: [{ id: "one" }, { id: "two" }, { id: "three" }] as WorkspaceSessionTab[] }
  };
  const actions = {
    closeSession: vi.fn(),
    enterFocusMode: vi.fn(),
    exitFocusMode: vi.fn(),
    activateAdjacentSession: vi.fn(),
    setActiveSession: vi.fn(),
    canSplitWorkspace: vi.fn(() => true),
    splitWorkspace: vi.fn(),
    cloneSession: vi.fn(),
    openNewSession: vi.fn(),
    invoke: vi.fn()
  };
  let listener: (event: KeyboardEvent) => void;
  let menuListener: (event: { payload: string }) => void;
  let mounted: () => Promise<void>;
  let dispose: () => void;
  const off = vi.fn();
  const scope = {
    exports: {},
    require: () => ({
      isWorkspaceTourActive: () => false,
      desktopInvoke: actions.invoke,
      desktopListen: async (_name: string, fn: typeof menuListener) => {
        menuListener = fn;
        return off;
      }
    }),
    window: {},
    HTMLElement: Target,
    useAppShortcuts: () => ({
      blocked: (event: KeyboardEvent) => event.defaultPrevented || event.isComposing || state.settings.value,
      matches: (id: ShortcutId, event: KeyboardEvent) =>
        shortcutBindings(id, state.overrides, { mac, desktop }).some((binding) =>
          matchesShortcut(event, binding, mac, true)
        ),
      sessionDigitShortcuts: state.digits
    }),
    usePlatform: () => ({ isMacOS: { value: mac } }),
    useSettingsWindow: () => ({ open: state.settings }),
    useWorkspaceTabs: () => ({ ...state, ...actions }),
    useWorkspaceTabMenu: () => actions,
    useEventListener: (_target: unknown, _name: string, fn: typeof listener, options: { capture: boolean }) => {
      listener = fn;
      expect(options.capture).toBe(true);
    },
    onMounted: (fn: typeof mounted) => {
      mounted = fn;
    },
    onBeforeUnmount: (fn: typeof dispose) => {
      dispose = fn;
    },
    isDesktopRuntime: () => desktop
  };
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const hook = new Function(...Object.keys(scope), `${outputText}; return exports.useWorkspaceSessionShortcuts;`)(
    ...Object.values(scope)
  );
  hook(() => state.enabled, standalone ? undefined : actions.openNewSession);
  const press = (code: string, modifiers: Record<string, unknown> = {}, target = new Target()) => {
    const event = {
      code,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      target,
      defaultPrevented: false,
      preventDefault: vi.fn(function (this: { defaultPrevented: boolean }) {
        this.defaultPrevented = true;
      }),
      stopImmediatePropagation: vi.fn(),
      ...modifiers
    };
    listener!(event as unknown as KeyboardEvent);
    return event;
  };
  return {
    state,
    actions,
    press,
    mount: () => mounted!(),
    menu: (payload: string) => menuListener!({ payload }),
    dispose: () => dispose!(),
    off
  };
}

it("consumes a custom navigation chord before it reaches the remote terminal and releases the old chord", () => {
  const rt = setup();
  rt.state.overrides.nextTab = "Mod+Shift+KeyY";
  const old = rt.press("ArrowRight", { altKey: true, shiftKey: true });
  expect(old.defaultPrevented).toBe(false);
  const custom = rt.press("KeyY", { ctrlKey: true, shiftKey: true });
  expect(rt.actions.activateAdjacentSession).toHaveBeenCalledExactlyOnceWith("next");
  expect(custom.defaultPrevented).toBe(true);
  expect(custom.stopImmediatePropagation).toHaveBeenCalledOnce();
  const repeated = rt.press("KeyY", { ctrlKey: true, shiftKey: true, repeat: true });
  expect(repeated.defaultPrevented).toBe(true);
  expect(rt.actions.activateAdjacentSession).toHaveBeenCalledOnce();
  rt.state.overrides.nextTab = null;
  expect(rt.press("KeyY", { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
});

it.each([false, true])("splits a single active workspace before keys reach the terminal (desktop: %s)", (desktop) => {
  for (const mac of [false, true]) {
    const rt = setup(desktop, mac);
    rt.state.tabs.value = [rt.state.tabs.value[0]!];
    const modifiers = mac ? { metaKey: true } : { ctrlKey: true, shiftKey: true };
    const vertical = rt.press(mac ? "KeyD" : "KeyO", modifiers);
    expect(rt.actions.splitWorkspace).toHaveBeenLastCalledWith("one", "vertical");
    expect(vertical.defaultPrevented).toBe(true);
    expect(vertical.stopImmediatePropagation).toHaveBeenCalledOnce();
    rt.press(mac ? "KeyD" : "KeyE", { ...modifiers, shiftKey: true });
    expect(rt.actions.splitWorkspace).toHaveBeenLastCalledWith("one", "horizontal");
    expect(rt.actions.setActiveSession).toHaveBeenCalledWith("one");
    rt.press(mac ? "KeyD" : "KeyE", { ...modifiers, shiftKey: true, repeat: true });
    expect(rt.actions.splitWorkspace).toHaveBeenCalledTimes(2);
  }
});

it("honors split limits, custom bindings, disabled actions and terminal Ctrl+D", () => {
  const rt = setup();
  rt.actions.canSplitWorkspace.mockReturnValue(false);
  expect(rt.press("KeyO", { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
  expect(rt.actions.splitWorkspace).not.toHaveBeenCalled();
  rt.actions.canSplitWorkspace.mockReturnValue(true);
  rt.state.overrides.splitVertical = "Mod+Alt+KeyY";
  expect(rt.press("KeyO", { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
  rt.press("KeyY", { ctrlKey: true, altKey: true });
  expect(rt.actions.splitWorkspace).toHaveBeenCalledExactlyOnceWith("one", "vertical");
  rt.state.overrides.splitVertical = null;
  expect(rt.press("KeyY", { ctrlKey: true, altKey: true }).defaultPrevented).toBe(false);
  expect(rt.press("KeyD", { ctrlKey: true }).defaultPrevented).toBe(false);
});

it("leaves split keys to editors and inputs and blocks inactive or modal workspaces", () => {
  const rt = setup();
  for (const kind of ["editor", "input"]) {
    expect(rt.press("KeyO", { ctrlKey: true, shiftKey: true }, new Target(kind)).defaultPrevented).toBe(false);
    expect(rt.press("KeyE", { ctrlKey: true, shiftKey: true }, new Target(kind)).defaultPrevented).toBe(false);
  }
  for (const modifiers of [{ isComposing: true }, { defaultPrevented: true }, { altKey: true }]) {
    rt.press("KeyO", { ctrlKey: true, shiftKey: true, ...modifiers });
  }
  rt.state.settings.value = true;
  rt.press("KeyO", { ctrlKey: true, shiftKey: true });
  rt.state.settings.value = false;
  rt.state.enabled = false;
  rt.press("KeyO", { ctrlKey: true, shiftKey: true });
  rt.state.enabled = true;
  rt.state.activeTabId.value = "";
  rt.press("KeyO", { ctrlKey: true, shiftKey: true });
  expect(rt.actions.splitWorkspace).not.toHaveBeenCalled();
});

it("keeps number navigation out of editors, inputs and disabled groups", () => {
  const rt = setup();
  for (const kind of ["editor", "input"]) {
    rt.press("Digit2", { ctrlKey: true }, new Target(kind));
    expect(rt.press("ArrowLeft", { altKey: true, shiftKey: true }, new Target(kind)).defaultPrevented).toBe(false);
  }
  expect(rt.actions.activateAdjacentSession).not.toHaveBeenCalled();
  expect(rt.actions.setActiveSession).not.toHaveBeenCalled();
  rt.press("Digit9", { ctrlKey: true });
  expect(rt.actions.setActiveSession).toHaveBeenCalledExactlyOnceWith("three");
  rt.state.digits.value = false;
  expect(rt.press("Digit1", { ctrlKey: true }).defaultPrevented).toBe(false);
});

it("does not close a workspace for the editor's standard close-file chord", () => {
  const rt = setup(true);
  expect(rt.press("KeyW", { ctrlKey: true }, new Target("editor")).defaultPrevented).toBe(false);
  expect(rt.actions.closeSession).not.toHaveBeenCalled();
  rt.press("KeyW", { altKey: true, shiftKey: true });
  expect(rt.actions.closeSession).toHaveBeenCalledExactlyOnceWith("one");
  rt.state.overrides.closeTab = null;
  expect(rt.press("KeyW", { ctrlKey: true }).defaultPrevented).toBe(false);
  expect(rt.press("KeyW", { altKey: true, shiftKey: true }).defaultPrevented).toBe(false);
});

it("blocks workspace actions during settings, composition, repeats and inactive workspaces", () => {
  const rt = setup();
  for (const modifiers of [{ isComposing: true }, { repeat: true }, { defaultPrevented: true }]) {
    rt.press("KeyP", { ctrlKey: true, shiftKey: true, ...modifiers });
  }
  rt.state.settings.value = true;
  rt.press("KeyP", { ctrlKey: true, shiftKey: true });
  rt.state.settings.value = false;
  rt.state.enabled = false;
  rt.press("KeyP", { ctrlKey: true, shiftKey: true });
  expect(rt.actions.enterFocusMode).not.toHaveBeenCalled();
});

it("keeps menu clicks functional after disabling a shortcut and cleans up detached windows", async () => {
  const rt = setup(true);
  rt.state.overrides.closeTab = null;
  await rt.mount();
  rt.menu("close-current-tab");
  expect(rt.actions.closeSession).toHaveBeenCalledExactlyOnceWith("one");
  rt.state.settings.value = true;
  rt.menu("close-current-tab");
  expect(rt.actions.closeSession).toHaveBeenCalledOnce();
  rt.dispose();
  expect(rt.off).toHaveBeenCalledOnce();
});

it.each([false, true])("clones the active tab with Option/Alt+Shift+D (desktop: %s)", (desktop) => {
  const rt = setup(desktop, true);
  const tab = { id: "two", payload: { token: { id: "token" } } } as WorkspaceSessionTab;
  rt.state.tabs.value[1] = tab;
  rt.state.activeTabId.value = "two";
  const chord = { altKey: true, shiftKey: true };
  expect(rt.press("KeyD", chord).defaultPrevented).toBe(true);
  expect(rt.actions.cloneSession).toHaveBeenCalledExactlyOnceWith(tab);
  rt.press("KeyD", { ...chord, repeat: true });
  expect(rt.actions.cloneSession).toHaveBeenCalledOnce();
  for (const kind of ["editor", "input"]) {
    expect(rt.press("KeyD", chord, new Target(kind)).defaultPrevented).toBe(false);
  }
  rt.state.overrides.cloneTab = null;
  expect(rt.press("KeyD", chord).defaultPrevented).toBe(false);
  rt.state.overrides.cloneTab = "Mod+Alt+KeyY";
  expect(rt.press("KeyD", chord).defaultPrevented).toBe(false);
  rt.press("KeyY", { metaKey: true, altKey: true });
  expect(rt.actions.cloneSession).toHaveBeenCalledTimes(2);
});

it("never attempts to clone a local shell, script editor or tokenless tab", () => {
  const rt = setup(true);
  rt.press("KeyD", { altKey: true, shiftKey: true });
  expect(rt.actions.cloneSession).not.toHaveBeenCalled();
});

it.each([false, true])("opens the new-session picker without an active tab (mac: %s)", (mac) => {
  const rt = setup(true, mac);
  rt.state.activeTabId.value = "";
  rt.state.enabled = false;
  const chord = mac ? { metaKey: true } : { ctrlKey: true };
  const event = rt.press("KeyT", chord);
  expect(event.defaultPrevented).toBe(true);
  expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
  expect(rt.actions.openNewSession).toHaveBeenCalledOnce();
  rt.press("KeyT", { ...chord, repeat: true });
  expect(rt.actions.openNewSession).toHaveBeenCalledOnce();
  rt.state.settings.value = true;
  rt.press("KeyT", chord);
  expect(rt.actions.openNewSession).toHaveBeenCalledOnce();
  rt.state.settings.value = false;
  rt.state.overrides.newSession = null;
  expect(rt.press("KeyT", chord).defaultPrevented).toBe(false);
  rt.state.overrides.newSession = "Mod+Alt+KeyT";
  expect(rt.press("KeyT", chord).defaultPrevented).toBe(false);
  rt.press("KeyT", { ...chord, altKey: true });
  expect(rt.actions.openNewSession).toHaveBeenCalledTimes(2);
});

it("leaves browser new-tab shortcuts intact and opens the main picker from standalone desktop windows", () => {
  const web = setup(false, true);
  expect(web.press("KeyT", { metaKey: true }).defaultPrevented).toBe(false);
  expect(web.actions.openNewSession).not.toHaveBeenCalled();
  const standalone = setup(true, true, true);
  standalone.press("KeyT", { metaKey: true });
  expect(standalone.actions.invoke).toHaveBeenCalledExactlyOnceWith("open_new_session");
});
