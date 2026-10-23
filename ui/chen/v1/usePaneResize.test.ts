import { afterEach, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import { usePaneResize } from "./usePaneResize";

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

function setup(axis: "x" | "y" = "x") {
  const value = ref(axis === "x" ? 300 : 60);
  const min = ref(axis === "x" ? 220 : 20);
  const max = ref(axis === "x" ? 700 : 80);
  const enabled = ref(true);
  let pixelsPerUnit = axis === "x" ? 1 : 5;
  const body = { style: { cursor: "crosshair", userSelect: "text" } };
  const window = new EventTarget();
  const captures = new Set<number>();
  const handle = Object.assign(new EventTarget(), {
    ownerDocument: { body, defaultView: window },
    focus: vi.fn(),
    setPointerCapture: vi.fn((id: number) => captures.add(id)),
    hasPointerCapture: (id: number) => captures.has(id),
    releasePointerCapture: vi.fn((id: number) => captures.delete(id))
  });
  const scope = effectScope();
  const state = scope.run(() =>
    usePaneResize({
      axis,
      value,
      min,
      max,
      enabled,
      defaultValue: value.value,
      step: axis === "x" ? 16 : 2,
      pixelsPerUnit: () => pixelsPerUnit
    })
  )!;
  for (const [name, listener] of [
    ["pointerdown", state.begin],
    ["pointermove", state.move],
    ["pointerup", state.end],
    ["pointercancel", state.end],
    ["lostpointercapture", state.end],
    ["keydown", state.keydown]
  ] as const) {
    handle.addEventListener(name, listener as EventListener);
  }
  cleanups.push(() => scope.stop());
  function dispatch(type: string, properties: Record<string, unknown> = {}) {
    const event = Object.assign(new Event(type, { cancelable: true }), {
      button: 0,
      isPrimary: true,
      pointerId: 1,
      clientX: 100,
      clientY: 100,
      ...properties
    });
    handle.dispatchEvent(event);
    return event;
  }
  return {
    value,
    min,
    max,
    enabled,
    body,
    window,
    handle,
    scope,
    state,
    dispatch,
    scale: (v: number) => (pixelsPerUnit = v)
  };
}

it("drags from the starting width without drift and clamps to current bounds", () => {
  const { value, max, handle, state, dispatch } = setup();
  dispatch("pointerdown");
  expect(handle.setPointerCapture).toHaveBeenCalledWith(1);
  expect(handle.focus).toHaveBeenCalledWith({ preventScroll: true });
  dispatch("pointermove", { clientX: 150 });
  dispatch("pointermove", { clientX: 200 });
  expect(value.value).toBe(400);
  dispatch("pointermove", { clientX: 2000 });
  expect(value.value).toBe(700);
  max.value = 450;
  dispatch("pointermove", { clientX: 2000 });
  expect(value.value).toBe(450);
  dispatch("pointermove", { clientX: -2000 });
  expect(value.value).toBe(220);
  dispatch("pointerup");
  expect(state.dragging.value).toBe(false);
});

it("converts vertical pointer distance into percentages without using the horizontal coordinate", () => {
  const { value, dispatch, scale } = setup("y");
  dispatch("pointerdown");
  dispatch("pointermove", { clientX: 800, clientY: 125 });
  expect(value.value).toBe(65);
  scale(10);
  dispatch("pointermove", { clientY: 200 });
  expect(value.value).toBe(70);
});

it("ignores secondary buttons, non-primary and unrelated pointers, and a second drag", () => {
  const { value, handle, state, dispatch } = setup();
  expect(dispatch("pointerdown", { button: 2 }).defaultPrevented).toBe(false);
  expect(dispatch("pointerdown", { isPrimary: false }).defaultPrevented).toBe(false);
  dispatch("pointerdown");
  dispatch("pointerdown", { pointerId: 2, clientX: 200 });
  dispatch("pointermove", { pointerId: 2, clientX: 500 });
  dispatch("pointerup", { pointerId: 2 });
  expect(value.value).toBe(300);
  expect(state.dragging.value).toBe(true);
  expect(handle.setPointerCapture).toHaveBeenCalledOnce();
});

it.each(["pointerup", "pointercancel", "lostpointercapture"])(
  "restores existing body styles and releases capture on %s",
  (type) => {
    const { body, handle, value, state, dispatch } = setup();
    dispatch("pointerdown");
    expect(body.style).toEqual({ cursor: "col-resize", userSelect: "none" });
    dispatch(type);
    dispatch("pointermove", { clientX: 600 });
    expect(value.value).toBe(300);
    expect(state.dragging.value).toBe(false);
    expect(body.style).toEqual({ cursor: "crosshair", userSelect: "text" });
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
  }
);

it.each(["blur", "disabled", "dispose"])("cleans up an interrupted drag on %s", (reason) => {
  const { body, window, enabled, handle, scope, state, dispatch } = setup();
  dispatch("pointerdown");
  if (reason === "blur") window.dispatchEvent(new Event("blur"));
  else if (reason === "disabled") enabled.value = false;
  else scope.stop();
  expect(state.dragging.value).toBe(false);
  expect(body.style).toEqual({ cursor: "crosshair", userSelect: "text" });
  expect(handle.releasePointerCapture).toHaveBeenCalledOnce();
  window.dispatchEvent(new Event("blur"));
  expect(handle.releasePointerCapture).toHaveBeenCalledOnce();
});

it("supports axis-aware keys, accelerated steps, bounds, reset and disabled state", () => {
  const { value, min, enabled, state, dispatch } = setup("y");
  dispatch("keydown", { key: "ArrowUp" });
  expect(value.value).toBe(58);
  dispatch("keydown", { key: "ArrowDown", shiftKey: true });
  expect(value.value).toBe(66);
  expect(dispatch("keydown", { key: "ArrowRight" }).defaultPrevented).toBe(false);
  expect(dispatch("keydown", { key: "ArrowDown", metaKey: true }).defaultPrevented).toBe(false);
  dispatch("keydown", { key: "Home" });
  expect(value.value).toBe(20);
  dispatch("keydown", { key: "End" });
  expect(value.value).toBe(80);
  dispatch("keydown", { key: "Enter" });
  expect(value.value).toBe(60);
  min.value = 65;
  state.reset();
  expect(value.value).toBe(65);
  enabled.value = false;
  expect(dispatch("keydown", { key: "End" }).defaultPrevented).toBe(false);
  expect(dispatch("pointerdown").defaultPrevented).toBe(false);
  state.reset();
  expect(value.value).toBe(65);
});

it("never writes non-finite values from invalid bounds, scale, coordinates or persisted values", () => {
  const { value, min, max, dispatch, state, scale } = setup();
  scale(0);
  dispatch("pointerdown");
  expect(state.dragging.value).toBe(false);
  scale(1);
  min.value = Number.NaN;
  dispatch("keydown", { key: "Home" });
  state.reset();
  expect(value.value).toBe(300);
  min.value = 800;
  dispatch("pointerdown");
  expect(state.dragging.value).toBe(false);
  min.value = 220;
  value.value = Number.NaN;
  dispatch("keydown", { key: "ArrowRight" });
  expect(value.value).toBe(316);
  dispatch("pointerdown");
  dispatch("pointermove", { clientX: Number.NaN });
  scale(Number.POSITIVE_INFINITY);
  dispatch("pointermove", { clientX: 200 });
  expect(value.value).toBe(316);
  max.value = Number.POSITIVE_INFINITY;
  scale(1);
  dispatch("pointermove", { clientX: 200 });
  expect(value.value).toBe(316);
});
