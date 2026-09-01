import { afterEach, expect, it, vi } from "vitest";
import { computed } from "vue";
import { parseEnvelope, parseJSONPayload } from "#koko/composables/terminal/envelope";

import {
  connectKokoTerminalAiSession,
  disconnectKokoTerminalAiSession,
  getKokoTerminalAiSession,
  handleKokoTerminalAiMessage,
  isKokoTerminalAiAvailable,
  isKokoTerminalAiBusy,
  isKokoTerminalAiWaitingForApproval,
  registerKokoTerminalAiSession,
  sendKokoTerminalAiControl,
  submitKokoTerminalAiPrompt,
  unregisterKokoTerminalAiSession
} from "#koko/composables/terminal/useTerminalAiSessions";

const paneIds: string[] = [];

afterEach(() => {
  for (const paneId of paneIds.splice(0)) unregisterKokoTerminalAiSession(paneId);
});

function createSession(paneId: string, readyState: number = WebSocket.OPEN) {
  const socket = { readyState, send: vi.fn() } as unknown as WebSocket;
  paneIds.push(paneId);
  return registerKokoTerminalAiSession(paneId, socket, "9")!;
}

function enableSession(paneId: string, terminalId = 9) {
  handleKokoTerminalAiMessage(paneId, {
    id: `capability-${paneId}`,
    role: "assistant",
    metadata: { terminalId },
    parts: [{ type: "data-capability", data: { enabled: true } }]
  });
}

