import { useElementSize } from "@vueuse/core";
import { afterEach, expect, it, vi } from "vitest";
import { effectScope, nextTick, shallowRef } from "vue";
import { useAiPanelLayout } from "./useAiPanelLayout";

vi.mock("@vueuse/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vueuse/core")>()),
  useElementSize: vi.fn()
}));

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.clearAllMocks();
});

function setup(floating = true) {
  const size = { width: shallowRef(1000), height: shallowRef(800), stop: vi.fn() };
  vi.mocked(useElementSize).mockReturnValue(size);
  const width = shallowRef(380);
  const narrow = shallowRef(false);
  const defaultFloating = shallowRef(floating);
  const captured = new Set<number>();
  const panel = Object.assign(new EventTarget(), {
    getBoundingClientRect: () => ({
      left: 100 + size.width.value - width.value,
      top: 50,
      width: width.value,
      height: size.height.value
    }),
    setPointerCapture: vi.fn((id: number) => captured.add(id)),
    hasPointerCapture: (id: number) => captured.has(id),
    releasePointerCapture: vi.fn((id: number) => captured.delete(id))
  });
  const area = { getBoundingClientRect: () => ({ left: 100, top: 50 }) };
  const scope = effectScope();
  const state = scope.run(() =>
    useAiPanelLayout({
      area: shallowRef(area as HTMLElement),
      panel: shallowRef(panel as unknown as HTMLElement),
      narrow,
      defaultFloating,
      width,
      setWidth: (value) => {
        width.value = Math.max(320, Math.min(720, Math.round(value)));
      }
    })
  )!;
  cleanups.push(() => scope.stop());
  function handle(mode: string) {
    const element = {
      dataset: { aiPanelResize: mode },
      focus: vi.fn(),
      closest: (selector: string): object | null => {
        if (selector === "[data-ai-panel-resize]") return !["move", "control"].includes(mode) ? element : null;
        if (selector === "[data-ai-panel-drag]") return element;
        return mode === "control" ? element : null;
      }
    };
    return element;
  }
  function dispatch(type: string, properties: Record<string, unknown> = {}, mode = "move") {
    const event = Object.assign(new Event(type, { cancelable: true }), {
      button: 0,
      isPrimary: true,
      pointerId: 1,
      clientX: 100,
      clientY: 100,
      ...properties
    });
    Object.defineProperty(event, "target", { value: handle(mode) });
    panel.dispatchEvent(event);
    return event;
  }
  function drag(mode: string, dx: number, dy: number) {
    dispatch("pointerdown", {}, mode);
    dispatch("pointermove", { clientX: 100 + dx, clientY: 100 + dy });
    dispatch("pointerup");
  }
  const rect = () =>
    Object.fromEntries(
      Object.entries(state.style.value).map(([key, value]) => [key, Number.parseFloat(String(value))])
    );
  return { state, size, width, narrow, defaultFloating, panel, scope, dispatch, drag, rect };
}

it("moves without drift, returns to the starting point, and stays within every workspace edge", () => {
  const { state, rect, dispatch, drag } = setup();
  expect(rect()).toEqual({ left: 608, top: 12, width: 380, height: 640 });
  dispatch("pointerdown");
  dispatch("pointermove", { clientX: -300, clientY: 200 });
  dispatch("pointermove", { clientX: -300, clientY: 200 });
  expect(rect()).toEqual({ left: 208, top: 112, width: 380, height: 640 });
  dispatch("pointermove");
  expect(rect()).toEqual({ left: 608, top: 12, width: 380, height: 640 });
  dispatch("pointerup");
  drag("move", -2000, -2000);
  expect(rect()).toMatchObject({ left: 12, top: 12 });
  drag("move", 2000, 2000);
  expect(rect()).toMatchObject({ left: 608, top: 148 });
  expect(state.interacting.value).toBe(false);
});

it.each([
  ["n", { left: 208, top: 152, width: 360, height: 400 }],
  ["s", { left: 208, top: 112, width: 360, height: 480 }],
  ["w", { left: 248, top: 112, width: 320, height: 440 }],
  ["e", { left: 208, top: 112, width: 400, height: 440 }],
  ["nw", { left: 248, top: 152, width: 320, height: 400 }],
  ["ne", { left: 208, top: 152, width: 400, height: 400 }],
  ["sw", { left: 248, top: 112, width: 320, height: 480 }],
  ["se", { left: 208, top: 112, width: 400, height: 480 }]
])("resizes the %s handle while anchoring the opposite edges", (edge, expected) => {
  const { drag, rect } = setup();
  drag("move", -400, 100);
  drag("se", -20, -200);
  drag(edge as string, 40, 40);
  expect(rect()).toEqual(expected);
});

