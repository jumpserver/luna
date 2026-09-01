import type { AgentEvent, AgentDomain, AgentMcpTool } from "#koko/composables/agent/types";
import type { AgentSseOptions } from "#koko/composables/agent/agentSse";
import { vi } from "vitest";
import { agentClient } from "#koko/composables/agent/agentClient";
import { AgentSseConnection } from "#koko/composables/agent/agentSse";

type AgentWireHandler = (ownerId: string, message: unknown) => boolean;
type TestAgentEvent = Pick<AgentEvent, "type"> & Partial<Omit<AgentEvent, "type">>;

export function installAgentSessionHarness() {
  const streams = new Map<string, AgentSseOptions>();
  const sequenceByResource = new Map<string, number>();
  const bootstrap = vi.spyOn(agentClient, "bootstrap").mockImplementation(async (resourceSessionId) => ({
    csrf_token: `csrf:${resourceSessionId}`,
    expires_at: Date.now() + 20 * 60_000,
    refresh_at: Date.now() + 10 * 60_000,
    instance_id: "koko-agent-test",
    protocol_version: 1,
    capability_version: 1
  }));
  const createSession = vi.spyOn(agentClient, "createSession").mockImplementation(async (manifest) => ({
    session_id: `agent:${manifest.resourceSessionId}`,
    after: 0
  }));
  const sendMessage = vi
    .spyOn(agentClient, "sendMessage")
    .mockImplementation(async (_sessionId, _resourceId, message) => ({
      message_id: message.message_id,
      run_id: `run:${message.message_id}`,
      cursor: 0
    }));
  const resolveApproval = vi.spyOn(agentClient, "resolveApproval").mockResolvedValue(undefined);
  const setApprovalMode = vi.spyOn(agentClient, "setApprovalMode").mockResolvedValue(undefined);
  const sendToolResult = vi.spyOn(agentClient, "sendToolResult").mockResolvedValue(undefined);
  const cancel = vi.spyOn(agentClient, "cancel").mockResolvedValue(undefined);
  const deleteSession = vi.spyOn(agentClient, "deleteSession").mockResolvedValue(undefined);
  vi.spyOn(agentClient, "retainResource").mockImplementation(() => undefined);
  vi.spyOn(agentClient, "releaseResource").mockReturnValue(false);
  vi.spyOn(AgentSseConnection.prototype, "start").mockImplementation(function (this: AgentSseConnection) {
    const options = (this as unknown as { options: AgentSseOptions }).options;
    streams.set(options.resourceSessionId, options);
    options.onState?.("connected");
    return Promise.resolve();
  });

  async function attach(
    handler: AgentWireHandler,
    ownerId: string,
    profile: AgentDomain,
    resourceSessionId = `resource:${ownerId}`,
    tools: AgentMcpTool[] = []
  ) {
    const previousStream = streams.get(resourceSessionId);
    handler(ownerId, {
      type: "mcp.manifest",
      version: 1,
      resource_session_id: resourceSessionId,
      data: {
        profile,
        revision: 1,
        tools
      }
    });
    await vi.waitFor(() => {
      const stream = streams.get(resourceSessionId);
      if (!stream || stream === previousStream) throw new Error("Agent SSE was not created");
    });
    return resourceSessionId;
  }

  function emit(resourceSessionId: string, event: TestAgentEvent) {
    const stream = streams.get(resourceSessionId);
    if (!stream) throw new Error(`Missing Agent SSE for ${resourceSessionId}`);
    const previous = sequenceByResource.get(resourceSessionId) || 0;
    const seq = event.seq ?? previous + 1;
    sequenceByResource.set(resourceSessionId, Math.max(previous, seq));
    stream.onEvent({
      ...event,
      seq,
      session_id: event.session_id || `agent:${resourceSessionId}`,
      resource_session_id: event.resource_session_id || resourceSessionId,
      payload: event.payload || {}
    } as AgentEvent);
  }

  function unavailable(resourceSessionId: string, message = "Agent SSE unavailable") {
    const stream = streams.get(resourceSessionId);
    if (!stream) throw new Error(`Missing Agent SSE for ${resourceSessionId}`);
    stream.onState?.("unavailable");
    stream.onUnavailable?.(new Error(message));
  }

  return {
    attach,
    emit,
    unavailable,
    bootstrap,
    createSession,
    sendMessage,
    resolveApproval,
    setApprovalMode,
    sendToolResult,
    cancel,
    deleteSession
  };
}
