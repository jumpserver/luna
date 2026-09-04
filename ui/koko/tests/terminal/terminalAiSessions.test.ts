import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { computed } from "vue";
import { installAgentSessionHarness } from "#koko/tests/agent/sessionHarness";

import {
  connectKokoTerminalAiSession,
  disconnectKokoTerminalAiSession,
  getKokoTerminalAiSession,
  handleKokoTerminalAiMessage,
  handleKokoTerminalAiWireMessage,
  isKokoTerminalAiAvailable,
  isKokoTerminalAiBusy,
  isKokoTerminalAiWaitingForApproval,
  registerKokoTerminalAiSession,
  sendKokoTerminalAiControl,
  setActiveKokoTerminalAiTarget,
  submitKokoTerminalAiPrompt,
  unregisterKokoTerminalAiSession
} from "#koko/composables/terminal/useTerminalAiSessions";

const paneIds: string[] = [];
let agentHarness: ReturnType<typeof installAgentSessionHarness>;

beforeEach(() => {
  agentHarness = installAgentSessionHarness();
});

afterEach(() => {
  for (const paneId of paneIds.splice(0)) unregisterKokoTerminalAiSession(paneId);
  vi.restoreAllMocks();
});

function createSession(paneId: string, readyState: number = WebSocket.OPEN) {
  const socket = { readyState, send: vi.fn() } as unknown as WebSocket;
  paneIds.push(paneId);
  return registerKokoTerminalAiSession(paneId, socket, "9")!;
}

function enableSession(paneId: string) {
  return agentHarness.attach(handleKokoTerminalAiWireMessage, paneId, "terminal");
}

it("exposes a late Agent manifest to Vue computed availability", async () => {
  const paneId = "reactive-avail";
  const socket = { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket;
  const available = computed(() => isKokoTerminalAiAvailable(paneId));

  expect(available.value).toBe(false);
  const session = registerKokoTerminalAiSession(paneId, socket, "9");
  paneIds.push(paneId);
  expect(session?.kind).toBe("terminal");
  expect(available.value).toBe(false);

  await enableSession(paneId);
  expect(available.value).toBe(true);
});

it("connects a session that was registered before the socket finished opening", async () => {
  const session = createSession("opening-socket", WebSocket.CONNECTING);
  (session.socket as { readyState: number }).readyState = WebSocket.OPEN;

  expect(isKokoTerminalAiAvailable(session.paneId)).toBe(false);
  connectKokoTerminalAiSession(session.paneId, session.socket!);
  await enableSession(session.paneId);

  expect(session.connected).toBe(true);
  expect(isKokoTerminalAiAvailable(session.paneId)).toBe(true);
});

it("resolves a workspace pane to its active Kubernetes terminal session", async () => {
  const first = createSession("k8s-tab-1");
  const second = createSession("k8s-tab-2");
  const active = computed(() => getKokoTerminalAiSession("k8s-workspace"));
  await enableSession(first.paneId);
  await enableSession(second.paneId);

  setActiveKokoTerminalAiTarget("k8s-workspace", first.paneId);
  expect(active.value).toBe(first);
  expect(isKokoTerminalAiAvailable("k8s-workspace")).toBe(true);

  setActiveKokoTerminalAiTarget("k8s-workspace", second.paneId);
  expect(active.value).toBe(second);

  setActiveKokoTerminalAiTarget("k8s-workspace", null);
  expect(active.value).toBeNull();
});

it("uses a Kubernetes MCP sender for Agent tool calls", async () => {
  const paneId = "k8s-mcp-sender";
  const sendMcpFrame = vi.fn();
  const socket = { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket;
  paneIds.push(paneId);
  const session = registerKokoTerminalAiSession(paneId, socket, "12", { sendMcpFrame })!;
  const resourceSessionId = await enableSession(paneId);

  agentHarness.emit(resourceSessionId, {
    type: "tool.call",
    run_id: "run-1",
    tool_call_id: "tool-1",
    payload: { tool_name: "terminal_snapshot", arguments: {} }
  });

  expect(sendMcpFrame).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "mcp.request",
      resource_session_id: resourceSessionId,
      data: expect.objectContaining({ id: "tool-1", method: "tools/call" })
    })
  );
  expect(socket.send).not.toHaveBeenCalled();
  expect(session.chat.messages.value.flatMap((message) => message.parts)).toContainEqual(
    expect.objectContaining({
      type: "data-agent-tool",
      data: expect.objectContaining({
        id: "tool-1",
        toolCallId: "tool-1",
        domain: "terminal",
        toolName: "terminal_snapshot",
        status: "running"
      })
    })
  );
});

