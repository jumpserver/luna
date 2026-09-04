import type { AgentClient } from "#koko/composables/agent/agentClient";
import type { AgentSseConnection, AgentSseOptions } from "#koko/composables/agent/agentSse";
import type { AgentDomain } from "#koko/composables/agent/types";
import { expect, it, vi } from "vitest";
import { AgentToolRelay } from "#koko/composables/agent/agentToolRelay";
import { agentEventToUiMessage, useAgentSession } from "#koko/composables/agent/useAgentSession";

function manifest() {
  return {
    profile: "terminal" as const,
    resourceSessionId: "resource-1",
    revision: 1,
    context: { generation: "a" },
    tools: []
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

it("stores and presents the tool names supplied for the Agent session", async () => {
  const onMessage = vi.fn();
  const client = {
    retainResource: vi.fn(),
    releaseResource: vi.fn(),
    bootstrap: vi.fn().mockResolvedValue({ csrf_token: "csrf" }),
    createSession: vi.fn().mockResolvedValue({ session_id: "agent-tools", after: 0 }),
    deleteSession: vi.fn().mockResolvedValue(undefined)
  } as unknown as AgentClient;
  const controller = useAgentSession({
    domain: "terminal",
    client,
    relay: new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame: vi.fn() }),
    messageMetadata: () => ({}),
    onMessage,
    onAvailability: vi.fn(),
    createSse: () => ({ start: vi.fn(), stop: vi.fn() }) as unknown as AgentSseConnection
  });
  const toolManifest = {
    ...manifest(),
    tools: [
      { name: "terminal_snapshot", inputSchema: { type: "object" } },
      { name: "execute_command", inputSchema: { type: "object" } }
    ]
  };

  await controller.actions.attachManifest(toolManifest);

  expect(controller.state.toolNames).toEqual(["terminal_snapshot", "execute_command"]);
  expect(onMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      parts: [
        {
          type: "data-capability",
          data: { enabled: true, tools: ["terminal_snapshot", "execute_command"] }
        }
      ]
    })
  );

  await controller.actions.dispose();
  expect(controller.state.toolNames).toEqual([]);
});

it("normalizes restored Agent tool definitions into display names", () => {
  const message = agentEventToUiMessage(
    {
      seq: 1,
      type: "session.created",
      payload: {
        tools: [
          { name: "terminal_snapshot", inputSchema: { type: "object" } },
          { name: "execute_command", inputSchema: { type: "object" } },
          { name: "execute_command", inputSchema: { type: "object" } },
          { inputSchema: { type: "object" } }
        ]
      }
    },
    "terminal",
    {}
  );

  expect(message).toMatchObject({
    parts: [
      {
        type: "data-capability",
        data: { enabled: true, tools: ["terminal_snapshot", "execute_command"] }
      }
    ]
  });
});

it("projects model and tool activity into session progress", () => {
  expect(
    agentEventToUiMessage({ seq: 1, type: "model.requested", payload: { round: 1 } }, "terminal", {})
  ).toMatchObject({ parts: [{ type: "data-progress", data: { code: "analyzing", state: "analyzing" } }] });
  expect(
    agentEventToUiMessage({ seq: 2, type: "model.requested", payload: { round: 2 } }, "terminal", {})
  ).toMatchObject({ parts: [{ type: "data-progress", data: { code: "planning", state: "planning" } }] });
  expect(
    agentEventToUiMessage(
      {
        seq: 3,
        type: "tool.call",
        tool_call_id: "tool-1",
        payload: { tool_name: "execute_command", arguments: { command: "free -h" } }
      },
      "terminal",
      {}
    )
  ).toMatchObject({
    parts: [
      {
        type: "data-progress",
        data: { toolCallId: "tool-1", tool_name: "execute_command", code: "executing", state: "executing" }
      },
      {
        type: "data-agent-tool",
        data: {
          id: "tool-1",
          toolCallId: "tool-1",
          domain: "terminal",
          toolName: "execute_command",
          status: "running"
        }
      }
    ]
  });
});

it("uses completed messages only for status even when they embed the full answer", () => {
  for (const payload of [
    { role: "assistant", parts: [{ type: "text", text: "Completed answer" }] },
    {
      message: {
        id: "embedded-answer",
        role: "assistant",
        parts: [{ type: "text", text: "Completed answer" }]
      }
    }
  ]) {
    const message = agentEventToUiMessage(
      { seq: 4, type: "message.completed", message_id: "answer-1", run_id: "run-1", payload },
      "sql",
      {}
    );

    expect(message).toMatchObject({
      metadata: { agentEventType: "message.completed" },
      parts: [{ type: "data-progress", data: { state: "completed" } }]
    });
    expect(message?.parts.some((part) => part.type === "text")).toBe(false);
  }
});

it("projects Chen SQL proposal tool results into the existing SQL review parts", () => {
  const proposal = {
    sql: "SELECT id FROM users",
    originalSql: "",
    explanation: "List users",
    base: { paneId: "pane-1", tabId: "", revision: 1, target: "new_query" }
  };
  const message = agentEventToUiMessage(
    {
      seq: 4,
      type: "tool.result",
      run_id: "run-sql",
      tool_call_id: "tool-sql",
      payload: {
        status: "success",
        result: {
          structuredContent: {
            kind: "proposal",
            analysis: { valid: true, statementCount: 1, riskLevel: 1 },
            proposal
          }
        }
      }
    },
    "sql",
    { domain: "sql" }
  );

  expect(message).toMatchObject({
    parts: [
      {
        type: "data-agent-tool",
        data: { id: "tool-sql", toolCallId: "tool-sql", domain: "sql", status: "success" }
      },
      { type: "data-sql-analysis", data: { valid: true, statementCount: 1, riskLevel: 1 } },
      { type: "data-sql-proposal", data: proposal }
    ]
  });
});

it("projects SQL tool calls with their arguments", () => {
  const message = agentEventToUiMessage(
    {
      seq: 3,
      type: "tool.call",
      tool_call_id: "tool-schema",
      payload: { tool_name: "inspect_schema", arguments: { query: "private_table" } }
    },
    "sql",
    { domain: "sql" }
  );

  expect(message).toMatchObject({
    parts: [
      {
        type: "data-progress",
        data: {
          toolCallId: "tool-schema",
          tool_name: "inspect_schema",
          code: "metadata_lookup",
          state: "metadata_lookup"
        }
      },
      {
        type: "data-agent-tool",
        data: {
          id: "tool-schema",
          toolCallId: "tool-schema",
          domain: "sql",
          toolName: "inspect_schema",
          status: "running",
          arguments: { query: "private_table" }
        }
      }
    ]
  });
  expect(JSON.stringify(message)).toContain("private_table");
});

it("projects cancelled tool calls as cancelled lifecycle updates", () => {
  expect(
    agentEventToUiMessage(
      {
        seq: 4,
        type: "tool.cancel",
        tool_call_id: "tool-schema",
        payload: { reason: "run cancelled" }
      },
      "sql",
      { domain: "sql" }
    )
  ).toMatchObject({
    parts: [
      {
        type: "data-agent-tool",
        data: { id: "tool-schema", toolCallId: "tool-schema", domain: "sql", status: "cancelled" }
      }
    ]
  });
});

