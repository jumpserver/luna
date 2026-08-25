import { expect, it, vi } from "vitest";

import {
  registerKokoTerminalDataSender,
  sendKokoTerminalData,
  unregisterKokoTerminalDataSender
} from "#koko/composables/useTerminalSessionRegistry";

it("routes global virtual keyboard data to a registered workspace terminal", () => {
  const send = vi.fn(() => true);
  registerKokoTerminalDataSender("k8s-pane", send);

  expect(sendKokoTerminalData("k8s-pane", "\x03")).toBe(true);
  expect(send).toHaveBeenCalledWith("\x03");

  unregisterKokoTerminalDataSender("k8s-pane");
  expect(sendKokoTerminalData("k8s-pane", "x")).toBe(false);
});
