import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ref } from "vue";
import { installAgentSessionHarness } from "#koko/tests/agent/sessionHarness";
import {
  connectKokoFileAiSession,
  createKokoCompactFileAiOwnerId,
  createKokoCompactFileAiTargetId,
  disposeKokoFileAiOwner,
  disconnectKokoFileAiSession,
  getActiveKokoFileAiSession,
  getActiveKokoFileAiTargetId,
  getKokoFileAiSession,
  handleKokoFileAiMessage,
  handleKokoFileAiWireMessage,
  isKokoFileAiAvailable,
  isSuccessfulKokoFileAiMutationResult,
  registerKokoFileAiSession,
  releaseKokoFileAiSession,
  resolveKokoFileAiApproval,
  setActiveKokoFileAiTarget,
  submitKokoFileAiPrompt,
  unregisterKokoFileAiSession,
  updateKokoFileAiContext
} from "#koko/composables/sftp/useFileAiSessions";
import { createSftpFileAiReadiness } from "#koko/composables/sftp/useSftpFileManager";
import { SftpMessageType } from "#koko/composables/sftp/protocol";

const targetIds: string[] = [];
let agentHarness: ReturnType<typeof installAgentSessionHarness>;

beforeEach(() => {
  agentHarness = installAgentSessionHarness();
});

afterEach(() => {
  for (const targetId of targetIds.splice(0)) unregisterKokoFileAiSession(targetId);
  setActiveKokoFileAiTarget(null);
  vi.restoreAllMocks();
});