it.each(["terminal", "sql", "file", "script"] satisfies AgentDomain[])(
  "projects %s tool results into the shared lifecycle part",
  (domain) => {
    const message = agentEventToUiMessage(
      {
        seq: 5,
        type: "tool.result",
        tool_call_id: `tool-${domain}`,
        payload: { status: "success", done: true, duration_ms: 42, result: { structuredContent: {} }, error: null }
      },
      domain,
      { domain }
    );

    expect(message?.parts).toContainEqual({
      type: "data-agent-tool",
      data: {
        id: `tool-${domain}`,
        toolCallId: `tool-${domain}`,
        domain,
        status: "success",
        result: { structuredContent: {} },
        durationMs: 42
      }
    });
  }
);

it("projects tool errors into the shared lifecycle result", () => {
  const message = agentEventToUiMessage(
    {
      seq: 6,
      type: "tool.result",
      tool_call_id: "tool-schema",
      payload: {
        status: "error",
        done: true,
        error: { code: -32602, message: "The active schema is protected" }
      }
    },
    "sql",
    { domain: "sql" }
  );

  expect(message?.parts).toContainEqual({
    type: "data-agent-tool",
    data: {
      id: "tool-schema",
      toolCallId: "tool-schema",
      domain: "sql",
      status: "error",
      error: { code: -32602, message: "The active schema is protected" }
    }
  });
});

it("maps UI messages and approvals to the strict Agent API DTO", async () => {
  let streamOptions!: AgentSseOptions;
  const onMessage = vi.fn();
  const client = {
    retainResource: vi.fn(),
    releaseResource: vi.fn(),
    bootstrap: vi.fn().mockResolvedValue({ csrf_token: "csrf" }),
    createSession: vi.fn().mockResolvedValue({ session_id: "agent-1", after: 1 }),
    sendMessage: vi.fn().mockResolvedValue({ message_id: "message-1", run_id: "run-1", cursor: 2 }),
    resolveApproval: vi.fn().mockResolvedValue(undefined),
    sendToolResult: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn().mockResolvedValue(undefined)
  } as unknown as AgentClient;
  const controller = useAgentSession({
    domain: "terminal",
    client,
    relay: new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame: vi.fn() }),
    messageMetadata: () => ({}),
    onMessage,
    onAvailability: vi.fn(),
    createSse: (options) => {
      streamOptions = options;
      return { start: vi.fn(), stop: vi.fn() } as unknown as AgentSseConnection;
    }
  });

  await controller.actions.attachManifest(manifest());
  onMessage.mockClear();
  await controller.actions.sendMessage({
    id: "message-1",
    role: "user",
    parts: [{ type: "text", text: "pwd" }]
  });
  expect(client.sendMessage).toHaveBeenCalledWith("agent-1", "resource-1", {
    message_id: "message-1",
    idempotency_key: "message-1",
    role: "user",
    parts: [{ type: "text", text: "pwd" }]
  });
  streamOptions.onEvent({
    seq: 2,
    type: "message.created",
    session_id: "agent-1",
    resource_session_id: "resource-1",
    message_id: "message-1",
    payload: { role: "user", text: "pwd" }
  });
  expect(onMessage).not.toHaveBeenCalled();

  streamOptions.onEvent({
    seq: 3,
    type: "approval.requested",
    session_id: "agent-1",
    resource_session_id: "resource-1",
    run_id: "run-1",
    tool_call_id: "tool-call-1",
    payload: {
      approval_id: "approval-1",
      digest: "sha256:digest",
      tool_name: "execute_command",
      arguments: { command: "rm trusted", execution: "pty", timeout_seconds: 45 },
      model_duration_ms: 2345,
      command: "echo untrusted",
      part_type: "data-metadata-approval",
      summary: "Review this command"
    }
  });
  expect(onMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      parts: [
        expect.objectContaining({
          type: "data-approval",
          data: expect.objectContaining({
            id: "approval-1",
            tool: "execute_command",
            command: "rm trusted",
            execution: "pty",
            timeoutSeconds: 45,
            rationale: "Review this command",
            planId: "run-1",
            stepId: "tool-call-1",
            executionId: "tool-call-1",
            decisionDurationMs: 2345
          })
        })
      ]
    })
  );
  await controller.actions.resolveApproval("approval-1", "approve");
  expect(client.resolveApproval).toHaveBeenCalledWith("agent-1", "resource-1", "approval-1", {
    decision: "approve",
    run_id: "run-1",
    digest: "sha256:digest"
  });
  streamOptions.onEvent({
    seq: 4,
    type: "approval.resolved",
    session_id: "agent-1",
    resource_session_id: "resource-1",
    run_id: "run-1",
    payload: { approval_id: "approval-1", digest: "sha256:digest", approved: true }
  });
  expect(onMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      parts: [
        expect.objectContaining({
          type: "data-approval",
          data: expect.objectContaining({
            id: "approval-1",
            command: "rm trusted",
            planId: "run-1",
            stepId: "tool-call-1",
            executionId: "tool-call-1",
            resolved: true,
            state: "approved"
          })
        })
      ]
    })
  );
  streamOptions.onEvent({
    seq: 5,
    type: "tool.result",
    session_id: "agent-1",
    resource_session_id: "resource-1",
    run_id: "run-1",
    tool_call_id: "tool-call-1",
    payload: {
      run_id: "run-1",
      tool_call_id: "tool-call-1",
      done: true,
      status: "success",
      duration_ms: 456,
      model_duration_ms: 2345,
      result: {
        execution: "background",
        exit_code: 0,
        output: "command output\n",
        output_truncated: false
      }
    }
  });
  expect(onMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      parts: [
        expect.objectContaining({
          type: "data-execution",
          data: expect.objectContaining({
            planId: "run-1",
            stepId: "tool-call-1",
            executionId: "tool-call-1",
            outcome: "success",
            execution: "background",
            exitCode: 0,
            output: "command output\n",
            outputTruncated: false,
            durationMs: 456,
            modelDurationMs: 2345
          })
        }),
        expect.objectContaining({
          type: "data-agent-tool",
          data: expect.objectContaining({
            id: "tool-call-1",
            domain: "terminal",
            status: "success",
            durationMs: 456
          })
        })
      ]
    })
  );
  streamOptions.onEvent({
    seq: 6,
    type: "model.completed",
    session_id: "agent-1",
    resource_session_id: "resource-1",
    run_id: "run-1",
    payload: { round: 2, duration_ms: 789 }
  });
  streamOptions.onEvent({
    seq: 7,
    type: "message.created",
    session_id: "agent-1",
    resource_session_id: "resource-1",
    run_id: "run-1",
    message_id: "answer-1",
    payload: { role: "assistant", text: "Done" }
  });
  expect(onMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      metadata: expect.objectContaining({ modelDurationMs: 789 }),
      parts: [{ type: "text", text: "Done" }]
    })
  );
  controller.actions.dispose();
});

