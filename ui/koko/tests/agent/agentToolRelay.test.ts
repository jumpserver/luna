import { expect, it, vi } from "vitest";
import { AgentToolRelay } from "#koko/composables/agent/agentToolRelay";

function toolCall(toolCallId = "tool-1", rpcId = toolCallId) {
  return {
    seq: 1,
    type: "tool.call" as const,
    run_id: "run-1",
    tool_call_id: toolCallId,
    payload: {
      id: rpcId,
      revision: 3,
      tool_name: "execute_command",
      arguments: { command: "pwd" }
    }
  };
}

function toolResponse(toolCallId = "tool-1", rpcId = toolCallId) {
  return {
    type: "mcp.response",
    version: 1,
    resource_session_id: "resource-1",
    data: {
      jsonrpc: "2.0",
      id: rpcId,
      result: {
        resultType: "complete",
        content: [{ type: "text", text: "/tmp" }],
        _meta: { trace: "kept" }
      }
    }
  };
}

it("relays each tool call once and returns a session-bound structured result", () => {
  const sendFrame = vi.fn();
  const relay = new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame });
  const event = toolCall();

  relay.forwardAgentEvent(event);
  relay.forwardAgentEvent({ ...event, seq: 2 });
  expect(sendFrame).toHaveBeenCalledTimes(1);
  expect(sendFrame.mock.calls[0]?.[0]).toMatchObject({
    type: "mcp.request",
    resource_session_id: "resource-1",
    data: {
      method: "tools/call",
      params: {
        name: "execute_command",
        arguments: { command: "pwd" },
        _meta: {
          "com.jumpserver/agent": {
            resource_session_id: "resource-1",
            tool_call_id: "tool-1",
            revision: 3
          }
        }
      }
    }
  });

  const response = toolResponse();
  const delivery = relay.consumeKokoFrame(response);
  expect(delivery?.payload).toEqual({
    jsonrpc: "2.0",
    id: "tool-1",
    run_id: "run-1",
    seq: 1,
    done: true,
    status: "success",
    result: response.data.result
  });
  expect(relay.consumeKokoFrame(response)).toBeNull();
  delivery?.complete(true);
  expect(relay.consumeKokoFrame(response)).toBeNull();
});

it("rejects a response that contains both a result and an error", () => {
  const relay = new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame: vi.fn() });
  relay.forwardAgentEvent(toolCall());
  expect(() =>
    relay.consumeKokoFrame({
      ...toolResponse(),
      data: { ...toolResponse().data, error: { code: -32603, message: "failed" } }
    })
  ).toThrow("exactly one result or error");
});

it("does not let an old completion mutate a reset relay generation", () => {
  const relay = new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame: vi.fn() });
  relay.forwardAgentEvent(toolCall());
  const oldDelivery = relay.consumeKokoFrame(toolResponse());
  relay.reset();
  relay.forwardAgentEvent(toolCall());
  const currentDelivery = relay.consumeKokoFrame(toolResponse());
  oldDelivery?.complete(false);
  expect(relay.consumeKokoFrame(toolResponse())).toBeNull();
  currentDelivery?.complete(true);
});

it("ignores delayed responses that no longer have live RPC correlation", () => {
  const relay = new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame: vi.fn() });
  relay.forwardAgentEvent(toolCall("tool-a", "rpc-a"));
  relay.reset();
  relay.forwardAgentEvent(toolCall("tool-b", "rpc-b"));
  expect(relay.consumeKokoFrame(toolResponse("tool-a", "rpc-a"))).toBeNull();
  expect(relay.consumeKokoFrame(toolResponse("tool-b", "rpc-b"))).toMatchObject({ toolCallId: "tool-b" });
});

it("forwards cancellation without execution credentials", () => {
  const sendFrame = vi.fn();
  const relay = new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame });
  relay.forwardAgentEvent(toolCall());
  relay.forwardAgentEvent({
    seq: 2,
    type: "tool.cancel",
    run_id: "run-1",
    tool_call_id: "tool-1",
    payload: { reason: "user" }
  });

  expect(sendFrame.mock.calls[1]?.[0]).toMatchObject({
    type: "mcp.cancel",
    data: {
      method: "notifications/cancelled",
      params: {
        requestId: "tool-1",
        reason: "user",
        _meta: {
          "com.jumpserver/agent": {
            resource_session_id: "resource-1",
            tool_call_id: "tool-1",
            revision: 3
          }
        }
      }
    }
  });
});

it("cancels every pending Koko execution with its saved RPC id", () => {
  const sendFrame = vi.fn();
  const relay = new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame });
  relay.forwardAgentEvent(toolCall("tool-1", "rpc-17"));
  expect(relay.cancelPending("agent_unavailable")).toBe(1);
  expect(sendFrame.mock.calls[1]?.[0]).toMatchObject({
    type: "mcp.cancel",
    data: { params: { requestId: "rpc-17", reason: "agent_unavailable" } }
  });
  expect(relay.cancelPending("agent_unavailable")).toBe(0);
});

it("discards tool responses after cancellation", () => {
  const relay = new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame: vi.fn() });
  relay.forwardAgentEvent(toolCall());
  relay.forwardAgentEvent({
    seq: 2,
    type: "tool.cancel",
    run_id: "run-1",
    tool_call_id: "tool-1",
    payload: { reason: "user" }
  });
  expect(relay.consumeKokoFrame(toolResponse())?.payload).toBeNull();
});