it("enforces the selected execution mode on command tool calls", async () => {
  const paneId = "terminal-execution-mode";
  const sendMcpFrame = vi.fn();
  const socket = { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket;
  paneIds.push(paneId);
  const session = registerKokoTerminalAiSession(paneId, socket, "12", { sendMcpFrame })!;
  const resourceSessionId = await enableSession(paneId);
  session.executionMode = "pty";

  agentHarness.emit(resourceSessionId, {
    type: "tool.call",
    run_id: "run-1",
    tool_call_id: "tool-1",
    payload: { tool_name: "execute_shell", arguments: { command: "pwd", execution: "background" } }
  });

  expect(sendMcpFrame).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        params: expect.objectContaining({ arguments: { command: "pwd", execution: "pty" } })
      })
    })
  );
});

it("derives background execution availability from the command tool manifest", async () => {
  const session = createSession("background-capability");
  await agentHarness.attach(
    handleKokoTerminalAiWireMessage,
    session.paneId,
    "terminal",
    "resource:background-capability",
    [
      {
        name: "execute_sql",
        inputSchema: { type: "object" },
        _meta: {
          "com.jumpserver/toolKind": "command",
          "com.jumpserver/executionModes": ["auto", "pty", "background"]
        }
      }
    ]
  );

  expect(session.backgroundExec).toBe(true);
});

it("queues prompts through the enabled pane and rejects unavailable sessions", async () => {
  const active = createSession("prompt-active");
  const other = createSession("prompt-other");
  const disabled = createSession("prompt-disabled");
  const disconnected = createSession("prompt-disconnected", WebSocket.CLOSED);
  const activeResource = await enableSession(active.paneId);
  await enableSession(other.paneId);
  await enableSession(disconnected.paneId);

  active.executionMode = "pty";
  await submitKokoTerminalAiPrompt(active.paneId, "  list files  ");
  await submitKokoTerminalAiPrompt(active.paneId, "second task");

  expect(agentHarness.sendMessage).toHaveBeenCalledTimes(2);
  expect(agentHarness.sendMessage.mock.calls[0]?.[1]).toBe(activeResource);
  expect(agentHarness.sendMessage.mock.calls[0]?.[2]).toMatchObject({
    role: "user",
    parts: [{ type: "text", text: "list files" }],
    metadata: { domain: "terminal", execution_mode: "pty", terminalId: 9 }
  });
  expect(agentHarness.sendMessage.mock.calls[1]?.[2]).toMatchObject({
    role: "user",
    parts: [{ type: "text", text: "second task" }]
  });
  expect(other.socket?.send).not.toHaveBeenCalled();
  expect(isKokoTerminalAiBusy(active.paneId)).toBe(false);
  await expect(submitKokoTerminalAiPrompt(disabled.paneId, "task")).rejects.toMatchObject({
    code: "unavailable"
  });
  await expect(submitKokoTerminalAiPrompt(disconnected.paneId, "task")).rejects.toMatchObject({
    code: "unavailable"
  });

  agentHarness.emit(activeResource, { type: "run.completed", run_id: "run-1" });
  agentHarness.emit(activeResource, { type: "run.completed", run_id: "run-2" });
  await Promise.resolve();
  await Promise.resolve();
  expect(isKokoTerminalAiBusy(active.paneId)).toBe(false);
});