it("projects trusted file tool arguments into approval UI data", () => {
  const message = agentEventToUiMessage(
    {
      seq: 7,
      type: "approval.requested",
      approval_id: "approval-file",
      payload: {
        approval_id: "approval-file",
        digest: "sha256:file",
        tool_name: "rename",
        arguments: {
          path: "/srv/app/a.conf",
          destination_path: "/srv/app/b.conf",
          expected_version: "version-1"
        },
        tool: "delete",
        path: "/untrusted"
      }
    },
    "file",
    { domain: "file" }
  );

  expect(message).toMatchObject({
    parts: [
      {
        type: "data-file-approval",
        data: {
          id: "approval-file",
          tool: "rename",
          path: "/srv/app/a.conf",
          destinationPath: "/srv/app/b.conf",
          expectedVersion: "version-1",
          arguments: {
            path: "/srv/app/a.conf",
            destination_path: "/srv/app/b.conf",
            expected_version: "version-1"
          }
        }
      }
    ]
  });
});

it("projects database schema arguments into the metadata approval card", () => {
  const message = agentEventToUiMessage(
    {
      seq: 8,
      type: "approval.requested",
      approval_id: "approval-schema",
      payload: {
        approval_id: "approval-schema",
        digest: "sha256:schema",
        tool_name: "database_schema",
        arguments: { query: "user", tables: ["users", "sessions", 1] }
      }
    },
    "terminal",
    {}
  );

  expect(message).toMatchObject({
    parts: [
      {
        type: "data-metadata-approval",
        data: {
          id: "approval-schema",
          tool: "database_schema",
          query: "user",
          tables: ["users", "sessions"]
        }
      }
    ]
  });
});

it("does not share an attach flight when a same-revision manifest changes digest", async () => {
  const staleCreate = deferred<{ session_id: string; after: number }>();
  const order: string[] = [];
  const createSession = vi
    .fn()
    .mockImplementationOnce(() => {
      order.push("create:stale");
      return staleCreate.promise;
    })
    .mockImplementationOnce(async () => {
      order.push("create:fresh");
      return { session_id: "agent-fresh", after: 0 };
    });
  const deleteSession = vi.fn(async (sessionId: string) => {
    order.push(`delete:${sessionId}`);
  });
  const client = {
    retainResource: vi.fn(),
    releaseResource: vi.fn(),
    bootstrap: vi.fn().mockResolvedValue({ csrf_token: "csrf" }),
    createSession,
    deleteSession
  } as unknown as AgentClient;
  const controller = useAgentSession({
    domain: "terminal",
    client,
    relay: new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame: vi.fn() }),
    messageMetadata: () => ({}),
    onMessage: vi.fn(),
    onAvailability: vi.fn(),
    createSse: () => ({ start: vi.fn(), stop: vi.fn() }) as unknown as AgentSseConnection
  });

  const first = controller.actions.attachManifest(manifest());
  const duplicate = controller.actions.attachManifest(manifest());
  await vi.waitFor(() => expect(createSession).toHaveBeenCalledOnce());
  const changedManifest = manifest();
  changedManifest.context.generation = "b";
  const next = controller.actions.attachManifest(changedManifest);
  staleCreate.resolve({ session_id: "agent-stale", after: 0 });
  await Promise.all([first, duplicate, next]);

  expect(createSession).toHaveBeenCalledTimes(2);
  expect(createSession).toHaveBeenLastCalledWith(changedManifest, "auto");
  expect(deleteSession).toHaveBeenCalledWith("agent-stale", "resource-1");
  expect(order.indexOf("delete:agent-stale")).toBeLessThan(order.indexOf("create:fresh"));
  expect(controller.state).toMatchObject({ agentSessionId: "agent-fresh", revision: 1, available: true });
  await controller.actions.dispose();
});

it("recreates a committed session when a same-revision manifest changes digest", async () => {
  const bootstrap = vi.fn().mockResolvedValue({ csrf_token: "csrf" });
  const createSession = vi
    .fn()
    .mockResolvedValueOnce({ session_id: "agent-old", after: 0 })
    .mockResolvedValueOnce({ session_id: "agent-new", after: 0 });
  const deleteSession = vi.fn().mockResolvedValue(undefined);
  const client = {
    retainResource: vi.fn(),
    releaseResource: vi.fn(),
    bootstrap,
    createSession,
    deleteSession
  } as unknown as AgentClient;
  const controller = useAgentSession({
    domain: "terminal",
    client,
    relay: new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame: vi.fn() }),
    messageMetadata: () => ({}),
    onMessage: vi.fn(),
    onAvailability: vi.fn(),
    createSse: () => ({ start: vi.fn(), stop: vi.fn() }) as unknown as AgentSseConnection
  });

  await controller.actions.attachManifest(manifest());
  const changedManifest = manifest();
  changedManifest.context.generation = "b";
  await controller.actions.attachManifest(changedManifest);

  expect(deleteSession).toHaveBeenCalledWith("agent-old", "resource-1");
  expect(bootstrap).toHaveBeenLastCalledWith("resource-1", true);
  expect(createSession).toHaveBeenLastCalledWith(changedManifest, "auto");
  expect(controller.state).toMatchObject({ agentSessionId: "agent-new", revision: 1, available: true });
  await controller.actions.dispose();
});

it("deletes a shared Agent session only after the final same-resource controller disposes", async () => {
  const deleteSession = vi.fn().mockResolvedValue(undefined);
  const releaseResource = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
  const client = {
    retainResource: vi.fn(),
    releaseResource,
    bootstrap: vi.fn().mockResolvedValue({
      csrf_token: "csrf",
      session_id: "agent-shared",
      cursor: 1,
      context_digest: "sha256:context",
      toolset_digest: "sha256:toolset"
    }),
    history: vi.fn().mockResolvedValue({
      events: [
        {
          seq: 1,
          type: "session.created",
          session_id: "agent-shared",
          resource_session_id: "resource-1",
          payload: {
            profile: "terminal",
            revision: 1,
            context: { generation: "a" },
            tools: [],
            context_digest: "sha256:context",
            toolset_digest: "sha256:toolset"
          }
        }
      ],
      next_cursor: 1,
      has_more: false
    }),
    deleteSession
  } as unknown as AgentClient;
  const createController = () =>
    useAgentSession({
      domain: "terminal",
      client,
      relay: new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame: vi.fn() }),
      messageMetadata: () => ({}),
      onMessage: vi.fn(),
      onAvailability: vi.fn(),
      createSse: () => ({ start: vi.fn(), stop: vi.fn() }) as unknown as AgentSseConnection
    });
  const owner = createController();
  const observer = createController();

  await Promise.all([owner.actions.attachManifest(manifest()), observer.actions.attachManifest(manifest())]);
  await observer.actions.dispose();

  expect(deleteSession).not.toHaveBeenCalled();
  expect(owner.state).toMatchObject({ agentSessionId: "agent-shared", available: true });
  await owner.actions.dispose();
  expect(deleteSession).toHaveBeenCalledWith("agent-shared", "resource-1");
});

