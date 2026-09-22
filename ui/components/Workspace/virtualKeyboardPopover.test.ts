import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import { computed, effectScope, nextTick, onScopeDispose, reactive, ref, shallowRef, watch } from "vue";
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
        for (const name of Array.isArray(event) ? event : [event]) listeners.set(name, listener);
      },
      useMediaQuery: (query: string) => (query.includes("landscape") ? compactLandscape : narrowPortrait)
    }),
    computed,
    onScopeDispose,
    reactive,
    ref,
    shallowRef,
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
        commonShortcuts, keyboardRows, keyLabel, resetKeyboard, pressPointer, releasePointer, activateKey, pressedKeys,
        panelOffset, panelDrag, popoverContent, startPanelDrag, dragPanel, stopPanelDrag, movePanelWithKeyboard };`
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

function setupPanelDrag() {
  const keyboard = setup("rdp");
  keyboard.open.value = true;
  const viewport = { innerWidth: 1000, innerHeight: 800, visualViewport: null as object | null };
  const panel = {
    ownerDocument: { defaultView: viewport },
    getBoundingClientRect: () => ({
      left: 300 + keyboard.panelOffset.value.x,
      top: 400 + keyboard.panelOffset.value.y,
      width: 640,
      height: 320
    })
  };
  const captured = new Set<number>();
  const handle = {
    closest: () => panel,
    focus: vi.fn(),
    setPointerCapture: vi.fn((id: number) => captured.add(id)),
    hasPointerCapture: (id: number) => captured.has(id),
    releasePointerCapture: vi.fn((id: number) => captured.delete(id))
  };
  const event = (properties: Record<string, unknown> = {}) => ({
    button: 0,
    isPrimary: true,
    pointerId: 1,
    clientX: 100,
    clientY: 100,
    currentTarget: handle,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...properties
  });
  return { keyboard, handle, event, viewport };
}

it.each(["mouse", "touch"])("drags the whole popover without jumps and clamps all edges using %s", (pointerType) => {
  const { keyboard, event } = setupPanelDrag();
  keyboard.startPanelDrag(event({ pointerType }));
  keyboard.dragPanel(event({ clientX: 140, clientY: 130 }));
  expect(keyboard.popoverContent.value.style.translate).toBe("40px 30px");
  keyboard.stopPanelDrag(event());
  keyboard.startPanelDrag(event({ pointerType }));
  keyboard.dragPanel(event({ clientX: 110, clientY: 120 }));
  expect(keyboard.panelOffset.value).toEqual({ x: 50, y: 50 });
  keyboard.dragPanel(event({ clientX: 2000, clientY: 2000 }));
  expect(keyboard.panelOffset.value).toEqual({ x: 52, y: 72 });
  keyboard.dragPanel(event({ clientX: -2000, clientY: -2000 }));
  expect(keyboard.panelOffset.value).toEqual({ x: -292, y: -392 });
  expect(keyboard.sendKeyEvent).not.toHaveBeenCalled();
});

it("bounds dragging to the visual viewport when zoomed or covered by the mobile keyboard", () => {
  const { keyboard, event, viewport } = setupPanelDrag();
  viewport.visualViewport = { offsetLeft: 40, offsetTop: 20, width: 800, height: 400 };
  keyboard.startPanelDrag(event());
  keyboard.dragPanel(event({ clientX: 2000, clientY: 2000 }));
  expect(keyboard.panelOffset.value).toEqual({ x: -108, y: -308 });
  keyboard.dragPanel(event({ clientX: -2000, clientY: -2000 }));
  expect(keyboard.panelOffset.value).toEqual({ x: -252, y: -372 });
});

it("ignores secondary pointers and releases held remote keys when dragging starts", () => {
  const { keyboard, event } = setupPanelDrag();
  keyboard.startPanelDrag(event({ button: 2 }));
  keyboard.startPanelDrag(event({ isPrimary: false }));
  expect(keyboard.panelDrag.value).toBeNull();
  keyboard.toggleModifier("ctrl");
  keyboard.startPanelDrag(event());
  expect(keyboard.sendKeyEvent).toHaveBeenLastCalledWith(0, 65507);
  keyboard.dragPanel(event({ pointerId: 2, clientX: 200 }));
  keyboard.stopPanelDrag(event({ pointerId: 2 }));
  expect(keyboard.panelDrag.value).not.toBeNull();
  expect(keyboard.panelOffset.value).toEqual({ x: 0, y: 0 });
});

it.each(["pointerup", "pointercancel", "lostpointercapture"])("releases drag capture on %s", (type) => {
  const { keyboard, handle, event } = setupPanelDrag();
  keyboard.startPanelDrag(event());
  keyboard.stopPanelDrag(event({ type }));
  keyboard.dragPanel(event({ clientX: 200 }));
  expect(keyboard.panelDrag.value).toBeNull();
  expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
  expect(keyboard.panelOffset.value).toEqual({ x: 0, y: 0 });
});

it.each(["close", "resize", "rotate", "blur", "dispose"])("cleans up an active panel drag on %s", (action) => {
  const { keyboard, handle, event } = setupPanelDrag();
  keyboard.startPanelDrag(event());
  keyboard.dragPanel(event({ clientX: 120, clientY: 120 }));
  if (action === "close") keyboard.open.value = false;
  else if (action === "rotate") keyboard.compactLandscape.value = true;
  else if (action === "dispose") keyboard.dispose();
  else keyboard.listeners.get(action)!();
  expect(keyboard.panelDrag.value).toBeNull();
  expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
  if (["close", "resize", "rotate"].includes(action)) expect(keyboard.panelOffset.value).toEqual({ x: 0, y: 0 });
});

it("preserves position across panel switches and supports keyboard movement and Home to reset", () => {
  const { keyboard, event } = setupPanelDrag();
  const right = event({ key: "ArrowRight" });
  keyboard.movePanelWithKeyboard(right);
  keyboard.movePanelWithKeyboard(event({ key: "ArrowUp", shiftKey: true }));
  expect(keyboard.panelOffset.value).toEqual({ x: 8, y: -32 });
  expect(right.preventDefault).toHaveBeenCalled();
  expect(right.stopPropagation).toHaveBeenCalled();
  keyboard.selectedPanel.value = "keyboard";
  expect(keyboard.panelOffset.value).toEqual({ x: 8, y: -32 });
  const tab = event({ key: "Tab" });
  keyboard.movePanelWithKeyboard(tab);
  expect(tab.preventDefault).not.toHaveBeenCalled();
  keyboard.movePanelWithKeyboard(event({ key: "Home" }));
  expect(keyboard.panelOffset.value).toEqual({ x: 0, y: 0 });
});

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

it.each(["ssh", "telnet", "kubernetes", "k8s", "local-shell"])("sends every Linux shortcut in %s", (protocol) => {
  const keyboard = setup(protocol);
  for (const [label, data] of [
    ["Ctrl+C", "\x03"],
    ["Ctrl+D", "\x04"],
    ["Ctrl+Z", "\x1a"],
    ["Ctrl+R", "\x12"],
    ["Ctrl+L", "\x0c"],
    ["Home", "\x1b[H"],
    ["End", "\x1b[F"],
    ["PgUp", "\x1b[5~"],
    ["PgDn", "\x1b[6~"]
  ]) {
    keyboard.sendShortcut(keyboard.commonShortcuts.value.find((item: { label: string }) => item.label === label));
    expect(keyboard.sendKokoTerminalData).toHaveBeenLastCalledWith("session", data);
  }
  expect(keyboard.sendCombinationKeys).not.toHaveBeenCalled();
});

it.each(["rdp", "vnc"])("sends every Windows shortcut in %s", (protocol) => {
  const keyboard = setup(protocol);
  for (const [label, keys] of [
    ["Ctrl+Alt+Del", ["65507", "65513", "65535"]],
    ["Task Manager", ["65507", "65505", "65307"]],
    ["Alt+Tab", ["65513", "65289"]],
    ["Alt+F4", ["65513", "65473"]],
    ["Win+R", ["65515", "114"]],
    ["Win+E", ["65515", "101"]],
    ["Win+D", ["65515", "100"]],
    ["Win+L", ["65515", "108"]]
  ]) {
    keyboard.sendShortcut(keyboard.commonShortcuts.value.find((item: { label: string }) => item.label === label));
    expect(keyboard.sendCombinationKeys).toHaveBeenLastCalledWith(keys);
  }
  expect(keyboard.sendKokoTerminalData).not.toHaveBeenCalled();
});

it.each(["ssh", "rdp", "vnc"])("sends F1–F12 and Delete from the keyboard in %s", (protocol) => {
  const keyboard = setup(protocol);
  const keys = keyboard.keyboardRows.value.flat();
  const sequences = [
    "\x1bOP",
    "\x1bOQ",
    "\x1bOR",
    "\x1bOS",
    "\x1b[15~",
    "\x1b[17~",
    "\x1b[18~",
    "\x1b[19~",
    "\x1b[20~",
    "\x1b[21~",
    "\x1b[23~",
    "\x1b[24~",
    "\x1b[3~"
  ];
  for (const [index, sequence] of sequences.entries()) {
    const label = index === 12 ? "Del" : `F${index + 1}`;
    const virtualKey = keys.find((item: { label: string }) => item.label === label);
    keyboard.pressPointer(pointer(index), virtualKey);
    keyboard.releasePointer(pointer(index));
    if (protocol === "ssh") expect(keyboard.sendKokoTerminalData).toHaveBeenLastCalledWith("session", sequence);
    else {
      const keysym = index === 12 ? 65535 : 65470 + index;
      expect(keyboard.sendKeyEvent.mock.calls.slice(-2)).toEqual([
        [1, keysym],
        [0, keysym]
      ]);
    }
  }
});

it("encodes terminal function keys with modifiers without an extra escape prefix", () => {
  const keyboard = setup();
  keyboard.toggleModifier("alt");
  keyboard.toggleModifier("ctrl");
  for (const [label, expected] of [
    ["F1", "\x1b[1;7P"],
    ["F4", "\x1b[1;7S"],
    ["F5", "\x1b[15;7~"],
    ["F12", "\x1b[24;7~"],
    ["Del", "\x1b[3;7~"]
  ]) {
    const virtualKey = keyboard.keyboardRows.value.flat().find((item: { label: string }) => item.label === label);
    keyboard.send(virtualKey.value);
    expect(keyboard.sendKokoTerminalData).toHaveBeenLastCalledWith("session", expected);
  }
});

it.each(["ssh", "rdp", "vnc"])("shows Win/Cmd and enables it only for desktop protocols in %s", (protocol) => {
  const keyboard = setup(protocol);
  const winKey = keyboard.keyboardRows.value.flat().find((item: { modifier?: string }) => item.modifier === "win");
  expect(winKey.label).toBe("Win/Cmd");
  expect(winKey.disabled).toBe(protocol === "ssh");
  keyboard.toggleModifier("win");
  expect(keyboard.modifiers.win).toBe(protocol !== "ssh");
  if (protocol !== "ssh") {
    keyboard.send("r");
    keyboard.resetKeyboard();
    expect(keyboard.sendKeyEvent.mock.calls).toEqual([
      [1, 65515],
      [1, 114],
      [0, 114],
      [0, 65515]
    ]);
  } else expect(keyboard.sendKokoTerminalData).not.toHaveBeenCalled();
});