it("coalesces consecutive model deltas without repeating the completed message", async () => {
  const session = createSession("streaming-deltas");
  const resourceSessionId = await enableSession(session.paneId);
  await submitKokoTerminalAiPrompt(session.paneId, "inspect disk");

  agentHarness.emit(resourceSessionId, {
    type: "message.delta",
    run_id: "run-1",
    message_id: "answer-1",
    payload: { role: "assistant", delta: "好的" }
  });
  agentHarness.emit(resourceSessionId, {
    type: "message.delta",
    run_id: "run-1",
    message_id: "answer-1",
    payload: { role: "assistant", delta: "，让我检查。" }
  });
  agentHarness.emit(resourceSessionId, {
    type: "model.completed",
    run_id: "run-1",
    message_id: "answer-1",
    payload: { duration_ms: 12 }
  });
  agentHarness.emit(resourceSessionId, {
    type: "tool.call",
    run_id: "run-1",
    message_id: "answer-1",
    tool_call_id: "tool-1",
    payload: { tool_name: "terminal_snapshot", arguments: {} }
  });
  agentHarness.emit(resourceSessionId, {
    type: "message.delta",
    run_id: "run-1",
    message_id: "answer-1",
    payload: { role: "assistant", delta: "检查完成" }
  });
  agentHarness.emit(resourceSessionId, {
    type: "message.delta",
    run_id: "run-1",
    message_id: "answer-1",
    payload: { role: "assistant", delta: "。" }
  });
  agentHarness.emit(resourceSessionId, {
    type: "message.completed",
    run_id: "run-1",
    message_id: "answer-1",
    payload: {
      role: "assistant",
      parts: [{ type: "text", text: "好的，让我检查。检查完成。" }]
    }
  });
  agentHarness.emit(resourceSessionId, { type: "run.completed", run_id: "run-1" });

  await vi.waitFor(() => {
    const text = session.chat.messages.value
      .filter((message) => message.role === "assistant")
      .flatMap((message) => message.parts)
      .flatMap((part) => (part.type === "text" ? [part.text] : []));
    expect(text).toEqual(["好的，让我检查。", "检查完成。"]);
  });
});