function createSession(targetId: string, connected = true) {
  const socket = { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket;
  targetIds.push(targetId);
  return registerKokoFileAiSession(targetId, socket, {
    targetId,
    assetId: "asset-1",
    assetName: "web-01",
    account: "deploy",
    currentPath: "/srv/app",
    selectedEntries: [
      {
        name: "config.yaml",
        path: "/srv/app/config.yaml",
        size: "128",
        perm: "-rw-r--r--",
        modTime: "2026-08-27T00:00:00Z",
        type: "file",
        isDirectory: false,
        version: "version-1"
      }
    ],
    connected
  })!;
}

function enableSession(targetId: string) {
  return agentHarness.attach(handleKokoFileAiWireMessage, targetId, "file");
}

it("keeps File AI unavailable until SFTP CONNECT and the Agent manifest", async () => {
  const readiness = createSftpFileAiReadiness(ref("/tmp"), ref(false));
  const session = createSession("remote-sftp:asset-1:initializing", false);

  expect(readiness.ready.value).toBe(false);
  expect(isKokoFileAiAvailable(session.targetId)).toBe(false);

  readiness.handleMessage({ id: "connect", type: SftpMessageType.Connect });
  connectKokoFileAiSession(session.targetId, session.socket!);

  expect(readiness.ready.value).toBe(true);
  expect(isKokoFileAiAvailable(session.targetId)).toBe(false);
  await enableSession(session.targetId);
  expect(isKokoFileAiAvailable(session.targetId)).toBe(true);
});

it("keeps File AI unavailable until the canonical SFTP path is known", () => {
  const currentPath = ref("");
  const loading = ref(true);
  const readiness = createSftpFileAiReadiness(currentPath, loading);

  readiness.handleMessage({ id: "connect", type: SftpMessageType.Connect });
  expect(readiness.ready.value).toBe(false);

  currentPath.value = "/tmp";
  expect(readiness.ready.value).toBe(false);

  loading.value = false;
  expect(readiness.ready.value).toBe(true);
});

it("sends a target-scoped File AI prompt without SFTP credentials", async () => {
  const session = createSession("remote-sftp:asset-1:pane-1");
  const resourceSessionId = await enableSession(session.targetId);
  setActiveKokoFileAiTarget(session.targetId);

  await submitKokoFileAiPrompt(session.targetId, "  explain the selected file  ");

  expect(agentHarness.sendMessage).toHaveBeenCalledWith(
    `agent:${resourceSessionId}`,
    resourceSessionId,
    expect.objectContaining({
      role: "user",
      parts: [{ type: "text", text: "explain the selected file" }]
    })
  );
  const request = agentHarness.sendMessage.mock.calls[0]?.[2];
  expect(request).toMatchObject({
    role: "user",
    parts: [{ type: "text", text: "explain the selected file" }],
    metadata: {
      domain: "file",
      targetId: session.targetId,
      context: {
        currentPath: "/srv/app",
        selectedEntries: [{ name: "config.yaml", path: "/srv/app/config.yaml", version: "version-1" }]
      }
    }
  });
  expect(JSON.stringify(request)).not.toMatch(/tokenId|ticket|endpointUrl|password|certificate/i);
  expect(session.socket?.send).not.toHaveBeenCalled();
  expect(getActiveKokoFileAiSession()).toBe(session);
});

it("returns the Agent approval digest with a File AI decision", async () => {
  const session = createSession("remote-sftp:asset-1:pane-2");
  const resourceSessionId = await enableSession(session.targetId);
  agentHarness.emit(resourceSessionId, {
    type: "approval.requested",
    run_id: "run-1",
    approval_id: "approval-1",
    payload: {
      approval_id: "approval-1",
      digest: "digest-1",
      tool_name: "delete",
      arguments: { path: "/srv/app/config.yaml", expected_version: "version-1" }
    }
  });

  resolveKokoFileAiApproval(session.targetId, "approval-1", "approve");

  await vi.waitFor(() => expect(agentHarness.resolveApproval).toHaveBeenCalledOnce());
  expect(agentHarness.resolveApproval).toHaveBeenCalledWith(
    `agent:${resourceSessionId}`,
    resourceSessionId,
    "approval-1",
    {
      decision: "approve",
      run_id: "run-1",
      digest: "digest-1"
    }
  );
  expect(session.resolvingApprovals.has("approval-1")).toBe(true);

  agentHarness.emit(resourceSessionId, {
    type: "approval.resolved",
    run_id: "run-1",
    approval_id: "approval-1",
    payload: {
      approval_id: "approval-1",
      digest: "digest-1",
      state: "cancelled"
    }
  });
  expect(session.pendingApprovals.has("approval-1")).toBe(false);
  expect(session.resolvingApprovals.has("approval-1")).toBe(false);
  expect(session.approvalDigests.has("approval-1")).toBe(false);
});

it("keeps Agent session and run control events out of the visible conversation", async () => {
  const session = createSession("remote-sftp:asset-1:pane-3");
  const resourceSessionId = await enableSession(session.targetId);
  agentHarness.emit(resourceSessionId, { type: "run.completed", run_id: "run-1" });

  expect(session.chat.messages.value).toEqual([]);
});

it("keeps streamed File AI text ordered across progress events", async () => {
  const session = createSession("remote-sftp:asset-1:stream");
  const resourceSessionId = await enableSession(session.targetId);
  await submitKokoFileAiPrompt(session.targetId, "检查文件");

  for (const text of ["正在", "检查"]) {
    agentHarness.emit(resourceSessionId, {
      type: "message.delta",
      run_id: "run-1",
      message_id: "answer-1",
      payload: { role: "assistant", delta: text }
    });
  }
  agentHarness.emit(resourceSessionId, {
    type: "model.completed",
    run_id: "run-1",
    message_id: "answer-1",
    payload: { duration_ms: 10 }
  });
  agentHarness.emit(resourceSessionId, {
    type: "message.delta",
    run_id: "run-1",
    message_id: "answer-1",
    payload: { role: "assistant", delta: "完成" }
  });
  agentHarness.emit(resourceSessionId, { type: "run.completed", run_id: "run-1" });

  await vi.waitFor(() => {
    const text = session.chat.messages.value
      .filter((message) => message.role === "assistant")
      .flatMap((message) => message.parts)
      .flatMap((part) => (part.type === "text" ? [part.text] : []));
    expect(text).toEqual(["正在检查完成"]);
  });
});

it("rejects an event whose target does not match the socket-bound session", () => {
  const source = createSession("remote-sftp:asset-1:source");
  const other = createSession("remote-sftp:asset-2:other");

  handleKokoFileAiMessage(source.targetId, {
    id: "cross-pane-event",
    role: "assistant",
    metadata: { domain: "file", targetId: other.targetId },
    parts: [{ type: "data-error", data: { message: "wrong target" } }]
  });

  expect(source.errorText).toBe("");
  expect(other.errorText).toBe("");
  expect(source.chat.messages.value).toEqual([]);
  expect(other.chat.messages.value).toEqual([]);
});

it("keeps owner-scoped File AI focus isolated", () => {
  const left = createSession("remote-sftp:asset-1:left");
  const right = createSession("remote-sftp:asset-2:right");

  setActiveKokoFileAiTarget(left.targetId, "workspace:left");
  setActiveKokoFileAiTarget(right.targetId, "workspace:right");

  expect(getActiveKokoFileAiTargetId("workspace:left")).toBe(left.targetId);
  expect(getActiveKokoFileAiTargetId("workspace:right")).toBe(right.targetId);

  unregisterKokoFileAiSession(left.targetId, left.socket);
  expect(getActiveKokoFileAiTargetId("workspace:left")).toBeNull();
  expect(getActiveKokoFileAiTargetId("workspace:right")).toBe(right.targetId);
});

it("preserves File AI conversation and draft when the same pane reconnects", async () => {
  const session = createSession("remote-sftp:asset-1:reconnect");
  const resourceSessionId = await enableSession(session.targetId);
  session.draft = "continue after reconnect";
  session.taskActive = true;
  session.pendingApprovals.add("approval-1");
  handleKokoFileAiMessage(session.targetId, {
    id: "prior-message",
    role: "assistant",
    metadata: { domain: "file", targetId: session.targetId },
    parts: [{ type: "text", text: "prior result" }]
  });

  const previousSocket = session.socket!;
  const nextSocket = { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket;
  const rebound = registerKokoFileAiSession(session.targetId, nextSocket, {
    ...session.context,
    currentPath: "/srv/app/releases",
    connected: true
  })!;

  expect(rebound).toBe(session);
  expect(rebound.socket).toBe(nextSocket);
  expect(rebound.draft).toBe("continue after reconnect");
  expect(rebound.chat.messages.value).toHaveLength(1);
  expect(rebound.context.currentPath).toBe("/srv/app/releases");
  expect(rebound.taskActive).toBe(false);
  expect(rebound.pendingApprovals.size).toBe(0);

  unregisterKokoFileAiSession(session.targetId, previousSocket);
  await enableSession(session.targetId);
  await submitKokoFileAiPrompt(session.targetId, "use the reconnected socket");
  expect(agentHarness.sendMessage).toHaveBeenCalledWith(
    `agent:${resourceSessionId}`,
    resourceSessionId,
    expect.objectContaining({ parts: [{ type: "text", text: "use the reconnected socket" }] })
  );
  expect(nextSocket.send).not.toHaveBeenCalled();

  agentHarness.emit(resourceSessionId, {
    type: "tool.call",
    run_id: "run-1",
    tool_call_id: "tool-1",
    payload: {
      name: "read_text",
      arguments: { path: "/srv/app/config.yaml" }
    }
  });
  expect(nextSocket.send).toHaveBeenCalledOnce();
  expect(JSON.parse(vi.mocked(nextSocket.send).mock.calls[0]![0] as string)).toMatchObject({
    type: SftpMessageType.MCPRequest,
    resource_session_id: resourceSessionId
  });
  await vi.waitFor(() =>
    expect(session.chat.messages.value.flatMap((message) => message.parts)).toContainEqual(
      expect.objectContaining({
        type: "data-agent-tool",
        data: expect.objectContaining({
          id: "tool-1",
          toolCallId: "tool-1",
          domain: "file",
          toolName: "read_text",
          status: "running"
        })
      })
    )
  );
});

it("cancels an outstanding Koko tool call without deleting the shared Agent session on disconnect", async () => {
  const session = createSession("remote-sftp:asset-1:tool-disconnect");
  const resourceSessionId = await enableSession(session.targetId);
  agentHarness.emit(resourceSessionId, { type: "run.started", run_id: "run-1" });
  agentHarness.emit(resourceSessionId, {
    type: "tool.call",
    run_id: "run-1",
    tool_call_id: "tool-1",
    payload: {
      name: "read_text",
      arguments: { path: "/srv/app/config.yaml" }
    }
  });
  expect(session.socket?.send).toHaveBeenCalledOnce();

  const previousSocket = session.socket!;
  disconnectKokoFileAiSession(session.targetId, previousSocket);
  expect(agentHarness.deleteSession).not.toHaveBeenCalled();
  expect(previousSocket.send).toHaveBeenCalledTimes(2);
  expect(JSON.parse(vi.mocked(previousSocket.send).mock.calls[1]![0] as string)).toMatchObject({
    type: SftpMessageType.MCPCancel,
    resource_session_id: resourceSessionId,
    data: expect.stringContaining("notifications/cancelled")
  });
  expect(session.agent.state.status).toBe("closed");
  expect(session.taskActive).toBe(false);

  const nextSocket = { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket;
  registerKokoFileAiSession(session.targetId, nextSocket, { ...session.context, connected: true });
  await enableSession(session.targetId);
  expect(agentHarness.createSession).toHaveBeenCalledTimes(2);
  await submitKokoFileAiPrompt(session.targetId, "continue on the rebuilt Agent session");
  expect(agentHarness.sendMessage).toHaveBeenCalledWith(
    `agent:${resourceSessionId}`,
    resourceSessionId,
    expect.objectContaining({ parts: [{ type: "text", text: "continue on the rebuilt Agent session" }] })
  );
});

it("resets File AI state when the same workspace pane connects another asset", () => {
  const session = createSession("remote-sftp:asset-1:reused-pane");
  session.draft = "asset one draft";
  session.chat.messages.value = [
    {
      id: "asset-one-message",
      role: "assistant",
      metadata: { domain: "file", targetId: session.targetId },
      parts: [{ type: "text", text: "asset one result" }]
    }
  ];

  const nextSocket = { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket;
  const replacement = registerKokoFileAiSession(session.targetId, nextSocket, {
    ...session.context,
    assetId: "asset-2",
    assetName: "db-02",
    account: "root"
  })!;

  expect(replacement).not.toBe(session);
  expect(replacement.context.assetId).toBe("asset-2");
  expect(replacement.draft).toBe("");
  expect(replacement.chat.messages.value).toEqual([]);
});

it("resets File AI state when reactive pane context changes identity before the socket", () => {
  const session = createSession("remote-sftp:asset-1:reactive-reuse");
  session.draft = "do not carry this across assets";

  updateKokoFileAiContext(session.targetId, {
    ...session.context,
    assetId: "asset-2",
    assetName: "db-02",
    account: "root"
  });

  const replacement = getKokoFileAiSession(session.targetId)!;
  expect(replacement).not.toBe(session);
  expect(replacement.context.assetId).toBe("asset-2");
  expect(replacement.draft).toBe("");
});

it("preserves File AI state while an owned surface is asynchronously detached", async () => {
  const session = createSession("remote-sftp:asset-1:remount");
  session.draft = "keep this draft";
  const previousSocket = session.socket!;
  const nextSocket = { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket;
  const ownerId = "workspace:async-remount";

  setActiveKokoFileAiTarget(session.targetId, ownerId);
  releaseKokoFileAiSession(session.targetId, previousSocket);
  await Promise.resolve();
  expect(getKokoFileAiSession(session.targetId)).toBe(session);

  const rebound = registerKokoFileAiSession(session.targetId, nextSocket, {
    ...session.context,
    connected: true
  });

  expect(rebound).toBe(session);
  expect(getKokoFileAiSession(session.targetId)).toBe(session);
  expect(rebound?.draft).toBe("keep this draft");

  disposeKokoFileAiOwner(ownerId);
  expect(getKokoFileAiSession(session.targetId)).toBeNull();
});

it("builds distinct compact File AI identities for SSH panes and accounts", () => {
  expect(createKokoCompactFileAiOwnerId("ssh-pane-1")).not.toBe(createKokoCompactFileAiOwnerId("ssh-pane-2"));
  expect(createKokoCompactFileAiTargetId("ssh-pane-1", "asset-1", "root")).not.toBe(
    createKokoCompactFileAiTargetId("ssh-pane-1", "asset-1", "deploy")
  );
});

it("keeps run-level errors out of the visible File AI timeline", () => {
  const session = createSession("remote-sftp:asset-1:error");
  handleKokoFileAiMessage(session.targetId, {
    id: "run-error",
    role: "assistant",
    metadata: { domain: "file", targetId: session.targetId },
    parts: [{ type: "data-error", data: { code: "failed", message: "save_text failed" } }]
  });

  expect(session.errorCode).toBe("failed");
  expect(session.errorText).toBe("save_text failed");
  expect(session.chat.messages.value).toEqual([]);
});

it("refreshes only for successful mutating results from the bound target", () => {
  const targetId = "remote-sftp:asset-1:refresh";
  const result = (tool: string, outcome: string, messageTargetId = targetId) => ({
    id: `${tool}-${outcome}`,
    role: "assistant",
    metadata: { domain: "file", targetId: messageTargetId },
    parts: [{ type: "data-file-result", data: { tool, outcome } }]
  });

  for (const tool of ["save_text", "mkdir", "rename", "delete"]) {
    expect(isSuccessfulKokoFileAiMutationResult(result(tool, "success"), targetId)).toBe(true);
  }
  expect(isSuccessfulKokoFileAiMutationResult(result("read_text", "success"), targetId)).toBe(false);
  expect(isSuccessfulKokoFileAiMutationResult(result("delete", "error"), targetId)).toBe(false);
  expect(isSuccessfulKokoFileAiMutationResult(result("delete", "success", "other-target"), targetId)).toBe(false);
});