it("enforces minimum and maximum sizes without moving the opposite corner", () => {
  const { drag, rect } = setup();
  drag("sw", 2000, -2000);
  expect(rect()).toEqual({ left: 668, top: 12, width: 320, height: 280 });
  drag("sw", -2000, 2000);
  expect(rect()).toEqual({ left: 268, top: 12, width: 720, height: 776 });
  drag("move", -100, 0);
  expect(rect()).toMatchObject({ left: 168, height: 776 });
  drag("nw", -2000, -2000);
  expect(rect()).toEqual({ left: 168, top: 12, width: 720, height: 776 });
});

it("keeps docked width resizing and detaches only when the title actually moves", () => {
  const { state, width, dispatch, drag, rect } = setup(false);
  dispatch("pointerdown");
  dispatch("pointermove");
  dispatch("pointerup");
  expect(state.floating.value).toBe(false);
  drag("w", -100, 0);
  expect(width.value).toBe(480);
  expect(state.floating.value).toBe(false);
  drag("move", -100, 100);
  expect(state.floating.value).toBe(true);
  expect(rect()).toEqual({ left: 408, top: 112, width: 480, height: 640 });
  dispatch("dblclick");
  expect(state.floating.value).toBe(false);
  expect(width.value).toBe(380);
});

it("reclamps on workspace resize and preserves the desktop layout across hidden and narrow states", async () => {
  const { size, narrow, state, rect, drag, dispatch } = setup();
  drag("move", -400, 100);
  const original = rect();
  size.width.value = 260;
  size.height.value = 240;
  expect(rect()).toEqual({ left: 12, top: 12, width: 236, height: 216 });
  size.width.value = 0;
  size.height.value = 0;
  narrow.value = true;
  await nextTick();
  expect(dispatch("pointerdown").defaultPrevented).toBe(false);
  expect(state.style.value.right).toBe("12px");
  size.width.value = 1000;
  size.height.value = 800;
  narrow.value = false;
  await nextTick();
  expect(rect()).toEqual(original);
});

it("ignores controls, secondary pointers, non-primary buttons and unrelated keys", () => {
  const { dispatch, state } = setup();
  expect(dispatch("pointerdown", {}, "control").defaultPrevented).toBe(false);
  dispatch("pointerdown", { button: 2 });
  dispatch("pointerdown", { isPrimary: false });
  expect(state.interacting.value).toBe(false);
  expect(dispatch("keydown", { key: "ArrowLeft" }, "control").defaultPrevented).toBe(false);
  expect(dispatch("keydown", { key: "Tab" }).defaultPrevented).toBe(false);
  expect(dispatch("keydown", { key: "ArrowLeft", altKey: true }).defaultPrevented).toBe(false);
  dispatch("pointerdown");
  dispatch("pointermove", { pointerId: 2, clientX: 50 });
  dispatch("pointerup", { pointerId: 2 });
  expect(state.style.value.left).toBe("608px");
  expect(state.interacting.value).toBe(true);
});

it.each(["pointerup", "pointercancel", "lostpointercapture"])("releases the active pointer on %s", (event) => {
  const { dispatch, panel, state } = setup();
  dispatch("pointerdown");
  dispatch(event);
  dispatch("pointermove", { clientX: -200 });
  expect(state.interacting.value).toBe(false);
  expect(panel.releasePointerCapture).toHaveBeenCalledOnce();
  expect(state.style.value.left).toBe("608px");
});

it("stops on deactivation, breakpoint changes and disposal without discarding the position", async () => {
  const { dispatch, state, rect, narrow, panel, scope } = setup();
  dispatch("pointerdown");
  dispatch("pointermove", { clientX: -200 });
  const original = rect();
  state.stop();
  expect(rect()).toEqual(original);
  dispatch("pointerdown");
  narrow.value = true;
  await nextTick();
  expect(state.interacting.value).toBe(false);
  narrow.value = false;
  await nextTick();
  dispatch("pointerdown");
  scope.stop();
  dispatch("pointerdown");
  expect(state.interacting.value).toBe(false);
  expect(panel.setPointerCapture).toHaveBeenCalledTimes(3);
  expect(panel.releasePointerCapture).toHaveBeenCalledTimes(3);
});

it("supports keyboard movement, resizing, and Home to restore the original layout", () => {
  const { dispatch, rect } = setup();
  dispatch("keydown", { key: "ArrowLeft", shiftKey: true });
  dispatch("keydown", { key: "ArrowDown" });
  expect(rect()).toMatchObject({ left: 576, top: 20 });
  dispatch("keydown", { key: "ArrowLeft" }, "w");
  dispatch("keydown", { key: "ArrowUp", shiftKey: true }, "s");
  expect(rect()).toEqual({ left: 568, top: 20, width: 388, height: 608 });
  dispatch("keydown", { key: "Home" });
  expect(rect()).toEqual({ left: 608, top: 12, width: 380, height: 640 });
});
