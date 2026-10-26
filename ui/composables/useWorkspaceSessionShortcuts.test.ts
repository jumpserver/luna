import { expect, it, vi } from "vitest";
import ts from "typescript";
import source from "./useWorkspaceSessionShortcuts.ts?raw";
import type { ShortcutId, ShortcutOverrides } from "~/shared/shortcuts";
import { matchesShortcut, shortcutBindings } from "~/shared/shortcuts";

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

function setup(desktop = false) {
  const state = {
    overrides: {} as ShortcutOverrides,
    digits: { value: true },
    settings: { value: false },
    enabled: true,
    activeTabId: { value: "one" },
    focusMode: { value: false },
    tabs: { value: [{ id: "one" }, { id: "two" }, { id: "three" }] }
  };
  const actions = {
    closeSession: vi.fn(),
    enterFocusMode: vi.fn(),
    exitFocusMode: vi.fn(),
    activateAdjacentSession: vi.fn(),
    setActiveSession: vi.fn()
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
        shortcutBindings(id, state.overrides, { mac: false, desktop }).some((binding) =>
          matchesShortcut(event, binding, false, true)
        ),
      sessionDigitShortcuts: state.digits
    }),
    usePlatform: () => ({ isMacOS: { value: false } }),
    useSettingsWindow: () => ({ open: state.settings }),
    useWorkspaceTabs: () => ({ ...state, ...actions }),
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
  hook(() => state.enabled);
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
  rt.state.overrides.nextTab = "Mod+Shift+KeyE";
  const old = rt.press("ArrowRight", { altKey: true, shiftKey: true });
  expect(old.defaultPrevented).toBe(false);
  const custom = rt.press("KeyE", { ctrlKey: true, shiftKey: true });
  expect(rt.actions.activateAdjacentSession).toHaveBeenCalledExactlyOnceWith("next");
  expect(custom.defaultPrevented).toBe(true);
  expect(custom.stopImmediatePropagation).toHaveBeenCalledOnce();
  const repeated = rt.press("KeyE", { ctrlKey: true, shiftKey: true, repeat: true });
  expect(repeated.defaultPrevented).toBe(true);
  expect(rt.actions.activateAdjacentSession).toHaveBeenCalledOnce();
  rt.state.overrides.nextTab = null;
  expect(rt.press("KeyE", { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
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
