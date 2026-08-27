import { expect, it, vi } from "vitest";

import {
  hasKokoTerminalDataSender,
  registerKokoTerminalDataSender,
  sendKokoTerminalData,
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
