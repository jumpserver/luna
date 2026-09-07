import { expect, it, vi } from "vitest";

import {
  getLocalShellTerminalSnapshot,
  hasKokoTerminalDataSender,
  registerLocalShellTerminalSession,
  registerKokoTerminalDataSender,
  sendLocalShellTerminalData,
  sendKokoTerminalData,
  unregisterLocalShellTerminalSession,
  unregisterKokoTerminalDataSender
} from "#koko/composables/useTerminalSessionRegistry";

it("routes global virtual keyboard data to a registered workspace terminal", () => {
  const send = vi.fn(() => true);
  registerKokoTerminalDataSender("k8s-pane", send);

  expect(hasKokoTerminalDataSender("k8s-pane")).toBe(true);
  expect(sendKokoTerminalData("k8s-pane", "\x03")).toBe(true);
  expect(send).toHaveBeenCalledWith("\x03");

  unregisterKokoTerminalDataSender("k8s-pane");
  expect(hasKokoTerminalDataSender("k8s-pane")).toBe(false);
  expect(sendKokoTerminalData("k8s-pane", "x")).toBe(false);
});

it("exposes only a bounded text snapshot and input for a registered Local Shell", () => {
  const send = vi.fn();
  const lines = Array.from({ length: 205 }, (_, index) => `line-${index}`);
  const terminal = {
    buffer: {
      active: {
        type: "normal",
        length: lines.length,
        baseY: 200,
        cursorX: 4,
        cursorY: 3,
        getLine: (index: number) => ({ translateToString: () => lines[index] })
      }
    }
  };
  registerLocalShellTerminalSession("local-pane", send, terminal as never);

  expect(getLocalShellTerminalSnapshot("local-pane", 500)).toMatchObject({
    lines: 200,
    truncated: true,
    bufferType: "normal",
    cursor: { column: 4, row: 203 }
  });
  expect(getLocalShellTerminalSnapshot("local-pane", 2)?.text).toBe("line-203\nline-204");
  expect(sendLocalShellTerminalData("local-pane", "pwd\r")).toBe(true);
  expect(send).toHaveBeenCalledWith("pwd\r");

  unregisterLocalShellTerminalSession("local-pane");
  expect(getLocalShellTerminalSnapshot("local-pane")).toBeNull();
  expect(sendLocalShellTerminalData("local-pane", "pwd\r")).toBe(false);
});