it("resumes an existing Agent session through bounded history before SSE", async () => {
  let streamOptions!: AgentSseOptions;
  const onMessage = vi.fn();
  const onApprovalMode = vi.fn();
  const client = {
    retainResource: vi.fn(),
    releaseResource: vi.fn(),
    bootstrap: vi.fn().mockResolvedValue({ csrf_token: "csrf", session_id: "agent-existing", cursor: 3 }),
    createSession: vi.fn(),
    history: vi.fn().mockResolvedValue({
      events: [
        {
          seq: 1,
          type: "session.created",
          session_id: "agent-existing",
          resource_session_id: "resource-1",
          payload: {
            profile: "terminal",
            revision: 1,
            context: { generation: "a" },
            tools: [],
            approval_mode: "never",
            context_digest: "sha256:context",
            toolset_digest: "sha256:toolset"
          }
        },
        {
          seq: 2,
          type: "message.created",
          session_id: "agent-existing",
          resource_session_id: "resource-1",
          message_id: "answer-1",
          payload: { role: "user", text: "question" }
        },
        {
          seq: 3,
          type: "message.created",
          session_id: "agent-existing",
          resource_session_id: "resource-1",
          message_id: "answer-1",
          payload: { role: "assistant", text: "done" }
        }
      ],
      next_cursor: 3,
      has_more: false
    }),
    deleteSession: vi.fn().mockResolvedValue(undefined)
  } as unknown as AgentClient;
  const controller = useAgentSession({
    domain: "terminal",
    client,
    relay: new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame: vi.fn() }),
    messageMetadata: () => ({}),
    onMessage,
    onAvailability: vi.fn(),
    onApprovalMode,
    createSse: (options) => {
      streamOptions = options;
      return { start: vi.fn(), stop: vi.fn() } as unknown as AgentSseConnection;
    }
  });

  await controller.actions.attachManifest(manifest());
  expect(client.createSession).not.toHaveBeenCalled();
  expect(client.history).toHaveBeenCalledWith("agent-existing", "resource-1", 0);
  expect(streamOptions.after).toBe(3);
  expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ id: "agent-user-answer-1-2", role: "user" }));
  expect(onMessage).toHaveBeenCalledWith(
    expect.objectContaining({ id: "agent-assistant-answer-1-3", role: "assistant" })
  );
  expect(controller.state.approvalMode).toBe("never");
  expect(onApprovalMode).toHaveBeenCalledWith("never");
  controller.actions.dispose();
});

it("orders, deduplicates, and coalesces restored message deltas", async () => {
  let streamOptions!: AgentSseOptions;
  const onMessage = vi.fn();
  const onHistoryReset = vi.fn();
  const sqlManifest = { ...manifest(), profile: "sql" as const };
  const delta = (seq: number, text: string) => ({
    seq,
    type: "message.delta" as const,
    session_id: "agent-existing",
    resource_session_id: "resource-1",
    run_id: "run-1",
    message_id: "answer-1",
    payload: { role: "assistant", delta: text }
  });
  const client = {
    retainResource: vi.fn(),
    releaseResource: vi.fn(),
    bootstrap: vi.fn().mockResolvedValue({ csrf_token: "csrf", session_id: "agent-existing", cursor: 6 }),
    history: vi.fn().mockResolvedValue({
      events: [
        {
          seq: 1,
          type: "session.created",
          session_id: "agent-existing",
          resource_session_id: "resource-1",
          payload: {
            profile: "sql",
            revision: 1,
            context: { generation: "a" },
            tools: []
          }
        },
        {
          seq: 2,
          type: "message.created",
          session_id: "agent-existing",
          resource_session_id: "resource-1",
          message_id: "question-1",
          payload: { role: "user", text: "问题" }
        },
        delta(4, "复"),
        delta(3, "回"),
        delta(4, "复"),
        {
          seq: 5,
          type: "message.completed",
          session_id: "agent-existing",
          resource_session_id: "resource-1",
          run_id: "run-1",
          message_id: "answer-1",
          payload: { role: "assistant", content: "回复" }
        },
        {
          seq: 6,
          type: "run.completed",
          session_id: "agent-existing",
          resource_session_id: "resource-1",
          run_id: "run-1",
          payload: {}
        }
      ],
      next_cursor: 6,
      has_more: false
    }),
    deleteSession: vi.fn().mockResolvedValue(undefined)
  } as unknown as AgentClient;
  const controller = useAgentSession({
    domain: "sql",
    client,
    relay: new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame: vi.fn() }),
    messageMetadata: () => ({}),
    onMessage,
    onAvailability: vi.fn(),
    onHistoryReset,
    createSse: (options) => {
      streamOptions = options;
      return { start: vi.fn(), stop: vi.fn() } as unknown as AgentSseConnection;
    }
  });

  await controller.actions.attachManifest(sqlManifest);

  const restoredText = onMessage.mock.calls
    .map(([message]) => message)
    .filter((message) => message.role === "assistant")
    .flatMap((message) => message.parts || [])
    .flatMap((part) => (part.type === "text" ? [part.text] : []));
  expect(restoredText).toEqual(["回复"]);
  expect(onHistoryReset).toHaveBeenCalledOnce();
  expect(streamOptions.after).toBe(6);

  streamOptions.onUnavailable?.(new Error("reconnect"));
  onMessage.mockClear();
  onHistoryReset.mockClear();
  await controller.actions.attachManifest(sqlManifest);

  expect(onHistoryReset).toHaveBeenCalledOnce();
  expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ role: "user" }));
  const replayedText = onMessage.mock.calls
    .map(([message]) => message)
    .filter((message) => message.role === "assistant")
    .flatMap((message) => message.parts || [])
    .flatMap((part) => (part.type === "text" ? [part.text] : []));
  expect(replayedText).toContain("回复");
  await controller.actions.dispose();
});

