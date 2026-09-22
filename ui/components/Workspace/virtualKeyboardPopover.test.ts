import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import { computed, effectScope, nextTick, onScopeDispose, reactive, ref, watch } from "vue";
import source from "./virtualKeyboardPopover.vue?raw";

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

function setup(protocol = "ssh") {
  const sendKokoTerminalData = vi.fn(() => true);
  const sendCombinationKeys = vi.fn();
  const sendKeyEvent = vi.fn();
  const otherSessionKeyEvent = vi.fn();
  const isRemoteApp = ref(false);
  const activePaneId = ref("session");
  const activeTab = ref({
    panes: [
      { id: "session", protocol, status: "connected" },
      { id: "other", protocol, status: "connected" }
    ]
  });
  const listeners = new Map<string, () => void>();
  const compactLandscape = ref(false);
  const narrowPortrait = ref(false);
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1]!;
  const { outputText } = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const scope = {
    exports: {},
    require: () => ({
      sendKokoTerminalData,
      getLionWorkspaceSession: (id: string) => ({
        sendCombinationKeys,
        isRemoteApp,
        sendKeyEvent: id === "session" ? sendKeyEvent : otherSessionKeyEvent
      }),
      useEventListener: (...args: any[]) => {
        const [event, listener] = typeof args[0] === "string" ? args : args.slice(1);
        listeners.set(event, listener);
      },
      useMediaQuery: (query: string) => (query.includes("landscape") ? compactLandscape : narrowPortrait)
    }),
    computed,
    onScopeDispose,
    reactive,
    ref,
    watch,
    useI18n: () => ({ t: (key: string) => key }),
    useToast: () => ({ add: vi.fn() }),
    useWorkspaceTabs: () => ({ activeTab, activePaneId })
  };
  const effects = effectScope();
  cleanups.push(() => effects.stop());
  const keyboard = effects.run(() =>
    new Function(
      ...Object.keys(scope),
      `${outputText}; return { send, sendShortcut, toggleModifier, modifiers, open, selectedPanel,
        commonShortcuts, keyboardRows, keyLabel, resetKeyboard, pressPointer, releasePointer, activateKey, pressedKeys };`
    )(...Object.values(scope))
  )!;
  return {
    ...keyboard,
    sendKokoTerminalData,
    sendCombinationKeys,
    sendKeyEvent,
    otherSessionKeyEvent,
    isRemoteApp,
    activePaneId,
    activeTab,
    listeners,
    compactLandscape,
    narrowPortrait,
    dispose: () => effects.stop()
  };
}

const key = (value: string) => ({ label: value, value });
const pointer = (pointerId: number) => ({ button: 0, pointerId, currentTarget: { setPointerCapture: vi.fn() } });

it("keeps multiple terminal modifiers selected until explicitly released", () => {
  const keyboard = setup();
  keyboard.toggleModifier("shift");
  for (const [value, expected] of [
    ["1", "!"],
    ["-", "_"],
    [";", ":"],
    ["/", "?"],
    ["a", "A"]
  ]) {
    keyboard.send(value);
    expect(keyboard.sendKokoTerminalData).toHaveBeenLastCalledWith("session", expected);
    expect(keyboard.modifiers.shift).toBe(true);
  }
  keyboard.toggleModifier("ctrl");
  keyboard.toggleModifier("alt");
  keyboard.send("c");
  expect(keyboard.sendKokoTerminalData).toHaveBeenLastCalledWith("session", "\x1b\x03");
  keyboard.send("\x1b[A");
  expect(keyboard.sendKokoTerminalData).toHaveBeenLastCalledWith("session", "\x1b[1;8A");
  keyboard.toggleModifier("shift");
  keyboard.toggleModifier("ctrl");
  keyboard.toggleModifier("alt");
  keyboard.send("c");
  expect(keyboard.sendKokoTerminalData).toHaveBeenLastCalledWith("session", "c");
});

