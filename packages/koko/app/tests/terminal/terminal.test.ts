import { MESSAGE_TYPE } from "@jumpserver/connectors-core";
import { afterEach, expect, it, vi } from "vitest";
import { computed, ref } from "vue";

import {
  buildJSONEnvelope,
  buildTerminalInput,
  ENVELOPE_CHAT,
  ENVELOPE_TERMINAL_COMMAND,
  parseEnvelope,
  parseJSONPayload,
  parseTerminalPayload
} from "#koko/composables/terminal/envelope";
import { parseTerminalIncomingMessage } from "#koko/composables/terminal/protocol";
import {
  getKokoLinuxMetrics,
  handleKokoLatencyPong,
  handleKokoLinuxMetricsUpdate,
  registerKokoLinuxMetricsSession,
  subscribeKokoLinuxMetrics,
  unregisterKokoLinuxMetricsSession,
  unsubscribeKokoLinuxMetrics
} from "#koko/composables/terminal/useLinuxMetrics";
import {
  getKokoTerminalAiSession,
  handleKokoTerminalAiMessage,
  isKokoTerminalAiInputLocked,
  registerKokoTerminalAiSession,
  sendKokoTerminalAiControl,
  unregisterKokoTerminalAiSession
} from "#koko/composables/terminal/useTerminalAiSessions";
import { useKokoTerminalInput } from "#koko/composables/terminal/useTerminalInput";
import { useKokoTerminalMessageHandler } from "#koko/composables/terminal/useTerminalMessageHandler";
import { saveZmodemPacketsToDisk, sendZmodemFiles } from "#koko/composables/terminal/zmodemBrowser";
import { resolveClipboardAccess, validateClipboardText } from "#koko/utils/clipboardAcl";

it("combines token actions with clipboard policy and text limits", () => {
  const access = resolveClipboardAccess(
    { actions: ["copy"] },
    {
      copy: { enabled: true, acl_action: "allow", text_limit: 2 },
      paste: { enabled: true, acl_action: "allow" }
    }
  );

  expect(validateClipboardText(access, "copy", "中🙂")).toEqual({ allowed: true });
  expect(validateClipboardText(access, "copy", "中🙂A")).toEqual({
    allowed: false,
    reason: "text_limit",
    limit: 2
  });
  expect(validateClipboardText(access, "paste", "x")).toEqual({ allowed: false, reason: "permission" });

  const policyDenied = resolveClipboardAccess({ actions: ["all"] }, { copy: { enabled: false } });
  expect(validateClipboardText(policyDenied, "copy", "x")).toEqual({ allowed: false, reason: "permission" });
});

it("accepts action objects returned by connection token details", () => {
  const access = resolveClipboardAccess({
    actions: [{ value: "connect" }, { value: "copy" }]
  });

  expect(validateClipboardText(access, "copy", "allowed")).toEqual({ allowed: true });
  expect(validateClipboardText(access, "paste", "denied")).toEqual({ allowed: false, reason: "permission" });
});

it("ignores stale limits when no clipboard ACL selected the operation", () => {
  const access = resolveClipboardAccess(
    { actions: ["all"] },
    { copy: { enabled: true, acl_action: null, text_limit: 1 } }
  );

  expect(validateClipboardText(access, "copy", "long text")).toEqual({ allowed: true });
});

it("allows clipboard use for shared sessions without token permissions", () => {
  const access = resolveClipboardAccess(undefined, undefined);

  expect(validateClipboardText(access, "copy", "copy")).toEqual({ allowed: true });
  expect(validateClipboardText(access, "paste", "paste")).toEqual({ allowed: true });
});

it("blocks denied copy and paste events before xterm handles them", () => {
  const container = new EventTarget();
  let keyHandler: ((event: KeyboardEvent) => boolean) | undefined;
  const terminal = {
    attachCustomKeyEventHandler: vi.fn((handler: (event: KeyboardEvent) => boolean) => {
      keyHandler = handler;
    }),
    blur: vi.fn(),
    focus: vi.fn(),
    getSelection: vi.fn(() => "selected text"),
    hasSelection: vi.fn(() => true),
    onData: vi.fn(),
    onResize: vi.fn(),
    onSelectionChange: vi.fn()
  };
  const validate = vi.fn(() => false);
  const onContextMenu = vi.fn();
  const input = useKokoTerminalInput({
    container: ref(container as HTMLElement),
    terminal: ref(terminal as never),
    socket: ref(null),
    terminalId: ref("terminal-1"),
    sessionId: ref("session-1"),
    selectionText: ref(""),
    lastSendTime: ref(new Date()),
    fit: vi.fn(),
    isSocketOpen: vi.fn(() => true),
    isZmodemActive: vi.fn(() => false),
    abortZmodem: vi.fn(),
    onContextMenu,
    getTerminalConfig: vi.fn(() => ({ fontFamily: "monospace" })),
    onResize: vi.fn(),
    onHostKey: vi.fn(),
    inputLocked: vi.fn(() => false),
    addErrorToast: vi.fn(),
    translate: vi.fn((key) => key),
    sendHostEvent: vi.fn(),
    sendToHost: vi.fn(),
    sendMittEvent: vi.fn(),
    validateClipboardText: validate
  });
  input.start();

  const pasteEvent = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(pasteEvent, "clipboardData", { value: { getData: () => "pasted text" } });
  const copyEvent = new Event("copy", { bubbles: true, cancelable: true }) as ClipboardEvent;
  const contextMenuEvent = new Event("contextmenu", { cancelable: true }) as MouseEvent;
  container.dispatchEvent(pasteEvent);
  container.dispatchEvent(copyEvent);
  container.dispatchEvent(contextMenuEvent);

  expect(pasteEvent.defaultPrevented).toBe(true);
  expect(copyEvent.defaultPrevented).toBe(true);
  expect(contextMenuEvent.defaultPrevented).toBe(true);
  expect(onContextMenu).toHaveBeenCalledWith(contextMenuEvent);
  expect(validate.mock.calls).toEqual([
    ["paste", "pasted text"],
    ["copy", "selected text"]
  ]);
  expect(keyHandler?.({ key: "Enter", isComposing: true } as KeyboardEvent)).toBe(false);

  input.stop();
});

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