it("restores a resolved approval with its trusted invocation and stable timeline identity", async () => {
  const onMessage = vi.fn();
  const client = {
    retainResource: vi.fn(),
    releaseResource: vi.fn(),
    bootstrap: vi.fn().mockResolvedValue({ csrf_token: "csrf", session_id: "agent-existing", cursor: 3 }),
    history: vi.fn().mockResolvedValue({
      events: [
        {
          seq: 1,
          type: "session.created",
          session_id: "agent-existing",
          resource_session_id: "resource-1",
          payload: {
            profile: "terminal",
            revision: 1,
            context: { generation: "a" },
            tools: [],
            context_digest: "sha256:context",
            toolset_digest: "sha256:toolset"
          }
        },
        {
          seq: 2,
          type: "approval.requested",
          session_id: "agent-existing",
          resource_session_id: "resource-1",
          run_id: "run-1",
          tool_call_id: "tool-call-1",
          payload: {
            approval_id: "approval-1",
            digest: "sha256:digest",
            tool_name: "execute_command",
            arguments: { command: "rm trusted", execution: "pty" },
            summary: "Review this command"
          }
        },
        {
          seq: 3,
          type: "approval.resolved",
          session_id: "agent-existing",
          resource_session_id: "resource-1",
          run_id: "run-1",
          payload: { approval_id: "approval-1", digest: "sha256:digest", approved: true }
        }
      ],
      next_cursor: 3,
      has_more: false
    }),
    deleteSession: vi.fn().mockResolvedValue(undefined)
  } as unknown as AgentClient;
  const controller = useAgentSession({
    domain: "terminal",
    client,
    relay: new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame: vi.fn() }),
    messageMetadata: () => ({}),
    onMessage,
    onAvailability: vi.fn(),
    createSse: () => ({ start: vi.fn(), stop: vi.fn() }) as unknown as AgentSseConnection
  });

  await controller.actions.attachManifest(manifest());

  const resolved = onMessage.mock.calls
    .map(([message]) => message)
    .findLast((message) => message.parts?.some((part: { data?: { resolved?: boolean } }) => part.data?.resolved));
  expect(resolved).toMatchObject({
    parts: [
      {
        type: "data-approval",
        data: {
          id: "approval-1",
          tool: "execute_command",
          command: "rm trusted",
          rationale: "Review this command",
          planId: "run-1",
          stepId: "tool-call-1",
          executionId: "tool-call-1",
          resolved: true,
          state: "approved"
        }
      }
    ]
  });
  await controller.actions.dispose();
});

it.each([
  ["missing toolset", { profile: "terminal", revision: 1, context: { generation: "a" } }],
  [
    "mismatched context",
    {
      profile: "terminal",
      revision: 1,
      context: { generation: "different" },
      tools: []
    }
  ]
])("recreates an existing Agent session whose created event has a %s", async (_name, createdPayload) => {
  const deleteSession = vi.fn().mockResolvedValue(undefined);
  const createSession = vi.fn().mockResolvedValue({ session_id: "agent-recreated", after: 1 });
  const client = {
    retainResource: vi.fn(),
    releaseResource: vi.fn(),
    bootstrap: vi.fn().mockResolvedValue({ csrf_token: "csrf", session_id: "agent-existing", cursor: 1 }),
    history: vi.fn().mockResolvedValue({
      events: [
        {
          seq: 1,
          type: "session.created",
          session_id: "agent-existing",
          resource_session_id: "resource-1",
          payload: createdPayload
        }
      ],
      next_cursor: 1,
      has_more: false
    }),
    createSession,
    deleteSession
  } as unknown as AgentClient;
  const controller = useAgentSession({
    domain: "terminal",
    client,
    relay: new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame: vi.fn() }),
    messageMetadata: () => ({}),
    onMessage: vi.fn(),
    onAvailability: vi.fn(),
    createSse: () => ({ start: vi.fn(), stop: vi.fn() }) as unknown as AgentSseConnection
  });

  await controller.actions.attachManifest(manifest());

  expect(deleteSession).toHaveBeenCalledWith("agent-existing", "resource-1");
  expect(createSession).toHaveBeenCalledWith(manifest(), "auto");
  expect(controller.state.agentSessionId).toBe("agent-recreated");
  await controller.actions.dispose();
});

it("recreates an existing Agent session when history is missing session.created", async () => {
  const deleteSession = vi.fn().mockResolvedValue(undefined);
  const createSession = vi.fn().mockResolvedValue({ session_id: "agent-recreated", after: 1 });
  const client = {
    retainResource: vi.fn(),
    releaseResource: vi.fn(),
    bootstrap: vi.fn().mockResolvedValue({ csrf_token: "csrf", session_id: "agent-existing", cursor: 1 }),
    history: vi.fn().mockResolvedValue({
      events: [{ seq: 1, type: "heartbeat", payload: {} }],
      next_cursor: 1,
      has_more: false
    }),
    createSession,
    deleteSession
  } as unknown as AgentClient;
  const controller = useAgentSession({
    domain: "terminal",
    client,
    relay: new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame: vi.fn() }),
    messageMetadata: () => ({}),
    onMessage: vi.fn(),
    onAvailability: vi.fn(),
    createSse: () => ({ start: vi.fn(), stop: vi.fn() }) as unknown as AgentSseConnection
  });

  await controller.actions.attachManifest(manifest());

  expect(deleteSession).toHaveBeenCalledWith("agent-existing", "resource-1");
  expect(createSession).toHaveBeenCalledWith(manifest(), "auto");
  expect(controller.state.agentSessionId).toBe("agent-recreated");
  await controller.actions.dispose();
});

it("paginates beyond 1024 history events before opening SSE", async () => {
  let streamOptions!: AgentSseOptions;
  const totalEvents = 1_025;
  const history = vi.fn(async (_sessionId: string, _resourceSessionId: string, after = 0) => {
    const count = Math.min(256, totalEvents - after);
    const nextCursor = after + count;
    return {
      events: Array.from({ length: count }, (_, index) => {
        const seq = after + index + 1;
        return seq === 1
          ? {
              seq,
              type: "session.created" as const,
              session_id: "agent-existing",
              resource_session_id: "resource-1",
              payload: {
                profile: "terminal",
                revision: 1,
                context: { generation: "a" },
                tools: [],
                approval_mode: "auto",
                context_digest: "sha256:context",
                toolset_digest: "sha256:toolset"
              }
            }
          : {
              seq,
              type: "heartbeat" as const,
              session_id: "agent-existing",
              resource_session_id: "resource-1",
              payload: {}
            };
      }),
      next_cursor: nextCursor,
      has_more: nextCursor < totalEvents
    };
  });
  const client = {
    retainResource: vi.fn(),
    releaseResource: vi.fn(),
    bootstrap: vi.fn().mockResolvedValue({
      csrf_token: "csrf",
      session_id: "agent-existing",
      cursor: totalEvents,
      context_digest: "sha256:context",
      toolset_digest: "sha256:toolset"
    }),
    history,
    deleteSession: vi.fn().mockResolvedValue(undefined)
  } as unknown as AgentClient;
  const controller = useAgentSession({
    domain: "terminal",
    client,
    relay: new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame: vi.fn() }),
    messageMetadata: () => ({}),
    onMessage: vi.fn(),
    onAvailability: vi.fn(),
    createSse: (options) => {
      streamOptions = options;
      return { start: vi.fn(), stop: vi.fn() } as unknown as AgentSseConnection;
    }
  });

  await controller.actions.attachManifest(manifest());

  expect(history).toHaveBeenCalledTimes(5);
  expect(history.mock.calls.map(([, , after]) => after)).toEqual([0, 256, 512, 768, 1_024]);
  expect(streamOptions.after).toBe(totalEvents);
  controller.actions.dispose();
});

