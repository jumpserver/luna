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

function setup() {
  const size = { width: shallowRef(1000), height: shallowRef(800), stop: vi.fn() };
  vi.mocked(useElementSize).mockReturnValue(size);
  const width = shallowRef(380);
  const narrow = shallowRef(false);
  const captured = new Set<number>();
  const panel = Object.assign(new EventTarget(), {
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
  return { state, size, width, narrow, panel, scope, dispatch, drag, rect };
}

it("fills the right side with 6px top and right gaps and no bottom gap", () => {
  const { size, width, rect } = setup();
  expect(rect()).toEqual({ left: 614, top: 6, width: 380, height: 794 });
  size.width.value = 1440;
  size.height.value = 1000;
  width.value = 480;
  expect(rect()).toEqual({ left: 954, top: 6, width: 480, height: 994 });
  size.width.value = 260;
  size.height.value = 240;
  expect(rect()).toEqual({ left: 6, top: 6, width: 248, height: 234 });
  size.width.value = 0;
  size.height.value = 0;
  expect(rect()).toEqual({ left: 6, top: 6, width: 0, height: 0 });
  size.width.value = 1000;
  size.height.value = 800;
  expect(rect()).toEqual({ left: 514, top: 6, width: 480, height: 794 });
});

it("fills the height on narrow screens while leaving room for the backdrop", () => {
  const { narrow, state, dispatch } = setup();
  narrow.value = true;
  expect(state.style.value).toEqual({
    bottom: "0px",
    right: "6px",
    width: "min(380px, calc(100% - 3rem))",
    height: "calc(100% - 6px)"
  });
  expect(dispatch("pointerdown").defaultPrevented).toBe(false);
});

it("moves without drift, returns to the starting point, and stays within every workspace edge", () => {
  const { state, rect, dispatch, drag } = setup();
  drag("s", 0, -154);
  drag("move", 0, 154);
  expect(rect()).toEqual({ left: 614, top: 160, width: 380, height: 640 });
  dispatch("pointerdown");
  dispatch("pointermove", { clientX: -300, clientY: 64 });
  dispatch("pointermove", { clientX: -300, clientY: 64 });
  expect(rect()).toEqual({ left: 214, top: 124, width: 380, height: 640 });
  dispatch("pointermove");
  expect(rect()).toEqual({ left: 614, top: 160, width: 380, height: 640 });
  dispatch("pointerup");
  drag("move", -2000, -2000);
  expect(rect()).toMatchObject({ left: 6, top: 6 });
  drag("move", 2000, 2000);
  expect(rect()).toMatchObject({ left: 614, top: 160 });
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
  drag("se", -20, -354);
  drag("move", -406, 106);
  drag(edge as string, 40, 40);
  expect(rect()).toEqual(expected);
});

it("enforces minimum and maximum sizes without moving the opposite corner", () => {
  const { drag, rect } = setup();
  drag("move", 0, -2000);
  drag("sw", 2000, -2000);
  expect(rect()).toEqual({ left: 674, top: 6, width: 320, height: 280 });
  drag("sw", -2000, 2000);
  expect(rect()).toEqual({ left: 274, top: 6, width: 720, height: 794 });
  drag("move", -100, 0);
  expect(rect()).toMatchObject({ left: 174, height: 794 });
  drag("nw", -2000, -2000);
  expect(rect()).toEqual({ left: 174, top: 6, width: 720, height: 794 });
});

it("keeps the default anchor on a title click and restores it on double click after dragging", () => {
  const { size, width, dispatch, drag, rect } = setup();
  dispatch("pointerdown");
  dispatch("pointermove");
  dispatch("pointerup");
  size.height.value = 900;
  expect(rect()).toEqual({ left: 614, top: 6, width: 380, height: 894 });
  drag("w", -100, 0);
  expect(width.value).toBe(480);
  drag("move", -100, -100);
  expect(rect()).toEqual({ left: 414, top: 6, width: 480, height: 894 });
  dispatch("dblclick");
  expect(width.value).toBe(380);
  expect(rect()).toEqual({ left: 614, top: 6, width: 380, height: 894 });
});

it("keeps filling the workspace after resizing only the width", () => {
  const { drag, rect, size } = setup();
  drag("w", -100, 0);
  size.width.value = 1200;
  size.height.value = 900;
  expect(rect()).toEqual({ left: 714, top: 6, width: 480, height: 894 });
});

it("reclamps on workspace resize and preserves the desktop layout across hidden and narrow states", async () => {
  const { size, narrow, state, rect, drag, dispatch } = setup();
  drag("move", -400, -36);
  const original = rect();
  size.width.value = 260;
  size.height.value = 240;
  expect(rect()).toEqual({ left: 6, top: 6, width: 248, height: 234 });
  size.width.value = 0;
  size.height.value = 0;
  narrow.value = true;
  await nextTick();
  expect(dispatch("pointerdown").defaultPrevented).toBe(false);
  expect(state.style.value.right).toBe("6px");
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
  expect(state.style.value.left).toBe("614px");
  expect(state.interacting.value).toBe(true);
});

it.each(["pointerup", "pointercancel", "lostpointercapture"])("releases the active pointer on %s", (event) => {
  const { dispatch, panel, state } = setup();
  dispatch("pointerdown");
  dispatch(event);
  dispatch("pointermove", { clientX: -200 });
  expect(state.interacting.value).toBe(false);
  expect(panel.releasePointerCapture).toHaveBeenCalledOnce();
  expect(state.style.value.left).toBe("614px");
});

it("clears the dragged position on close and reopens at full height with the preferred width", () => {
  const { dispatch, drag, state, rect, size, width, panel } = setup();
  drag("w", -100, 0);
  dispatch("pointerdown");
  dispatch("pointermove", { clientX: -200, clientY: 0 });
  expect(rect()).toEqual({ left: 214, top: 6, width: 480, height: 794 });

  state.resetPosition();
  expect(state.interacting.value).toBe(false);
  expect(panel.hasPointerCapture(1)).toBe(false);
  expect(width.value).toBe(480);
  expect(rect()).toEqual({ left: 514, top: 6, width: 480, height: 794 });

  size.width.value = 1200;
  size.height.value = 900;
  dispatch("pointermove", { clientX: -500 });
  expect(rect()).toEqual({ left: 714, top: 6, width: 480, height: 894 });
});

it("stops on cancellation, breakpoint changes and disposal without discarding the position", async () => {
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
  dispatch("keydown", { key: "ArrowUp" });
  expect(rect()).toMatchObject({ left: 582, top: 6 });
  dispatch("keydown", { key: "ArrowLeft" }, "w");
  dispatch("keydown", { key: "ArrowUp", shiftKey: true }, "s");
  expect(rect()).toEqual({ left: 574, top: 6, width: 388, height: 762 });
  dispatch("keydown", { key: "Home" });
  expect(rect()).toEqual({ left: 614, top: 6, width: 380, height: 794 });
});