it.each(["ssh", "rdp", "vnc"])("supports CapsLock with Shift inversion in %s", (protocol) => {
  const keyboard = setup(protocol);
  keyboard.toggleModifier("caps");
  for (const [value, expected] of [
    ["a", "A"],
    ["z", "Z"],
    ["1", "1"],
    [";", ";"]
  ]) {
    keyboard.send(value);
    expect(keyboard.keyLabel(key(value!))).toBe(expected);
    if (protocol === "ssh") expect(keyboard.sendKokoTerminalData).toHaveBeenLastCalledWith("session", expected);
    else
      expect(keyboard.sendKeyEvent.mock.calls.slice(-2)).toEqual([
        [1, expected!.charCodeAt(0)],
        [0, expected!.charCodeAt(0)]
      ]);
  }
  keyboard.toggleModifier("shift");
  keyboard.send("a");
  expect(keyboard.keyLabel(key("a"))).toBe("a");
  expect(keyboard.keyLabel(key("1"))).toBe("!");
  if (protocol === "ssh") expect(keyboard.sendKokoTerminalData).toHaveBeenLastCalledWith("session", "a");
  else
    expect(keyboard.sendKeyEvent.mock.calls.slice(-2)).toEqual([
      [1, 97],
      [0, 97]
    ]);
  expect(keyboard.keyLabel({ label: "Enter", value: "\r" })).toBe("Enter");
  expect(keyboard.modifiers.caps).toBe(true);
  keyboard.toggleModifier("caps");
  expect(keyboard.keyLabel(key("a"))).toBe("A");
});

it.each(["rdp", "vnc"])("holds remote modifiers across repeated keys in %s", (protocol) => {
  const keyboard = setup(protocol);
  for (const modifier of ["ctrl", "alt", "shift", "win"]) keyboard.toggleModifier(modifier);
  keyboard.send("\x1b");
  keyboard.send("\t");
  expect(keyboard.sendKeyEvent.mock.calls).toEqual([
    [1, 65507],
    [1, 65513],
    [1, 65505],
    [1, 65515],
    [1, 65307],
    [0, 65307],
    [1, 65289],
    [0, 65289]
  ]);
  keyboard.toggleModifier("win");
  expect(keyboard.sendKeyEvent).toHaveBeenLastCalledWith(0, 65515);
  expect(keyboard.modifiers.ctrl).toBe(true);
  expect(keyboard.sendKokoTerminalData).not.toHaveBeenCalled();
});

it("holds two pointer keys and releases each captured keysym without duplicate clicks", () => {
  const keyboard = setup("rdp");
  const first = pointer(1);
  const second = pointer(2);
  keyboard.pressPointer(first, key("a"));
  keyboard.pressPointer(second, key("b"));
  expect(keyboard.sendKeyEvent.mock.calls).toEqual([
    [1, 97],
    [1, 98]
  ]);
  expect(first.currentTarget.setPointerCapture).toHaveBeenCalledWith(1);
  keyboard.toggleModifier("shift");
  keyboard.releasePointer(first);
  keyboard.activateKey({ detail: 1 }, key("a"));
  expect(keyboard.sendKeyEvent.mock.calls).toEqual([
    [1, 97],
    [1, 98],
    [1, 65505],
    [0, 97]
  ]);
  keyboard.releasePointer(second);
  keyboard.releasePointer(second);
  expect(keyboard.sendKeyEvent).toHaveBeenLastCalledWith(0, 98);
  keyboard.activateKey({ detail: 0 }, key("c"));
  expect(keyboard.sendKeyEvent.mock.calls.slice(-2)).toEqual([
    [1, 67],
    [0, 67]
  ]);
});