it("exposes late capability to Vue computed availability", () => {
  const paneId = "reactive-avail";
  const socket = { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket;
  const available = computed(() => isKokoTerminalAiAvailable(paneId));

  expect(available.value).toBe(false);
  const session = registerKokoTerminalAiSession(paneId, socket, "9");
  paneIds.push(paneId);
  expect(session?.kind).toBe("terminal");
  expect(available.value).toBe(false);

  enableSession(paneId);
  expect(available.value).toBe(true);
});

it("connects a session that was registered before the socket finished opening", () => {
  const session = createSession("opening-socket", WebSocket.CONNECTING);
  (session.socket as { readyState: number }).readyState = WebSocket.OPEN;

  expect(isKokoTerminalAiAvailable(session.paneId)).toBe(false);
  connectKokoTerminalAiSession(session.paneId, session.socket!);
  enableSession(session.paneId);

  expect(session.connected).toBe(true);
  expect(isKokoTerminalAiAvailable(session.paneId)).toBe(true);
});

it("submits prompts through the enabled pane and rejects unavailable or overlapping tasks", async () => {
  const active = createSession("prompt-active");
  const other = createSession("prompt-other");
  const disabled = createSession("prompt-disabled");
  const disconnected = createSession("prompt-disconnected", WebSocket.CLOSED);
  enableSession(active.paneId);
  enableSession(other.paneId);
  enableSession(disconnected.paneId);

  await submitKokoTerminalAiPrompt(active.paneId, "  list files  ");

  const frame = parseEnvelope(vi.mocked(active.socket!.send).mock.calls[0]![0] as Uint8Array);
  expect(parseJSONPayload<Record<string, any>>(frame.payload)).toMatchObject({
    role: "user",
    metadata: { terminalId: 9 },
    parts: [{ type: "text", text: "list files" }]
  });
  expect(other.socket?.send).not.toHaveBeenCalled();
  expect(isKokoTerminalAiBusy(active.paneId)).toBe(true);
  await expect(submitKokoTerminalAiPrompt(active.paneId, "second task")).rejects.toMatchObject({
    code: "response_active"
  });
  await expect(submitKokoTerminalAiPrompt(disabled.paneId, "task")).rejects.toMatchObject({
    code: "unavailable"
  });
  await expect(submitKokoTerminalAiPrompt(disconnected.paneId, "task")).rejects.toMatchObject({
    code: "unavailable"
  });

  handleKokoTerminalAiMessage(active.paneId, {
    id: "prompt-idle",
    role: "assistant",
    metadata: { terminalId: 9 },
    parts: [{ type: "data-progress", data: { state: "idle" } }]
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(isKokoTerminalAiBusy(active.paneId)).toBe(false);
});

it("reports a prompt dispatch failure without sending to another pane", async () => {
  const send = vi.fn(() => {
    throw new Error("socket write failed");
  });
  const socket = { readyState: WebSocket.OPEN, send } as unknown as WebSocket;
  paneIds.push("prompt-send-failed");
  const session = registerKokoTerminalAiSession("prompt-send-failed", socket, "19")!;
  enableSession(session.paneId, 19);

  await expect(submitKokoTerminalAiPrompt(session.paneId, "status")).rejects.toMatchObject({
    code: "send_failed"
  });
  expect(session.errorCode).toBe("send_failed");
});

it("makes a disconnected pane unavailable and clears its active task state", async () => {
  const session = createSession("prompt-disconnect");
  enableSession(session.paneId);
  await submitKokoTerminalAiPrompt(session.paneId, "status");

  disconnectKokoTerminalAiSession(session.paneId, session.socket);

  expect(getKokoTerminalAiSession(session.paneId)).toBe(session);
  expect(isKokoTerminalAiAvailable(session.paneId)).toBe(false);
  expect(isKokoTerminalAiBusy(session.paneId)).toBe(false);
  await expect(submitKokoTerminalAiPrompt(session.paneId, "retry")).rejects.toMatchObject({
    code: "unavailable"
  });
});

it("treats terminal command approval as active until a decision is sent", () => {
  const session = createSession("terminal-approval");
  enableSession(session.paneId);
  handleKokoTerminalAiMessage(session.paneId, {
    id: "approval-message",
    role: "assistant",
    metadata: { terminalId: 9 },
    parts: [{ type: "data-approval", data: { id: "approval-1", command: "rm example" } }]
  });

  expect(isKokoTerminalAiWaitingForApproval(session.paneId)).toBe(true);
  expect(isKokoTerminalAiBusy(session.paneId)).toBe(true);

  sendKokoTerminalAiControl(session.paneId, {
    id: "approval-decision",
    role: "user",
    metadata: { terminalId: 9 },
    parts: [{ type: "data-approval", data: { id: "approval-1", approved: false } }]
  });

  expect(isKokoTerminalAiWaitingForApproval(session.paneId)).toBe(false);
  expect(isKokoTerminalAiBusy(session.paneId)).toBe(false);
});

it("retains structured Terminal AI presentation metadata", () => {
  const session = createSession("presentation-metadata");

  handleKokoTerminalAiMessage(session.paneId, {
    id: "capability",
    role: "assistant",
    metadata: { terminalId: 9 },
    parts: [
      {
        type: "data-capability",
        data: {
          enabled: true,
          backgroundExec: false,
          backgroundReason: "legacy reason",
          backgroundReasonCode: "pty_only"
        }
      }
    ]
  });
  handleKokoTerminalAiMessage(session.paneId, {
    id: "progress",
    role: "assistant",
    metadata: { terminalId: 9 },
    parts: [
      {
        type: "data-progress",
        data: { code: "planning", execution: "background_exec", state: "planning", text: "legacy progress" }
      }
    ]
  });

  expect(getKokoTerminalAiSession(session.paneId)).toMatchObject({
    backgroundReason: "legacy reason",
    backgroundReasonCode: "pty_only",
    runtimeExecution: "background_exec",
    runtimeState: "planning",
    runtimeStatus: "legacy progress",
    runtimeStatusCode: "planning"
  });
});

it("resolves SQL metadata approval for the active terminal", () => {
  const session = createSession("metadata-approval");
  handleKokoTerminalAiMessage(session.paneId, {
    id: "capability",
    role: "assistant",
    metadata: { terminalId: 9 },
    parts: [{ type: "data-capability", data: { enabled: true } }]
  });
  handleKokoTerminalAiMessage(session.paneId, {
    id: "metadata",
    role: "assistant",
    metadata: { terminalId: 9 },
    parts: [
      {
        type: "data-metadata-approval",
        data: { id: "approval-1", digest: "digest-1", database: "app", tables: ["users"], tableLimit: 5 }
      }
    ]
  });

  session.resolveMetadataApproval("approve_session");

  const frame = parseEnvelope(vi.mocked(session.socket!.send).mock.calls[0]![0] as Uint8Array);
  expect(parseJSONPayload<Record<string, any>>(frame.payload)).toMatchObject({
    metadata: { terminalId: 9 },
    parts: [
      {
        type: "data-metadata-approval",
        data: { id: "approval-1", digest: "digest-1", decision: "approve_session" }
      }
    ]
  });
  expect(session.metadataApproval?.resolving).toBe(true);
});

it("keeps structured runtime error codes when the AI SDK reports the stream error", async () => {
  const session = createSession("runtime-error-code");
  handleKokoTerminalAiMessage(session.paneId, {
    id: "capability",
    role: "assistant",
    metadata: { terminalId: 9 },
    parts: [{ type: "data-capability", data: { enabled: true } }]
  });

  const response = session.chat.sendMessage({ text: "run", metadata: { terminalId: 9 } });
  await Promise.resolve();
  await Promise.resolve();
  handleKokoTerminalAiMessage(session.paneId, {
    id: "error",
    role: "assistant",
    metadata: { terminalId: 9 },
    parts: [{ type: "data-error", data: { code: "background_unavailable", message: "legacy detail" } }]
  });
  await response;

  expect(session.errorCode).toBe("background_unavailable");
  expect(session.errorText).toBe("legacy detail");
});

it("exposes local transport failures as translatable error codes", async () => {
  const session = createSession("local-error-code", WebSocket.CLOSED);
  handleKokoTerminalAiMessage(session.paneId, {
    id: "capability",
    role: "assistant",
    metadata: { terminalId: 9 },
    parts: [{ type: "data-capability", data: { enabled: true } }]
  });

  await session.chat.sendMessage({ text: "run", metadata: { terminalId: 9 } });

  expect(session.errorCode).toBe("unavailable");
  expect(session.errorText).toBe("");
});

it("stops the active response after sending an interrupt", async () => {
  const session = createSession("interrupt");
  handleKokoTerminalAiMessage(session.paneId, {
    id: "capability",
    role: "assistant",
    metadata: { terminalId: 9 },
    parts: [{ type: "data-capability", data: { enabled: true } }]
  });

  const response = session.chat.sendMessage({ text: "run", metadata: { terminalId: 9 } });
  await Promise.resolve();
  await Promise.resolve();
  sendKokoTerminalAiControl(session.paneId, {
    id: "interrupt",
    role: "user",
    metadata: { terminalId: 9 },
    parts: [{ type: "data-interrupt", data: { reason: "user" } }]
  });
  await response;

  expect(session.chat.status.value).toBe("ready");
  expect(session.socket?.send).toHaveBeenCalledTimes(2);
});
