import type { AgentSseConnection, AgentSseOptions } from "#koko/composables/agent/agentSse";
import type { AgentEvent } from "#koko/composables/agent/types";
import { expect, it, vi } from "vitest";
import { AgentClient, AgentHttpError } from "#koko/composables/agent/agentClient";
import { AgentToolRelay } from "#koko/composables/agent/agentToolRelay";
import { agentEventToUiMessage, useAgentSession } from "#koko/composables/agent/useAgentSession";

async function session() {
  let stream!: AgentSseOptions;
  const stop = vi.fn();
  const onMessage = vi.fn();
  const onUnavailable = vi.fn();
  const client = {
    retainResource: vi.fn(),
    releaseResource: vi.fn(),
    bootstrap: vi.fn().mockResolvedValue({}),
    createSession: vi.fn().mockResolvedValue({ session_id: "panel", after: 0 }),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    resolveApproval: vi.fn(),
    getApproval: vi.fn(),
    sendToolResult: vi.fn(),
    sendMessage: vi.fn().mockResolvedValue({ run_id: "next-run" }),
    cancel: vi.fn()
  };
  const relay = new AgentToolRelay({ resourceSessionId: () => "resource", sendFrame: vi.fn() });
  const controller = useAgentSession({
    domain: "terminal",
    client: client as unknown as AgentClient,
    relay,
    messageMetadata: () => ({ domain: "terminal" }),
    onMessage,
    onUnavailable,
    onAvailability: vi.fn(),
    toolResultRetry: { maxAttempts: 3, wait: vi.fn().mockResolvedValue(undefined) },
    createSse: (options) => {
      stream = options;
      return { start: vi.fn(), stop } as unknown as AgentSseConnection;
    }
  });
  await controller.actions.attachManifest({
    profile: "terminal",
    resourceSessionId: "resource",
    revision: 1,
    tools: []
  });
  function emit(type: AgentEvent["type"], payload: AgentEvent["payload"] = {}) {
    stream.onEvent({
      seq: controller.state.lastSeq + 1,
      type,
      session_id: "panel",
      resource_session_id: "resource",
      run_id: "run",
      tool_call_id: "call",
      payload
    });
  }
  return { controller, client, emit, stop, onMessage, onUnavailable };
}

it.each(["expired", "cancelled"])("preserves the %s approval outcome instead of treating it as rejection", (state) => {
  expect(
    agentEventToUiMessage(
      { seq: 1, type: "approval.resolved", payload: { status: state, approved: false } },
      "terminal",
      {}
    )
  ).toMatchObject({ parts: [{ type: "data-approval", data: { state, resolved: true } }] });
});

it.each(["approval_expired", "approval_terminal"])("reconciles %s without a submission error", async (code) => {
  const s = await session();
  s.emit("approval.requested", {
    approval_id: "approval",
    tool_name: "execute_command",
    arguments: { command: "pwd" }
  });
  s.client.resolveApproval.mockRejectedValue(new AgentHttpError(409, JSON.stringify({ code })));
  s.client.getApproval.mockResolvedValue({ state: "expired" });
  await expect(s.controller.actions.resolveApproval("approval", "approve")).resolves.toBeUndefined();
  expect(s.onMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      parts: [
        expect.objectContaining({
          type: "data-approval",
          data: expect.objectContaining({ id: "approval", resolved: true, state: "expired" })
        })
      ]
    })
  );
  s.emit("approval.resolved", { approval_id: "approval", status: "expired", approved: false });
  expect(s.onMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      parts: [expect.objectContaining({ data: expect.objectContaining({ state: "expired", command: "pwd" }) })]
    })
  );
  expect(s.onUnavailable).not.toHaveBeenCalled();
  await s.controller.actions.dispose();
});

it("closes pending approvals when a run times out, with a visible notice", async () => {
  const s = await session();
  s.emit("approval.requested", { approval_id: "approval", tool_name: "execute_command", arguments: {} });
  s.emit("run.cancelled", { error_code: "run_timeout", state: "cancelled" });
  expect(s.onMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      parts: [expect.objectContaining({ data: expect.objectContaining({ state: "cancelled", resolved: true }) })]
    })
  );
  expect(s.onMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      parts: expect.arrayContaining([{ type: "data-agent-notice", data: { code: "run_timeout" } }])
    })
  );
  await s.controller.actions.dispose();
});

it("accepts a late terminal receipt without retrying or disabling the next run", async () => {
  const s = await session();
  s.emit("tool.call", { tool_name: "execute_command", arguments: { command: "pwd" } });
  s.client.sendToolResult.mockRejectedValue(new AgentHttpError(409, '{"code":"tool_result_terminal"}'));
  await expect(
    s.controller.actions.receiveKokoFrame({
      type: "mcp.response",
      version: 1,
      resource_session_id: "resource",
      data: { jsonrpc: "2.0", id: "call", result: { content: [{ type: "text", text: "/tmp" }] } }
    })
  ).resolves.toBe(true);
  expect(s.client.sendToolResult).toHaveBeenCalledOnce();
  expect(s.onMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      parts: expect.arrayContaining([
        expect.objectContaining({ type: "data-agent-tool", data: expect.objectContaining({ status: "unknown" }) })
      ])
    })
  );
  expect(s.controller.state.available).toBe(true);
  expect(s.stop).not.toHaveBeenCalled();
  expect(s.client.cancel).not.toHaveBeenCalled();
  await s.controller.actions.sendMessage({ id: "next", role: "user", parts: [{ type: "text", text: "Continue" }] });
  expect(s.client.sendMessage).toHaveBeenCalledOnce();
  await s.controller.actions.dispose();
});

it.each(["timeout", "cancelled"])("preserves MCP %s through the relay", (status) => {
  const relay = new AgentToolRelay({ resourceSessionId: () => "resource", sendFrame: vi.fn() });
  relay.forwardAgentEvent({
    seq: 1,
    type: "tool.call",
    run_id: "run",
    tool_call_id: "call",
    payload: { tool_name: "execute_command", arguments: {} }
  });
  const result = relay.consumeKokoFrame({
    type: "mcp.response",
    version: 1,
    resource_session_id: "resource",
    data: {
      jsonrpc: "2.0",
      id: "call",
      result: {
        isError: true,
        content: [{ type: "text", text: "context deadline exceeded" }],
        _meta: { "com.jumpserver/agent": { status } }
      }
    }
  });
  expect(result?.payload?.status).toBe(status);
});

it.each(["timeout", "unknown"])("presents %s as its own tool outcome", (status) => {
  const message = agentEventToUiMessage(
    { seq: 1, type: "tool.result", tool_call_id: "call", payload: { status, done: true } },
    "terminal",
    {}
  );
  expect(message).toMatchObject({
    parts: [
      { type: "data-execution", data: { outcome: status } },
      { type: "data-agent-tool", data: { status } }
    ]
  });
});

it("does not render a cancelled MCP result as an execution error", () => {
  expect(
    agentEventToUiMessage(
      {
        seq: 1,
        type: "tool.result",
        tool_call_id: "call",
        payload: { status: "cancelled", error: { message: "context canceled" }, done: true }
      },
      "terminal",
      {}
    )
  ).toMatchObject({ parts: [{ data: { outcome: "interrupted" } }, { data: { status: "cancelled" } }] });
});
