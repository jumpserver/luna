import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { useTerminalAiHudLayout } from "./useTerminalAiHudLayout";

const terminal = vi.hoisted(() => ({
  anchor: { left: 140, top: 100, width: 8, height: 18 },
  element: null as HTMLElement | null
}));
vi.mock("#koko", () => ({
  getKokoTerminalCursorAnchor: () => terminal.anchor,
  getKokoTerminalElement: () => terminal.element,
  subscribeKokoTerminalCursorAnchor: () => () => {},
  subscribeKokoTerminalUserInput: () => () => {}
}));

const cleanups: Array<() => void> = [];
beforeEach(() => {
  if (typeof window === "undefined") vi.stubGlobal("window", { innerWidth: 1000, innerHeight: 800 });
  else {
    vi.stubGlobal("innerWidth", 1000);
    vi.stubGlobal("innerHeight", 800);
  }
  terminal.anchor = { left: 140, top: 100, width: 8, height: 18 };
});
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
});

async function setup() {
  const area = { left: 100, top: 50, right: 900, bottom: 750, width: 800, height: 700 };
  terminal.element = { getBoundingClientRect: () => area } as HTMLElement;
  const measured = { height: 110, scrollHeight: 110 };
  const captured = new Set<number>();
  const handle = Object.assign(new EventTarget(), {
    closest: () => null,
    focus: vi.fn(),
    setPointerCapture: vi.fn((id: number) => captured.add(id)),
    hasPointerCapture: (id: number) => captured.has(id),
    releasePointerCapture: vi.fn((id: number) => captured.delete(id))
  });
  const open = ref(false);
  const scope = effectScope();
  const layout = scope.run(() =>
    useTerminalAiHudLayout({ paneId: () => "pane", open, sessionInfoReady: () => false })
  )!;
  layout.hostRef.value = { getBoundingClientRect: () => area } as HTMLElement;
  layout.panelRef.value = {
    getBoundingClientRect: () => measured,
    get scrollHeight() {
      return measured.scrollHeight;
    }
  } as unknown as HTMLElement;
  layout.dragHandleRef.value = handle as unknown as HTMLElement;
  cleanups.push(() => {
    layout.dispose();
    scope.stop();
  });
  await layout.reveal(terminal.element);
  await nextTick();

  async function dispatch(type: string, properties: Record<string, unknown> = {}, control = false) {
    const event = Object.assign(new Event(type, { cancelable: true }), {
      button: 0,
      isPrimary: true,
      pointerId: 1,
      clientX: 160,
      clientY: 140,
      ...properties
    });
    if (control) Object.defineProperty(event, "target", { value: { closest: () => ({}) } });
    handle.dispatchEvent(event);
    await nextTick();
    return event;
  }
  const position = () => ({ left: layout.panelStyle.value.left, top: layout.panelStyle.value.top });
  return { area, measured, handle, open, layout, dispatch, position };
}

it("moves from the original pointer position without drift and stays moved when the cursor or content changes", async () => {
  const { layout, measured, dispatch, position } = await setup();
  expect(position()).toEqual({ left: "140px", top: "126px" });
  await dispatch("pointerdown");
  await dispatch("pointermove", { clientX: 260, clientY: 240 });
  expect(position()).toEqual({ left: "240px", top: "226px" });
  await dispatch("pointermove", { clientX: 260, clientY: 240 });
  expect(position()).toEqual({ left: "240px", top: "226px" });
  await dispatch("pointermove");
  expect(position()).toEqual({ left: "140px", top: "126px" });
  await dispatch("pointermove", { clientX: 260, clientY: 240 });
  await dispatch("pointerup");
  terminal.anchor.top = 500;
  measured.height = measured.scrollHeight = 250;
  await layout.positionPanel();
  expect(position()).toEqual({ left: "240px", top: "226px" });
  expect(layout.panelStyle.value.height).toBeUndefined();
});

it("clamps movement and a taller composer to the visible workspace, including a narrow viewport", async () => {
  const { layout, measured, dispatch, position } = await setup();
  await dispatch("pointerdown");
  await dispatch("pointermove", { clientX: -2000, clientY: -2000 });
  expect(position()).toEqual({ left: "108px", top: "58px" });
  await dispatch("pointermove", { clientX: 2000, clientY: 2000 });
  expect(position()).toEqual({ left: "372px", top: "632px" });
  await dispatch("pointerup");
  measured.height = measured.scrollHeight = 300;
  await layout.positionPanel();
  expect(position()).toEqual({ left: "372px", top: "442px" });
  window.innerWidth = 360;
  window.innerHeight = 400;
  await layout.positionPanel();
  expect(position()).toEqual({ left: "108px", top: "92px" });
  expect(layout.panelStyle.value.width).toBe("244px");
});

it("keeps the dragged position when reopened and supports keyboard movement and reset", async () => {
  const { layout, open, dispatch, position } = await setup();
  await dispatch("keydown", { key: "ArrowRight", shiftKey: true });
  await dispatch("keydown", { key: "ArrowDown" });
  expect(position()).toEqual({ left: "172px", top: "134px" });
  open.value = false;
  await nextTick();
  await layout.reveal(terminal.element!);
  expect(position()).toEqual({ left: "172px", top: "134px" });
  await dispatch("keydown", { key: "Home" });
  expect(position()).toEqual({ left: "140px", top: "126px" });
  await dispatch("keydown", { key: "ArrowDown" });
  await dispatch("dblclick");
  expect(position()).toEqual({ left: "140px", top: "126px" });
});

it("does not drag controls, react to another pointer, or capture secondary buttons", async () => {
  const { layout, dispatch, position } = await setup();
  expect((await dispatch("pointerdown", {}, true)).defaultPrevented).toBe(false);
  await dispatch("pointerdown", { button: 2 });
  await dispatch("pointerdown", { isPrimary: false });
  expect(layout.dragging.value).toBe(false);
  await dispatch("pointerdown");
  await dispatch("pointermove", { pointerId: 2, clientX: 500 });
  await dispatch("pointerup", { pointerId: 2 });
  expect(layout.dragging.value).toBe(true);
  expect(position()).toEqual({ left: "140px", top: "126px" });
});

it.each(["pointerup", "pointercancel", "lostpointercapture", "close", "dispose"])(
  "releases capture and stops moving on %s",
  async (action) => {
    const { layout, open, handle, dispatch, position } = await setup();
    await dispatch("pointerdown");
    if (action === "close") open.value = false;
    else if (action === "dispose") layout.dispose();
    else await dispatch(action);
    await nextTick();
    await dispatch("pointermove", { clientX: 500 });
    expect(layout.dragging.value).toBe(false);
    expect(handle.releasePointerCapture).toHaveBeenCalledOnce();
    expect(position()).toEqual({ left: "140px", top: "126px" });
  }
);
