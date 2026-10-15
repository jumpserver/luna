import { useResizeObserver } from "@vueuse/core";
import { afterEach, expect, it, vi } from "vitest";
import { effectScope, shallowRef } from "vue";
import { useConnectionSetupDrag } from "./useConnectionSetupDrag";

vi.mock("@vueuse/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vueuse/core")>()),
  useResizeObserver: vi.fn()
}));

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.clearAllMocks();
});

function setup() {
  const area = { clientWidth: 1000, clientHeight: 800 };
  const panel = { offsetLeft: 200, offsetTop: 150, offsetWidth: 600, offsetHeight: 500 };
  const captured = new Set<number>();
  const handle = Object.assign(new EventTarget(), {
    focus: vi.fn(),
    closest: vi.fn((): object | null => null),
    setPointerCapture: vi.fn((id: number) => captured.add(id)),
    hasPointerCapture: (id: number) => captured.has(id),
    releasePointerCapture: vi.fn((id: number) => captured.delete(id))
  });
  const handleRef = shallowRef(handle as unknown as HTMLElement | null);
  const scope = effectScope();
  const state = scope.run(() =>
    useConnectionSetupDrag(shallowRef(area as HTMLElement), shallowRef(panel as HTMLElement), handleRef)
  )!;
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
  const resize = () =>
    vi
      .mocked(useResizeObserver)
      .mock.calls.at(-1)![1]([], {} as ResizeObserver);
  return { area, panel, handle, handleRef, state, dispatch, resize, scope };
}

it("moves from the current position without a jump and clamps all four edges", () => {
  const { state, dispatch } = setup();
  dispatch("pointerdown");
  dispatch("pointermove", { clientX: 140, clientY: 130 });
  expect(state.style.value.translate).toBe("40px 30px");
  dispatch("pointerup");
  dispatch("pointerdown");
  dispatch("pointermove", { clientX: 110, clientY: 120 });
  expect(state.style.value.translate).toBe("50px 50px");
  dispatch("pointermove", { clientX: 2000, clientY: 2000 });
  expect(state.style.value.translate).toBe("200px 150px");
  dispatch("pointermove", { clientX: -2000, clientY: -2000 });
  expect(state.style.value.translate).toBe("-200px -150px");
});

it("ignores controls, secondary buttons, secondary pointers and unrelated pointer events", () => {
  const { state, handle, dispatch } = setup();
  handle.closest.mockReturnValue({});
  expect(dispatch("pointerdown").defaultPrevented).toBe(false);
  handle.closest.mockReturnValue(null);
  dispatch("pointerdown", { button: 2 });
  dispatch("pointerdown", { isPrimary: false });
  expect(state.isDragging.value).toBe(false);
  dispatch("pointerdown");
  dispatch("pointermove", { pointerId: 2, clientX: 200 });
  dispatch("pointerup", { pointerId: 2 });
  expect(state.style.value.translate).toBe("0px 0px");
  expect(state.isDragging.value).toBe(true);
});

it.each(["pointerup", "pointercancel", "lostpointercapture"])("ends dragging on %s", (event) => {
  const { state, handle, dispatch } = setup();
  dispatch("pointerdown");
  dispatch(event);
  dispatch("pointermove", { clientX: 200 });
  expect(state.isDragging.value).toBe(false);
  expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
  expect(state.style.value.translate).toBe("0px 0px");
});

it("releases capture and removes listeners when the dialog unmounts", () => {
  const { state, handle, dispatch, scope } = setup();
  dispatch("pointerdown");
  scope.stop();
  dispatch("pointerdown");
  expect(state.isDragging.value).toBe(false);
  expect(handle.setPointerCapture).toHaveBeenCalledOnce();
  expect(handle.releasePointerCapture).toHaveBeenCalledOnce();
});

it("releases an active drag when a compact layout removes the handle", () => {
  const { handle, handleRef, state, dispatch } = setup();
  dispatch("pointerdown");
  expect(state.isDragging.value).toBe(true);
  handleRef.value = null;
  expect(state.isDragging.value).toBe(false);
  expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
});

it("keeps the dialog in bounds after resizing or expanding while preserving hidden tab positions", () => {
  const { area, panel, state, dispatch, resize } = setup();
  dispatch("pointerdown");
  dispatch("pointermove", { clientX: 2000, clientY: 2000 });
  dispatch("pointerup");
  area.clientWidth = 0;
  resize();
  expect(state.style.value.translate).toBe("200px 150px");
  Object.assign(area, { clientWidth: 700, clientHeight: 650 });
  Object.assign(panel, { offsetLeft: 50, offsetTop: 0, offsetHeight: 650 });
  resize();
  expect(state.style.value.translate).toBe("50px 0px");
});

it("supports keyboard movement and Home to center without capturing unrelated keys", () => {
  const { state, dispatch } = setup();
  dispatch("keydown", { key: "ArrowRight" });
  dispatch("keydown", { key: "ArrowDown", shiftKey: true });
  expect(state.style.value.translate).toBe("8px 32px");
  dispatch("keydown", { key: "Home" });
  expect(state.style.value.translate).toBe("0px 0px");
  expect(dispatch("keydown", { key: "Tab" }).defaultPrevented).toBe(false);
  expect(dispatch("keydown", { key: "ArrowRight", altKey: true }).defaultPrevented).toBe(false);
});