it("reports a prompt dispatch failure without sending to another pane", async () => {
  const socket = { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket;
  paneIds.push("prompt-send-failed");
  const session = registerKokoTerminalAiSession("prompt-send-failed", socket, "19")!;
  await enableSession(session.paneId);
  agentHarness.sendMessage.mockRejectedValueOnce(new Error("Agent request failed"));

  await expect(submitKokoTerminalAiPrompt(session.paneId, "status")).rejects.toMatchObject({
    code: "send_failed"
  });
  expect(session.errorCode).toBe("send_failed");
});

it("makes a disconnected pane unavailable and clears its active task state", async () => {
  const session = createSession("prompt-disconnect");
  await enableSession(session.paneId);
  await submitKokoTerminalAiPrompt(session.paneId, "status");

  disconnectKokoTerminalAiSession(session.paneId, session.socket);

  expect(getKokoTerminalAiSession(session.paneId)).toBe(session);
  expect(isKokoTerminalAiAvailable(session.paneId)).toBe(false);
  expect(isKokoTerminalAiBusy(session.paneId)).toBe(false);
  await expect(submitKokoTerminalAiPrompt(session.paneId, "retry")).rejects.toMatchObject({
    code: "unavailable"
  });
});

it("treats an Agent command approval as active until a decision is sent", async () => {
  const session = createSession("terminal-approval");
  const resourceSessionId = await enableSession(session.paneId);
  agentHarness.emit(resourceSessionId, {
    type: "approval.requested",
    run_id: "run-1",
    approval_id: "approval-1",
    payload: {
      approval_id: "approval-1",
      digest: "digest-1",
      tool_name: "execute_command",
      arguments: { command: "rm example", execution: "pty" }
    }
  });

  expect(isKokoTerminalAiWaitingForApproval(session.paneId)).toBe(true);
  expect(isKokoTerminalAiBusy(session.paneId)).toBe(true);

  sendKokoTerminalAiControl(session.paneId, {
    id: "approval-decision",
    role: "user",
    metadata: { terminalId: 9 },
    parts: [{ type: "data-approval", data: { id: "approval-1", approved: false } }]
  });

  await vi.waitFor(() => expect(isKokoTerminalAiWaitingForApproval(session.paneId)).toBe(false));

  expect(isKokoTerminalAiWaitingForApproval(session.paneId)).toBe(false);
  expect(isKokoTerminalAiBusy(session.paneId)).toBe(false);
  expect(agentHarness.resolveApproval).toHaveBeenCalledWith(
    "agent:resource:terminal-approval",
    resourceSessionId,
    "approval-1",
    {
      decision: "reject",
      run_id: "run-1",
      digest: "digest-1"
    }
  );
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

it("resolves an Agent metadata approval for the active terminal", async () => {
  const session = createSession("metadata-approval");
  const resourceSessionId = await enableSession(session.paneId);
  agentHarness.emit(resourceSessionId, {
    type: "approval.requested",
    run_id: "run-1",
    approval_id: "approval-1",
    payload: {
      approval_id: "approval-1",
      digest: "digest-1",
      tool_name: "database_schema",
      arguments: { query: "user", tables: ["users"] }
    }
  });

  session.resolveMetadataApproval("approve_session");

  await vi.waitFor(() => expect(agentHarness.resolveApproval).toHaveBeenCalledOnce());
  expect(agentHarness.resolveApproval).toHaveBeenCalledWith(
    "agent:resource:metadata-approval",
    resourceSessionId,
    "approval-1",
    {
      decision: "approve",
      run_id: "run-1",
      digest: "digest-1"
    }
  );
  expect(session.metadataApproval?.resolving).toBe(true);
});

it("keeps structured runtime error codes when Agent SSE reports the stream error", async () => {
  const session = createSession("runtime-error-code");
  const resourceSessionId = await enableSession(session.paneId);

  const response = session.chat.sendMessage({ text: "run", metadata: { terminalId: 9 } });
  await Promise.resolve();
  await Promise.resolve();
  agentHarness.emit(resourceSessionId, {
    type: "error",
    payload: { code: "background_unavailable", message: "Agent detail" }
  });
  await response;

  expect(session.errorCode).toBe("background_unavailable");
  expect(session.errorText).toBe("Agent detail");
});

it("shows model activity and settles the response when an Agent run fails", async () => {
  const session = createSession("model-failure");
  const resourceSessionId = await enableSession(session.paneId);

  const response = session.chat.sendMessage({ text: "check memory", metadata: { terminalId: 9 } });
  await Promise.resolve();
  await Promise.resolve();
  agentHarness.emit(resourceSessionId, {
    type: "model.requested",
    run_id: "run-1",
    payload: { round: 1 }
  });

  expect(session).toMatchObject({
    taskActive: true,
    runtimeStatusCode: "analyzing",
    runtimeState: "analyzing"
  });

  agentHarness.emit(resourceSessionId, {
    type: "run.failed",
    run_id: "run-1",
    payload: { state: "failed", reason: "agent run failed" }
  });
  await response;

  expect(session.taskActive).toBe(false);
  expect(session.errorCode).toBe("run_failed");
  expect(session.errorText).toBe("agent run failed");
});

it("exposes local transport failures as translatable error codes", async () => {
  const session = createSession("local-error-code", WebSocket.CLOSED);
  await enableSession(session.paneId);

  await session.chat.sendMessage({ text: "run", metadata: { terminalId: 9 } });

  expect(session.errorCode).toBe("unavailable");
  expect(session.errorText).toBe("");
});

it("stops the active response after sending an interrupt", async () => {
  const session = createSession("interrupt");
  const resourceSessionId = await enableSession(session.paneId);

  const response = session.chat.sendMessage({ text: "run", metadata: { terminalId: 9 } });
  await Promise.resolve();
  await Promise.resolve();
  agentHarness.emit(resourceSessionId, { type: "run.started", run_id: "run-1" });
  sendKokoTerminalAiControl(session.paneId, {
    id: "interrupt",
    role: "user",
    metadata: { terminalId: 9 },
    parts: [{ type: "data-interrupt", data: { reason: "user" } }]
  });
  await response;

  expect(session.chat.status.value).toBe("ready");
  expect(agentHarness.cancel).toHaveBeenCalledWith("agent:resource:interrupt", resourceSessionId, "run-1");
  expect(session.socket?.send).not.toHaveBeenCalled();
});