it("fails recovery when has_more does not advance the history cursor", async () => {
  const client = {
    retainResource: vi.fn(),
    releaseResource: vi.fn(),
    bootstrap: vi.fn().mockResolvedValue({ csrf_token: "csrf", session_id: "agent-existing", cursor: 1 }),
    history: vi.fn().mockResolvedValue({
      events: [{ seq: 1, type: "heartbeat", payload: {} }],
      next_cursor: 0,
      has_more: true
    }),
    deleteSession: vi.fn().mockResolvedValue(undefined)
  } as unknown as AgentClient;
  const controller = useAgentSession({
    domain: "terminal",
    client,
    relay: new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame: vi.fn() }),
    messageMetadata: () => ({}),
    onMessage: vi.fn(),
    onAvailability: vi.fn()
  });

  await expect(controller.actions.attachManifest(manifest())).rejects.toThrow("history cursor did not advance");
  expect(client.history).toHaveBeenCalledOnce();
  expect(controller.state.status).toBe("unavailable");
  controller.actions.dispose();
});

it("reports history_limit when bounded recovery bytes are exceeded", async () => {
  const client = {
    retainResource: vi.fn(),
    releaseResource: vi.fn(),
    bootstrap: vi.fn().mockResolvedValue({ csrf_token: "csrf", session_id: "agent-existing", cursor: 1 }),
    history: vi.fn().mockResolvedValue({
      events: [{ seq: 1, type: "heartbeat", payload: { padding: "x".repeat(128) } }],
      next_cursor: 1,
      has_more: false
    }),
    deleteSession: vi.fn().mockResolvedValue(undefined)
  } as unknown as AgentClient;
  const controller = useAgentSession({
    domain: "terminal",
    client,
    relay: new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame: vi.fn() }),
    messageMetadata: () => ({}),
    onMessage: vi.fn(),
    onAvailability: vi.fn(),
    historyRecovery: { maxBytes: 64 }
  });

  await expect(controller.actions.attachManifest(manifest())).rejects.toThrow("bounded recovery limit");
  expect(controller.state.errorCode).toBe("history_limit");
  controller.actions.dispose();
});

it("does not relay stripped tool calls from an interrupted historical run", async () => {
  let streamOptions!: AgentSseOptions;
  const sendFrame = vi.fn();
  const client = {
    retainResource: vi.fn(),
    releaseResource: vi.fn(),
    bootstrap: vi.fn().mockResolvedValue({
      csrf_token: "csrf",
      session_id: "agent-existing",
      cursor: 3,
      context_digest: "sha256:context",
      toolset_digest: "sha256:toolset"
    }),
    history: vi.fn().mockResolvedValue({
      events: [
        {
          seq: 1,
          type: "session.created",
          session_id: "agent-existing",
          resource_session_id: "resource-1",
          payload: {
            profile: "terminal",
            revision: 1,
            context: { generation: "a" },
            tools: [],
            approval_mode: "auto",
            context_digest: "sha256:context",
            toolset_digest: "sha256:toolset"
          }
        },
        {
          seq: 2,
          type: "tool.call",
          session_id: "agent-existing",
          resource_session_id: "resource-1",
          run_id: "run-1",
          tool_call_id: "tool-1",
          payload: { tool_name: "execute_command", arguments: { command: "pwd" } }
        },
        {
          seq: 3,
          type: "run.interrupted",
          session_id: "agent-existing",
          resource_session_id: "resource-1",
          run_id: "run-1",
          payload: { reason: "Koko agent runtime restarted" }
        }
      ],
      next_cursor: 3,
      has_more: false
    }),
    deleteSession: vi.fn().mockResolvedValue(undefined)
  } as unknown as AgentClient;
  const controller = useAgentSession({
    domain: "terminal",
    client,
    relay: new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame }),
    messageMetadata: () => ({}),
    onMessage: vi.fn(),
    onAvailability: vi.fn(),
    createSse: (options) => {
      streamOptions = options;
      return { start: vi.fn(), stop: vi.fn() } as unknown as AgentSseConnection;
    }
  });

  await controller.actions.attachManifest(manifest());

  expect(sendFrame).not.toHaveBeenCalled();
  expect(streamOptions.after).toBe(3);
  controller.actions.dispose();
});

it("replays an unresolved tool token and its queued user message from live SSE", async () => {
  let streamOptions!: AgentSseOptions;
  const sendFrame = vi.fn();
  const onMessage = vi.fn();
  const client = {
    retainResource: vi.fn(),
    releaseResource: vi.fn(),
    bootstrap: vi.fn().mockResolvedValue({
      csrf_token: "csrf",
      session_id: "agent-existing",
      cursor: 4,
      context_digest: "sha256:context",
      toolset_digest: "sha256:toolset"
    }),
    history: vi.fn().mockResolvedValue({
      events: [
        {
          seq: 1,
          type: "session.created",
          session_id: "agent-existing",
          resource_session_id: "resource-1",
          payload: {
            profile: "terminal",
            revision: 1,
            context: { generation: "a" },
            tools: [],
            approval_mode: "auto",
            context_digest: "sha256:context",
            toolset_digest: "sha256:toolset"
          }
        },
        {
          seq: 3,
          type: "tool.call",
          session_id: "agent-existing",
          resource_session_id: "resource-1",
          run_id: "run-1",
          tool_call_id: "tool-1",
          payload: { tool_name: "execute_command", arguments: { command: "pwd" } }
        },
        {
          seq: 4,
          type: "message.created",
          session_id: "agent-existing",
          resource_session_id: "resource-1",
          message_id: "queued-message",
          payload: { role: "user", text: "then inspect the logs" }
        }
      ],
      next_cursor: 4,
      has_more: false
    }),
    deleteSession: vi.fn().mockResolvedValue(undefined)
  } as unknown as AgentClient;
  const controller = useAgentSession({
    domain: "terminal",
    client,
    relay: new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame }),
    messageMetadata: () => ({}),
    onMessage,
    onAvailability: vi.fn(),
    createSse: (options) => {
      streamOptions = options;
      return { start: vi.fn(), stop: vi.fn() } as unknown as AgentSseConnection;
    }
  });

  await controller.actions.attachManifest(manifest());
  expect(streamOptions.after).toBe(2);
  expect(sendFrame).not.toHaveBeenCalled();

  streamOptions.onEvent({
    seq: 3,
    type: "tool.call",
    session_id: "agent-existing",
    resource_session_id: "resource-1",
    run_id: "run-1",
    tool_call_id: "tool-1",
    payload: {
      tool_name: "execute_command",
      arguments: { command: "pwd" }
    }
  });
  expect(sendFrame).toHaveBeenCalledOnce();
  streamOptions.onEvent({
    seq: 4,
    type: "message.created",
    session_id: "agent-existing",
    resource_session_id: "resource-1",
    message_id: "queued-message",
    payload: { role: "user", text: "then inspect the logs" }
  });
  expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ id: "agent-user-queued-message-4", role: "user" }));
  controller.actions.dispose();
});