it("releases a shared key only after its last touch ends", () => {
  const keyboard = setup("rdp");
  keyboard.pressPointer(pointer(1), key("a"));
  keyboard.pressPointer(pointer(2), key("a"));
  keyboard.releasePointer(pointer(1));
  expect(keyboard.sendKeyEvent.mock.calls).toEqual([[1, 97]]);
  keyboard.releasePointer(pointer(2));
  expect(keyboard.sendKeyEvent.mock.calls).toEqual([
    [1, 97],
    [0, 97]
  ]);
});

it.each(["close", "panel", "session", "disconnect", "blur", "dispose", "rotate"])(
  "releases held keys on %s using their original session",
  async (action) => {
    const keyboard = setup("rdp");
    keyboard.open.value = true;
    keyboard.selectedPanel.value = "keyboard";
    keyboard.toggleModifier("ctrl");
    keyboard.toggleModifier("caps");
    keyboard.pressPointer(pointer(1), key("a"));
    switch (action) {
      case "close":
        keyboard.open.value = false;
        break;
      case "panel":
        keyboard.selectedPanel.value = "shortcuts";
        break;
      case "session":
        keyboard.activePaneId.value = "other";
        break;
      case "disconnect":
        keyboard.activeTab.value.panes[0]!.status = "disconnected";
        break;
      case "blur":
        keyboard.listeners.get("blur")!();
        break;
      case "dispose":
        keyboard.dispose();
        break;
      case "rotate":
        keyboard.narrowPortrait.value = true;
        break;
    }
    await nextTick();
    expect(keyboard.sendKeyEvent.mock.calls.slice(-2)).toEqual([
      [0, 65],
      [0, 65507]
    ]);
    expect(Object.values(keyboard.modifiers)).toEqual([false, false, false, false, false]);
    expect(keyboard.pressedKeys.size).toBe(0);
    expect(keyboard.otherSessionKeyEvent).not.toHaveBeenCalled();
  }
);

it("encodes terminal control symbols and navigation combinations", () => {
  const keyboard = setup();
  keyboard.toggleModifier("ctrl");
  for (const [value, expected] of [
    [" ", "\x00"],
    ["[", "\x1b"],
    ["\\", "\x1c"],
    ["]", "\x1d"],
    ["\x7f", "\x08"]
  ]) {
    keyboard.send(value);
    expect(keyboard.sendKokoTerminalData).toHaveBeenLastCalledWith("session", expected);
  }
  keyboard.toggleModifier("shift");
  keyboard.send("-");
  expect(keyboard.sendKokoTerminalData).toHaveBeenLastCalledWith("session", "\x1f");
  keyboard.toggleModifier("ctrl");
  keyboard.send("\t");
  expect(keyboard.sendKokoTerminalData).toHaveBeenLastCalledWith("session", "\x1b[Z");
});

it("adds the requested shortcuts with protocol-specific data and preserves RemoteApp filtering", () => {
  const terminal = setup();
  const desktop = setup("rdp");
  for (const [label, code, keysym] of [
    ["Ctrl+V", "\x16", "118"],
    ["Ctrl+X", "\x18", "120"],
    ["Ctrl+S", "\x13", "115"]
  ]) {
    terminal.sendShortcut(terminal.commonShortcuts.value.find((item: { label: string }) => item.label === label));
    expect(terminal.sendKokoTerminalData).toHaveBeenLastCalledWith("session", code);
    desktop.sendShortcut(desktop.commonShortcuts.value.find((item: { label: string }) => item.label === label));
    expect(desktop.sendCombinationKeys).toHaveBeenLastCalledWith(["65507", keysym]);
  }
  desktop.sendShortcut(desktop.commonShortcuts.value.find((item: { label: string }) => item.label === "Win+Tab"));
  expect(desktop.sendCombinationKeys).toHaveBeenLastCalledWith(["65515", "65289"]);
  desktop.isRemoteApp.value = true;
  expect(desktop.commonShortcuts.value.map((shortcut: { label: string }) => shortcut.label)).toEqual(["Alt+Tab"]);
});
