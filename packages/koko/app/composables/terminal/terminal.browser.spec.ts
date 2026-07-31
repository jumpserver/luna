import { MESSAGE_TYPE } from "@jumpserver/connectors-core";
import { afterEach, expect, it, vi } from "vitest";
import { computed } from "vue";

import {
  buildJSONEnvelope,
  buildTerminalInput,
  ENVELOPE_CHAT,
  ENVELOPE_TERMINAL_COMMAND,
  parseEnvelope,
  parseJSONPayload,
  parseTerminalPayload
} from "./envelope";
import { parseTerminalIncomingMessage } from "./protocol";
import {
  getKokoTerminalAiSession,
  handleKokoTerminalAiMessage,
  isKokoTerminalAiInputLocked,
  registerKokoTerminalAiSession,
  sendKokoTerminalAiControl,
  unregisterKokoTerminalAiSession
} from "./useTerminalAiSessions";
import { useKokoTerminalMessageHandler } from "./useTerminalMessageHandler";
import { saveZmodemPacketsToDisk, sendZmodemFiles } from "./zmodemBrowser";

it("parses terminal wire messages only when they match the protocol", () => {
  expect(parseTerminalIncomingMessage({ id: "terminal-1", type: MESSAGE_TYPE.CONNECT, data: "{}" })).toMatchObject({
    id: "terminal-1",
    type: MESSAGE_TYPE.CONNECT,
    data: "{}"
  });
  expect(parseTerminalIncomingMessage({ id: "terminal-1", type: "created", terminalId: 7 })).toMatchObject({
    type: "created",
    terminalId: 7
  });
  expect(parseTerminalIncomingMessage({ type: "" })).toBeNull();
  expect(parseTerminalIncomingMessage({})).toBeNull();
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

it("encodes and decodes terminal envelopes", () => {
  const command = buildJSONEnvelope(ENVELOPE_TERMINAL_COMMAND, {
    terminalId: 7,
    command: MESSAGE_TYPE.PING
  });
  const commandEnvelope = parseEnvelope(command);

  expect(commandEnvelope.type).toBe(ENVELOPE_TERMINAL_COMMAND);
  expect(parseJSONPayload(commandEnvelope.payload)).toEqual({
    terminalId: 7,
    command: MESSAGE_TYPE.PING
  });

  const inputEnvelope = parseEnvelope(buildTerminalInput(7, "whoami"));
  expect(parseTerminalPayload(inputEnvelope.payload)).toMatchObject({ terminalId: 7 });
  expect(new TextDecoder().decode(parseTerminalPayload(inputEnvelope.payload).data)).toBe("whoami");
});

it("keeps terminal AI state isolated by active pane", async () => {
  const send = vi.fn();
  const socket = { readyState: WebSocket.OPEN, send } as unknown as WebSocket;
  registerKokoTerminalAiSession("pane-1", socket, "11");
  registerKokoTerminalAiSession("pane-2", socket, "22");

  handleKokoTerminalAiMessage("pane-1", {
    id: "capability-1",
    role: "assistant",
    metadata: { terminalId: 11 },
    parts: [
      {
        type: "data-capability",
        data: { enabled: true, backgroundExec: true, approvalThreshold: 3, executionMode: "auto" }
      }
    ]
  });
  handleKokoTerminalAiMessage("pane-2", {
    id: "lock-2",
    role: "assistant",
    metadata: { terminalId: 22 },
    parts: [{ type: "data-input-lock", data: { locked: true } }]
  });
  handleKokoTerminalAiMessage("pane-1", {
    id: "wrong-terminal",
    role: "assistant",
    metadata: { terminalId: 22 },
    parts: [{ type: "text", text: "ignored" }]
  });
  handleKokoTerminalAiMessage("pane-1", null);
  handleKokoTerminalAiMessage("pane-1", {
    id: "malformed",
    role: "assistant",
    parts: [null]
  });

  expect(getKokoTerminalAiSession("pane-1")).toMatchObject({
    enabled: true,
    backgroundExec: true,
    approvalThreshold: 3
  });
  expect(getKokoTerminalAiSession("pane-1")?.chat.messages.value).toHaveLength(0);
  expect(isKokoTerminalAiInputLocked("pane-1")).toBe(false);
  expect(isKokoTerminalAiInputLocked("pane-2")).toBe(true);

  const message = {
    id: "question-1",
    role: "user" as const,
    metadata: { terminalId: 11 },
    parts: [{ type: "text" as const, text: "status" }]
  };
  sendKokoTerminalAiControl("pane-1", message);

  const sentEnvelope = parseEnvelope(send.mock.calls[0]![0]);
  expect(sentEnvelope.type).toBe(ENVELOPE_CHAT);
  expect(parseJSONPayload(sentEnvelope.payload)).toEqual(message);

  const session = getKokoTerminalAiSession("pane-1")!;
  const renderedMessages = computed(() => [...session.chat.messages.value]);
  const renderedMessageCount = computed(() => renderedMessages.value.length);
  expect(renderedMessageCount.value).toBe(0);
  const response = session.chat.sendMessage({
    text: "stream status",
    metadata: { terminalId: 11 }
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(parseJSONPayload(parseEnvelope(send.mock.calls[1]![0]).payload)).toMatchObject({
    role: "user",
    metadata: { terminalId: 11 },
    parts: [{ type: "text", text: "stream status" }]
  });
  handleKokoTerminalAiMessage("pane-1", {
    id: "plan-message-1",
    role: "assistant",
    metadata: { terminalId: 11, stage: "process" },
    parts: [
      {
        type: "data-plan",
        data: {
          id: "plan-1",
          summary: "Inspect status",
          steps: [{ id: "step-1", title: "Check", objective: "Read status", status: "pending" }]
        }
      }
    ]
  });
  handleKokoTerminalAiMessage("pane-1", {
    id: "answer-1",
    role: "assistant",
    metadata: { terminalId: 11, stage: "final" },
    parts: [{ type: "text", text: "ready", state: "done" }]
  });
  handleKokoTerminalAiMessage("pane-1", {
    id: "progress-idle",
    role: "assistant",
    metadata: { terminalId: 11 },
    parts: [{ type: "data-progress", data: { state: "idle", text: "" } }]
  });
  await response;

  expect(session.chat.status.value).toBe("ready");
  expect(session.chat.messages.value).toHaveLength(2);
  expect(renderedMessageCount.value).toBe(2);
  expect(session.chat.messages.value[0]).toMatchObject({
    role: "user",
    parts: [{ type: "text", text: "stream status" }]
  });
  expect(session.chat.messages.value[1]).toMatchObject({
    id: "plan-message-1",
    role: "assistant",
    parts: [
      { type: "data-plan", data: { id: "plan-1", summary: "Inspect status" } },
      { type: "text", text: "ready", state: "done" }
    ]
  });

  unregisterKokoTerminalAiSession("pane-1", socket);
  unregisterKokoTerminalAiSession("pane-2", socket);
});

it("keeps an AI capability that arrives before terminal creation", () => {
  const socket = { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket;
  registerKokoTerminalAiSession("pane-early", socket, "");

  handleKokoTerminalAiMessage("pane-early", {
    id: "capability-early",
    role: "assistant",
    metadata: { terminalId: 7 },
    parts: [{ type: "data-capability", data: { enabled: true } }]
  });
  registerKokoTerminalAiSession("pane-early", socket, "7");

  expect(getKokoTerminalAiSession("pane-early")).toMatchObject({
    enabled: true,
    terminalId: "7"
  });

  unregisterKokoTerminalAiSession("pane-early", socket);
});

it("surfaces Terminal AI stream failures through the AI SDK chat state", async () => {
  const send = vi.fn();
  const socket = { readyState: WebSocket.OPEN, send } as unknown as WebSocket;
  const session = registerKokoTerminalAiSession("pane-error", socket, "9")!;
  handleKokoTerminalAiMessage("pane-error", {
    id: "capability-error",
    role: "assistant",
    metadata: { terminalId: 9 },
    parts: [{ type: "data-capability", data: { enabled: true } }]
  });

  const response = session.chat.sendMessage({
    text: "fail",
    metadata: { terminalId: 9 }
  });
  await Promise.resolve();
  await Promise.resolve();
  handleKokoTerminalAiMessage("pane-error", {
    id: "error-1",
    role: "assistant",
    metadata: { terminalId: 9, stage: "final" },
    parts: [{ type: "data-error", data: { message: "model unavailable" } }]
  });
  await response;

  expect(session.chat.status.value).toBe("error");
  expect(session.errorText).toBe("model unavailable");
  session.chat.clearError();
  expect(session.chat.status.value).toBe("ready");

  const retry = session.chat.sendMessage({
    text: "retry",
    metadata: { terminalId: 9 }
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(send).toHaveBeenCalledTimes(2);
  handleKokoTerminalAiMessage("pane-error", {
    id: "progress-retry-idle",
    role: "assistant",
    metadata: { terminalId: 9 },
    parts: [{ type: "data-progress", data: { state: "idle", text: "" } }]
  });
  await retry;
  expect(session.chat.status.value).toBe("ready");

  unregisterKokoTerminalAiSession("pane-error", socket);
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
