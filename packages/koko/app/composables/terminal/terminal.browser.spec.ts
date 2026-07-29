import { MESSAGE_TYPE } from "@jumpserver/connectors-core";

import { afterEach, expect, it, vi } from "vitest";

import { parseTerminalIncomingMessage } from "./protocol";
import { useKokoTerminalMessageHandler } from "./useTerminalMessageHandler";
import { saveZmodemPacketsToDisk, sendZmodemFiles } from "./zmodemBrowser";

it("parses terminal wire messages only when they match the protocol", () => {
  expect(parseTerminalIncomingMessage({ id: "terminal-1", type: MESSAGE_TYPE.CONNECT, data: "{}" })).toEqual({
    id: "terminal-1",
    type: MESSAGE_TYPE.CONNECT,
    data: "{}",
    err: undefined,
    raw: undefined
  });
  expect(parseTerminalIncomingMessage({ id: "terminal-1", type: "UNKNOWN" })).toBeNull();
  expect(parseTerminalIncomingMessage({ type: MESSAGE_TYPE.CONNECT })).toBeNull();
});

it("dispatches parsed terminal messages and ignores malformed payloads", () => {
  const received: string[] = [];
  const handler = useKokoTerminalMessageHandler({
    [MESSAGE_TYPE.CONNECT]: (message) => received.push(message.id)
  });

  handler.handleRawMessage(JSON.stringify({ id: "terminal-1", type: MESSAGE_TYPE.CONNECT }));
  handler.handleRawMessage("not-json");

  expect(received).toEqual(["terminal-1"]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

it("sends zmodem files through the local browser adapter", async () => {
  const sent: Uint8Array[] = [];
  const offered = vi.fn(async () => ({
    get_details: () => ({ name: "hello.txt", size: 5 }),
    get_offset: () => sent.reduce((total, chunk) => total + chunk.length, 0),
    on: vi.fn(() => undefined) as never,
    send: (payload: Uint8Array) => sent.push(payload),
    end: async (payload?: Uint8Array) => {
      if (payload) sent.push(payload);
    },
    accept: async () => [],
    skip: () => undefined
  }));

  await sendZmodemFiles(
    {
      type: "send",
      abort: () => undefined,
      aborted: () => false,
      has_ended: () => false,
      on: () => undefined as never,
      send_offer: offered
    },
    [new File(["hello"], "hello.txt")]
  );

  expect(offered).toHaveBeenCalledTimes(1);
  expect(new TextDecoder().decode(sent[0])).toBe("hello");
});

it("saves downloaded packets through a temporary anchor element", () => {
  const appendSpy = vi.spyOn(document.body, "appendChild");
  const removeSpy = vi.spyOn(document.body, "removeChild");
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

  saveZmodemPacketsToDisk([new Uint8Array([1, 2, 3])], "packet.bin");

  expect(click).toHaveBeenCalledTimes(1);
  expect(appendSpy).toHaveBeenCalledTimes(1);
  expect(removeSpy).toHaveBeenCalledTimes(1);
});