it("fills an expired SSE cursor gap from history before resuming", async () => {
  let streamOptions!: AgentSseOptions;
  const onMessage = vi.fn();
  const history = vi
    .fn()
    .mockResolvedValueOnce({
      events: [
        {
          seq: 1,
          type: "session.created",
          session_id: "agent-existing",
          resource_session_id: "resource-1",
          payload: {
            profile: "terminal",
            revision: 1,
            context: { generation: "a" },
            tools: [],
            approval_mode: "auto",
            context_digest: "sha256:context",
            toolset_digest: "sha256:toolset"
          }
        }
      ],
      next_cursor: 1,
      has_more: false
    })
    .mockResolvedValueOnce({
      events: [
        {
          seq: 2,
          type: "message.created",
          session_id: "agent-existing",
          resource_session_id: "resource-1",
          message_id: "gap-message",
          payload: { role: "assistant", text: "restored from history" }
        },
        {
          seq: 3,
          type: "heartbeat",
          session_id: "agent-existing",
          resource_session_id: "resource-1",
          payload: {}
        }
      ],
      next_cursor: 3,
      has_more: false
    });
  const client = {
    retainResource: vi.fn(),
    releaseResource: vi.fn(),
    bootstrap: vi.fn().mockResolvedValue({ csrf_token: "csrf", session_id: "agent-existing", cursor: 1 }),
    history,
    deleteSession: vi.fn().mockResolvedValue(undefined)
  } as unknown as AgentClient;
  const controller = useAgentSession({
    domain: "terminal",
    client,
    relay: new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame: vi.fn() }),
    messageMetadata: () => ({}),
    onMessage,
    onAvailability: vi.fn(),
    createSse: (options) => {
      streamOptions = options;
      return { start: vi.fn(), stop: vi.fn() } as unknown as AgentSseConnection;
    }
  });

  await controller.actions.attachManifest(manifest());
  expect(await streamOptions.onCursorExpired?.(1)).toBe(3);
  expect(history.mock.calls.map(([, , after]) => after)).toEqual([0, 1]);
  expect(onMessage).toHaveBeenCalledWith(
    expect.objectContaining({ id: "agent-assistant-gap-message-2", role: "assistant" })
  );
  expect(controller.state.lastSeq).toBe(3);
  await controller.actions.dispose();
});

it.each(["unavailable", "dispose"] as const)(
  "cancels pending Koko execution when the controller becomes %s",
  async (trigger) => {
    let streamOptions!: AgentSseOptions;
    const sendFrame = vi.fn();
    const client = {
      retainResource: vi.fn(),
      releaseResource: vi.fn(),
      bootstrap: vi.fn().mockResolvedValue({ csrf_token: "csrf" }),
      createSession: vi.fn().mockResolvedValue({ session_id: "agent-1", after: 0 }),
      deleteSession: vi.fn().mockResolvedValue(undefined)
    } as unknown as AgentClient;
    const controller = useAgentSession({
      domain: "terminal",
      client,
      relay: new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame }),
      messageMetadata: () => ({}),
      onMessage: vi.fn(),
      onAvailability: vi.fn(),
      createSse: (options) => {
        streamOptions = options;
        return { start: vi.fn(), stop: vi.fn() } as unknown as AgentSseConnection;
      }
    });

    await controller.actions.attachManifest(manifest());
    streamOptions.onEvent({
      seq: 1,
      type: "tool.call",
      session_id: "agent-1",
      resource_session_id: "resource-1",
      run_id: "run-1",
      tool_call_id: "tool-1",
      payload: {
        id: "rpc-1",
        tool_name: "execute_command",
        arguments: { command: "sleep 30" }
      }
    });

    if (trigger === "unavailable") streamOptions.onUnavailable?.(new Error("SSE reconnect window expired"));
    else await controller.actions.dispose();

    expect(sendFrame.mock.calls[1]?.[0]).toMatchObject({
      type: "mcp.cancel",
      data: {
        method: "notifications/cancelled",
        params: {
          requestId: "rpc-1",
          reason: trigger === "unavailable" ? "agent_unavailable" : "controller_disposed",
          _meta: { "com.jumpserver/agent": { tool_call_id: "tool-1", revision: 1 } }
        }
      }
    });
    if (trigger === "unavailable") await controller.actions.dispose();
  }
);

it("updates approval mode only after Agent Runtime accepts it and applies restored events", async () => {
  let streamOptions!: AgentSseOptions;
  const onApprovalMode = vi.fn();
  const client = {
    retainResource: vi.fn(),
    releaseResource: vi.fn(),
    bootstrap: vi.fn().mockResolvedValue({ csrf_token: "csrf" }),
    createSession: vi.fn().mockResolvedValue({ session_id: "agent-1", after: 0 }),
    setApprovalMode: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn().mockResolvedValue(undefined)
  } as unknown as AgentClient;
  const controller = useAgentSession({
    domain: "terminal",
    client,
    relay: new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame: vi.fn() }),
    messageMetadata: () => ({}),
    onMessage: vi.fn(),
    onAvailability: vi.fn(),
    onApprovalMode,
    createSse: (options) => {
      streamOptions = options;
      return { start: vi.fn(), stop: vi.fn() } as unknown as AgentSseConnection;
    }
  });

  await controller.actions.setApprovalMode("never");
  await controller.actions.attachManifest(manifest());
  expect(client.createSession).toHaveBeenCalledWith(manifest(), "never");

  await controller.actions.setApprovalMode("always");
  expect(controller.state.approvalMode).toBe("always");
  vi.mocked(client.setApprovalMode).mockRejectedValueOnce(new Error("HTTP 409"));
  await expect(controller.actions.setApprovalMode("auto")).rejects.toThrow("HTTP 409");
  expect(controller.state.approvalMode).toBe("always");

  streamOptions.onEvent({
    seq: 1,
    type: "session.approval_mode_changed",
    session_id: "agent-1",
    resource_session_id: "resource-1",
    payload: { previous: "always", current: "auto" }
  });
  expect(controller.state.approvalMode).toBe("auto");
  expect(onApprovalMode).toHaveBeenLastCalledWith("auto");
  controller.actions.dispose();
});

