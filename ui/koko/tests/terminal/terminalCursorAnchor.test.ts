import type { Terminal } from "@xterm/xterm";
import { expect, it, vi } from "vitest";
import {
  registerKokoTerminalSession,
  subscribeKokoTerminalCursorAnchor,
  subscribeKokoTerminalUserInput,
  unregisterKokoTerminalSession
} from "#koko/composables/useTerminalSessionRegistry";
import type { TerminalCursorAnchor } from "#koko/composables/useTerminalSessionRegistry";

function flushCursorAnchor() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

it("tracks the Xterm buffer cursor for the inline Terminal AI hint", async () => {
  let cursorListener = () => {};
  let scrollListener = () => {};
  let bufferListener = () => {};
  const cursorDisposable = { dispose: vi.fn() };
  const resizeDisposable = { dispose: vi.fn() };
  const scrollDisposable = { dispose: vi.fn() };
  const bufferDisposable = { dispose: vi.fn() };
  const screen = {
    getBoundingClientRect: () => ({ left: 100, top: 200, width: 800, height: 400 })
  };
  const activeBuffer = { type: "normal", cursorX: 2, cursorY: 3, baseY: 40, viewportY: 40 };
  const terminal = {
    cols: 80,
    rows: 20,
    buffer: {
      active: activeBuffer,
      onBufferChange: vi.fn((listener: () => void) => {
        bufferListener = listener;
        return bufferDisposable;
      })
    },
    element: { querySelector: () => screen },
    onCursorMove: vi.fn((listener: () => void) => {
      cursorListener = listener;
      return cursorDisposable;
    }),
    onResize: vi.fn(() => resizeDisposable),
    onScroll: vi.fn((listener: () => void) => {
      scrollListener = listener;
      return scrollDisposable;
    })
  } as unknown as Terminal;
  const anchors: Array<TerminalCursorAnchor | null> = [];

  registerKokoTerminalSession("cursor-pane", {
    socket: { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket,
    terminalId: "7",
    terminal
  });
  const unsubscribe = subscribeKokoTerminalCursorAnchor("cursor-pane", (anchor) => anchors.push(anchor));

  expect(anchors.at(-1)).toEqual({ left: 120, top: 260, width: 10, height: 20, bufferType: "normal" });
  expect(anchors).toHaveLength(1);

  activeBuffer.viewportY = 35;
  scrollListener();
  await flushCursorAnchor();
  expect(anchors.at(-1)).toEqual({ left: 120, top: 360, width: 10, height: 20, bufferType: "normal" });

  activeBuffer.viewportY = 20;
  scrollListener();
  await flushCursorAnchor();
  expect(anchors.at(-1)).toBeNull();

  activeBuffer.viewportY = 40;

  activeBuffer.cursorX = 4;
  activeBuffer.cursorY = 5;
  cursorListener();
  cursorListener();
  expect(anchors).toHaveLength(3);

  await flushCursorAnchor();
  expect(anchors).toHaveLength(4);
  expect(anchors.at(-1)).toEqual({ left: 140, top: 300, width: 10, height: 20, bufferType: "normal" });

  cursorListener();
  await flushCursorAnchor();
  expect(anchors).toHaveLength(4);

  // Buffer switches must notify even when the cursor geometry stays unchanged.
  activeBuffer.type = "alternate";
  bufferListener();
  await flushCursorAnchor();
  expect(anchors).toHaveLength(5);
  expect(anchors.at(-1)?.bufferType).toBe("alternate");
  activeBuffer.type = "normal";
  bufferListener();
  await flushCursorAnchor();
  expect(anchors).toHaveLength(6);
  expect(anchors.at(-1)?.bufferType).toBe("normal");

  unsubscribe();
  unregisterKokoTerminalSession("cursor-pane");
  expect(cursorDisposable.dispose).toHaveBeenCalled();
  expect(resizeDisposable.dispose).toHaveBeenCalled();
  expect(scrollDisposable.dispose).toHaveBeenCalled();
  expect(bufferDisposable.dispose).toHaveBeenCalled();
});

it("notifies Terminal AI when the user types without intercepting xterm data", () => {
  let dataListener = (_data: string) => {};
  const dataDisposable = { dispose: vi.fn() };
  const terminal = {
    cols: 80,
    rows: 20,
    buffer: { active: { cursorX: 0, cursorY: 0 } },
    element: { querySelector: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 400 }) }) },
    onCursorMove: vi.fn(() => ({ dispose: vi.fn() })),
    onResize: vi.fn(() => ({ dispose: vi.fn() })),
    onData: vi.fn((listener: (data: string) => void) => {
      dataListener = listener;
      return dataDisposable;
    })
  } as unknown as Terminal;
  const typed: string[] = [];

  registerKokoTerminalSession("input-pane", {
    socket: { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket,
    terminalId: "8",
    terminal
  });
  const unsubscribe = subscribeKokoTerminalUserInput("input-pane", () => typed.push("l"));

  dataListener("l");
  expect(typed).toEqual(["l"]);

  unsubscribe();
  unregisterKokoTerminalSession("input-pane");
  expect(dataDisposable.dispose).toHaveBeenCalled();
});