it("subscribes to Linux metrics and keeps bounded per-pane history", () => {
  const send = vi.fn();
  const socket = { readyState: WebSocket.OPEN, send } as unknown as WebSocket;
  subscribeKokoLinuxMetrics("metrics-pane", "asset-1");
  registerKokoLinuxMetricsSession("metrics-pane", { socket, terminalId: "7" });

  const envelope = parseEnvelope(send.mock.calls[0]![0]);
  expect(parseJSONPayload(envelope.payload)).toMatchObject({
    terminalId: 7,
    command: "TERMINAL_METRICS_SUBSCRIBE"
  });

  for (let timestamp = 1; timestamp <= 65; timestamp += 1) {
    handleKokoLinuxMetricsUpdate(
      "metrics-pane",
      JSON.stringify({ timestamp, cpuPercent: timestamp, memoryPercent: 50 })
    );
  }
  expect(getKokoLinuxMetrics("metrics-pane")).toMatchObject({
    status: "collecting",
    latest: { timestamp: 65 }
  });
  expect(getKokoLinuxMetrics("metrics-pane")?.history).toHaveLength(60);
  expect(getKokoLinuxMetrics("metrics-pane")?.history[0]?.timestamp).toBe(6);
  handleKokoLatencyPong("metrics-pane", JSON.stringify({ sentAt: Date.now() - 20 }));
  expect(getKokoLinuxMetrics("metrics-pane")?.latencyMs).toBeGreaterThanOrEqual(20);

  unsubscribeKokoLinuxMetrics("metrics-pane");
  unregisterKokoLinuxMetricsSession("metrics-pane", socket);

  subscribeKokoLinuxMetrics("metrics-pane-2", "asset-1");
  expect(getKokoLinuxMetrics("metrics-pane-2")).toMatchObject({
    cached: true,
    latest: { timestamp: 65 }
  });
  registerKokoLinuxMetricsSession("metrics-pane-2", { socket, terminalId: "8" });
  unsubscribeKokoLinuxMetrics("metrics-pane-2");
  unregisterKokoLinuxMetricsSession("metrics-pane-2", socket);
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
  vi.unstubAllGlobals();
});

it("sends zmodem files through the local browser adapter", async () => {
  const sent: Uint8Array[] = [];
  const close = vi.fn(async () => undefined);
  const header = {
    _bytes4: [0, 0, 0, 0],
    to_binary16: vi.fn(function (this: { _bytes4: number[] }) {
      return this._bytes4.slice();
    })
  };
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
  const session = {
    type: "send",
    abort: () => undefined,
    aborted: () => false,
    close,
    has_ended: () => false,
    on: () => undefined as never,
    send_offer: async (offer) => {
      const internal = session as typeof session & {
        _create_header_bytes: (name: string) => [number[], typeof header];
      };
      expect(internal._create_header_bytes("ZFILE")[0][2]).toBe(4);
      void offer;
      return offered();
    },
    _create_header_bytes: () => [[], header],
    _get_header_formatter: () => "to_binary16",
    _zencoder: {}
  } as Parameters<typeof sendZmodemFiles>[0];

  await sendZmodemFiles(session, [new File(["hello"], "hello.txt")]);

  expect(offered).toHaveBeenCalledTimes(1);
  expect(new TextDecoder().decode(sent[0])).toBe("hello");
  expect(close).toHaveBeenCalledTimes(1);
});

it("saves downloaded packets through a temporary anchor element", () => {
  const click = vi.fn();
  const link = { style: { display: "" }, href: "", download: "", click };
  if (typeof document === "undefined") {
    vi.stubGlobal("document", {
      createElement: vi.fn(),
      body: { appendChild: vi.fn(), removeChild: vi.fn() }
    });
  }
  // Electron augments createElement("webview") with a narrower overload even
  // though the application keeps webviewTag disabled. This mock targets the
  // ordinary anchor path, so the overloaded return type is intentionally erased.
  vi.spyOn(document, "createElement").mockReturnValue(link as never);
  const appendChild = vi.spyOn(document.body, "appendChild").mockImplementation(() => link as unknown as Node);
  const removeChild = vi.spyOn(document.body, "removeChild").mockImplementation(() => link as unknown as Node);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

  saveZmodemPacketsToDisk([new Uint8Array([1, 2, 3])], "packet.bin");

  expect(click).toHaveBeenCalledTimes(1);
  expect(appendChild).toHaveBeenCalledWith(link);
  expect(removeChild).toHaveBeenCalledWith(link);
});
