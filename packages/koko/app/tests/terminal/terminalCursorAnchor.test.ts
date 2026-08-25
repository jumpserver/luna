import { expect, it, vi } from "vitest";
import type { Terminal } from "@xterm/xterm";
import {
  registerKokoTerminalSession,
  subscribeKokoTerminalCursorAnchor,
  unregisterKokoTerminalSession
} from "#koko/composables/useTerminalSessionRegistry";

it("tracks the Xterm buffer cursor for the inline Terminal AI hint", () => {
  let cursorListener = () => {};
  const cursorDisposable = { dispose: vi.fn() };
  const resizeDisposable = { dispose: vi.fn() };
  const renderDisposable = { dispose: vi.fn() };
  const screen = {
    getBoundingClientRect: () => ({ left: 100, top: 200, width: 800, height: 400 })
  };
  const activeBuffer = { cursorX: 2, cursorY: 3 };
  const terminal = {
    cols: 80,
    rows: 20,
    buffer: { active: activeBuffer },
    element: { querySelector: () => screen },
    onCursorMove: vi.fn((listener: () => void) => {
      cursorListener = listener;
      return cursorDisposable;
    }),
    onResize: vi.fn(() => resizeDisposable),
    onRender: vi.fn(() => renderDisposable)
  } as unknown as Terminal;
  const anchors: Array<{ left: number; top: number; width: number; height: number }> = [];

  registerKokoTerminalSession("cursor-pane", {
    socket: { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket,
    terminalId: "7",
    terminal
  });
  const unsubscribe = subscribeKokoTerminalCursorAnchor("cursor-pane", (anchor) => anchors.push(anchor));

  expect(anchors.at(-1)).toEqual({ left: 120, top: 260, width: 10, height: 20 });
  activeBuffer.cursorX = 4;
  activeBuffer.cursorY = 5;
  cursorListener();
  expect(anchors.at(-1)).toEqual({ left: 140, top: 300, width: 10, height: 20 });

  unsubscribe();
  unregisterKokoTerminalSession("cursor-pane");
  expect(cursorDisposable.dispose).toHaveBeenCalled();
  expect(resizeDisposable.dispose).toHaveBeenCalled();
  expect(renderDisposable.dispose).toHaveBeenCalled();
});