it("ignores a late failed result delivery from an old generation after attaching a replacement session", async () => {
  const delivery = deferred<void>();
  const streams: AgentSseOptions[] = [];
  const stops: Array<ReturnType<typeof vi.fn>> = [];
  const onUnavailable = vi.fn();
  const cancel = vi.fn().mockResolvedValue(undefined);
  const sendToolResult = vi.fn().mockImplementation(() => delivery.promise);
  const client = {
    retainResource: vi.fn(),
    releaseResource: vi.fn(),
    bootstrap: vi.fn().mockResolvedValue({ csrf_token: "csrf" }),
    createSession: vi
      .fn()
      .mockResolvedValueOnce({ session_id: "agent-a", after: 0 })
      .mockResolvedValueOnce({ session_id: "agent-b", after: 0 }),
    sendToolResult,
    cancel,
    deleteSession: vi.fn().mockResolvedValue(undefined)
  } as unknown as AgentClient;
  const controller = useAgentSession({
    domain: "terminal",
    client,
    relay: new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame: vi.fn() }),
    messageMetadata: () => ({}),
    onMessage: vi.fn(),
    onAvailability: vi.fn(),
    onUnavailable,
    toolResultRetry: { maxAttempts: 3, wait: vi.fn().mockResolvedValue(undefined) },
    createSse: (options) => {
      const stop = vi.fn();
      streams.push(options);
      stops.push(stop);
      return { start: vi.fn(), stop } as unknown as AgentSseConnection;
    }
  });

  await controller.actions.attachManifest(manifest());
  streams[0]!.onEvent({
    seq: 1,
    type: "tool.call",
    session_id: "agent-a",
    resource_session_id: "resource-1",
    run_id: "run-1",
    tool_call_id: "tool-1",
    payload: {
      tool_name: "execute_command",
      arguments: { command: "pwd" }
    }
  });
  const receiving = controller.actions.receiveKokoFrame({
    type: "mcp.response",
    version: 1,
    resource_session_id: "resource-1",
    data: {
      jsonrpc: "2.0",
      id: "tool-1",
      result: { resultType: "complete", content: [{ type: "text", text: "/tmp" }] }
    }
  });
  await vi.waitFor(() => expect(sendToolResult).toHaveBeenCalledOnce());

  const replacement = manifest();
  replacement.context.generation = "b";
  await controller.actions.attachManifest(replacement);
  expect(controller.state).toMatchObject({ agentSessionId: "agent-b", status: "connecting", available: true });

  delivery.reject(new Error("late Agent A result failure"));
  await expect(receiving).resolves.toBe(true);

  expect(sendToolResult).toHaveBeenCalledOnce();
  expect(sendToolResult).toHaveBeenCalledWith("agent-a", "resource-1", "tool-1", expect.any(Object));
  expect(cancel).not.toHaveBeenCalled();
  expect(stops[0]).toHaveBeenCalledOnce();
  expect(stops[1]).not.toHaveBeenCalled();
  expect(onUnavailable).not.toHaveBeenCalled();
  expect(controller.state).toMatchObject({
    agentSessionId: "agent-b",
    status: "connecting",
    available: true,
    errorCode: "",
    errorText: ""
  });
  await controller.actions.dispose();
});

it("retries the identical tool result then cancels and disables an exhausted session", async () => {
  let streamOptions!: AgentSseOptions;
  const wait = vi.fn().mockResolvedValue(undefined);
  const onUnavailable = vi.fn();
  const sendToolResult = vi.fn().mockRejectedValue(new Error("network unavailable"));
  const client = {
    retainResource: vi.fn(),
    releaseResource: vi.fn(),
    bootstrap: vi.fn().mockResolvedValue({ csrf_token: "csrf" }),
    createSession: vi.fn().mockResolvedValue({ session_id: "agent-1", after: 0 }),
    sendToolResult,
    cancel: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn().mockResolvedValue(undefined)
  } as unknown as AgentClient;
  const relay = new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame: vi.fn() });
  const controller = useAgentSession({
    domain: "terminal",
    client,
    relay,
    messageMetadata: () => ({}),
    onMessage: vi.fn(),
    onAvailability: vi.fn(),
    onUnavailable,
    toolResultRetry: { maxAttempts: 3, baseDelayMs: 10, wait },
    createSse: (options) => {
      streamOptions = options;
      return { start: vi.fn(), stop: vi.fn() } as unknown as AgentSseConnection;
    }
  });

  await controller.actions.attachManifest(manifest());
  streamOptions.onEvent({
    seq: 1,
    type: "run.started",
    session_id: "agent-1",
    resource_session_id: "resource-1",
    run_id: "run-1",
    payload: {}
  });
  streamOptions.onEvent({
    seq: 2,
    type: "tool.call",
    session_id: "agent-1",
    resource_session_id: "resource-1",
    run_id: "run-1",
    tool_call_id: "tool-1",
    payload: {
      tool_name: "execute_command",
      arguments: { command: "pwd" }
    }
  });

  await expect(
    controller.actions.receiveKokoFrame({
      type: "mcp.response",
      version: 1,
      resource_session_id: "resource-1",
      data: {
        jsonrpc: "2.0",
        id: "tool-1",
        result: { resultType: "complete", content: [{ type: "text", text: "/tmp" }] }
      }
    })
  ).rejects.toThrow("network unavailable");

  expect(sendToolResult).toHaveBeenCalledTimes(3);
  expect(sendToolResult.mock.calls[1]?.[3]).toBe(sendToolResult.mock.calls[0]?.[3]);
  expect(sendToolResult.mock.calls[2]?.[3]).toBe(sendToolResult.mock.calls[0]?.[3]);
  expect(wait.mock.calls.map(([delay]) => delay)).toEqual([10, 20]);
  expect(client.cancel).toHaveBeenCalledWith("agent-1", "resource-1", "run-1", "tool_result_failed");
  expect(controller.state.status).toBe("unavailable");
  expect(onUnavailable).toHaveBeenCalledOnce();
  controller.actions.dispose();
});

it("forwards an MCP error response as a completed tool result", async () => {
  let streamOptions!: AgentSseOptions;
  const stop = vi.fn();
  const onUnavailable = vi.fn();
  const client = {
    retainResource: vi.fn(),
    releaseResource: vi.fn(),
    bootstrap: vi.fn().mockResolvedValue({ csrf_token: "csrf" }),
    createSession: vi.fn().mockResolvedValue({ session_id: "agent-1", after: 0 }),
    sendToolResult: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn().mockResolvedValue(undefined)
  } as unknown as AgentClient;
  const relay = new AgentToolRelay({ resourceSessionId: () => "resource-1", sendFrame: vi.fn() });
  const controller = useAgentSession({
    domain: "terminal",
    client,
    relay,
    messageMetadata: () => ({}),
    onMessage: vi.fn(),
    onAvailability: vi.fn(),
    onUnavailable,
    createSse: (options) => {
      streamOptions = options;
      return { start: vi.fn(), stop } as unknown as AgentSseConnection;
    }
  });

  await controller.actions.attachManifest(manifest());
  streamOptions.onEvent({
    seq: 1,
    type: "run.started",
    session_id: "agent-1",
    resource_session_id: "resource-1",
    run_id: "run-1",
    payload: {}
  });
  streamOptions.onEvent({
    seq: 2,
    type: "tool.call",
    session_id: "agent-1",
    resource_session_id: "resource-1",
    run_id: "run-1",
    tool_call_id: "tool-1",
    payload: {
      tool_name: "execute_command",
      arguments: { command: "pwd" }
    }
  });

  const errorResponse = {
    type: "mcp.response",
    version: 1,
    resource_session_id: "resource-1",
    data: {
      jsonrpc: "2.0",
      id: "tool-1",
      error: { code: -32001, message: "tool execution failed" }
    }
  };
  await expect(controller.actions.receiveKokoFrame(errorResponse)).resolves.toBe(true);
  expect(client.sendToolResult).toHaveBeenCalledWith("agent-1", "resource-1", "tool-1", {
    jsonrpc: "2.0",
    id: "tool-1",
    run_id: "run-1",
    seq: 1,
    done: true,
    status: "error",
    error: { code: -32001, message: "tool execution failed" }
  });
  expect(client.cancel).not.toHaveBeenCalled();
  expect(stop).not.toHaveBeenCalled();
  expect(onUnavailable).not.toHaveBeenCalled();
  await expect(controller.actions.receiveKokoFrame(errorResponse)).resolves.toBe(false);
  controller.actions.dispose();
});
