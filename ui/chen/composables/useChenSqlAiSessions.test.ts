import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentEventToUiMessage } from "#koko/composables/agent/useAgentSession";
import { installAgentSessionHarness } from "#koko/tests/agent/sessionHarness";
import {
  handleChenSqlAiWireMessage,
  handleChenSqlAiMessage,
  registerChenSqlAiSession,
  unregisterChenSqlAiSession
} from "./useChenSqlAiSessions";

let agentHarness: ReturnType<typeof installAgentSessionHarness>;
const paneIds: string[] = [];

beforeEach(() => {
  agentHarness = installAgentSessionHarness();
});

afterEach(() => {
  for (const paneId of paneIds.splice(0)) unregisterChenSqlAiSession(paneId);
  vi.restoreAllMocks();
});

describe("Chen SQL AI proposals", () => {
  it("buffers a validated proposal until the user decides", () => {
    const paneId = "sql-proposal-pane";
    const session = registerChenSqlAiSession(
      paneId,
      () => true,
      () => null,
      () => ({ applied: true })
    )!;
    paneIds.push(paneId);
    session.resourceSessionId = "sql-resource";
    session.proposalRequestIds.set("rpc-proposal", { toolCallId: "tool-proposal", runId: "run-1" });

    expect(
      handleChenSqlAiWireMessage(paneId, {
        type: "mcp.response",
        version: 1,
        resource_session_id: "sql-resource",
        data: {
          jsonrpc: "2.0",
          id: "rpc-proposal",
          result: {
            content: [],
            structuredContent: {
              kind: "proposal",
              analysis: { valid: true, statementCount: 1 },
              proposal: {
                sql: "SELECT 1",
                base: {
                  paneId,
                  tabId: "",
                  revision: 1,
                  target: "new_query",
                  selectionFrom: 0,
                  selectionTo: 0,
                  nodeKey: "database"
                }
              }
            }
          }
        }
      })
    ).toBe(true);

    expect(session.pendingProposalCalls.get("tool-proposal")?.proposal.sql).toBe("SELECT 1");
    expect(session.chat.messages.value.at(-1)?.parts).toContainEqual({
      type: "data-sql-proposal",
      data: expect.objectContaining({ sql: "SELECT 1", toolCallId: "tool-proposal" })
    });
  });

  it.each([
    ["run_timeout", "expired"],
    ["approval_expired", "expired"],
    ["", "cancelled"]
  ])("closes drafts on run cancellation (%s) and ignores late responses", (code, decision) => {
    const paneId = `sql-expiry-${code}`;
    const apply = vi.fn(() => ({ applied: true }));
    const session = registerChenSqlAiSession(
      paneId,
      () => true,
      () => null,
      apply
    )!;
    paneIds.push(paneId);
    session.resourceSessionId = "sql-resource";
    session.enabled = true;
    const proposal = {
      sql: "SELECT 1",
      base: {
        paneId,
        tabId: "",
        revision: 1,
        target: "new_query" as const,
        selectionFrom: 0,
        selectionTo: 0,
        nodeKey: "database"
      }
    };
    session.pendingProposalCalls.set("tool-1", {
      requestId: "rpc-1",
      runId: "run-1",
      resourceSessionId: "sql-resource",
      proposal
    });
    session.proposalRequestIds.set("rpc-late", { toolCallId: "tool-late", runId: "run-1" });
    session.proposalRequestIds.set("rpc-new", { toolCallId: "tool-new", runId: "run-2" });
    handleChenSqlAiMessage(
      paneId,
      agentEventToUiMessage(
        { seq: 1, type: "run.cancelled", run_id: "run-1", payload: { error_code: code } },
        "sql",
        {}
      )
    );
    expect(session.proposalDecisions.get("tool-1")).toBe(decision);
    expect(session.proposalDecisions.get("tool-late")).toBe(decision);
    expect(session.proposalRequestIds.has("rpc-new")).toBe(true);
    expect(session.applyProposal("tool-1").applied).toBe(false);
    expect(apply).not.toHaveBeenCalled();
    expect(session.pendingProposalCalls.size).toBe(0);
    const count = session.chat.messages.value.length;
    handleChenSqlAiWireMessage(paneId, {
      type: "mcp.response",
      version: 1,
      resource_session_id: "sql-resource",
      data: {
        jsonrpc: "2.0",
        id: "rpc-late",
        result: { content: [], structuredContent: { kind: "proposal", proposal } }
      }
    });
    expect(session.chat.messages.value).toHaveLength(count);
    expect(session.enabled).toBe(true);
    expect(session.errorCode).toBe("");
  });

  it("distinguishes tool cancellation from user rejection", () => {
    const paneId = "sql-cancel-pane";
    const session = registerChenSqlAiSession(
      paneId,
      () => true,
      () => null,
      () => ({ applied: true })
    )!;
    paneIds.push(paneId);
    session.resourceSessionId = "sql-resource";
    session.proposalRequestIds.set("rpc-1", { toolCallId: "tool-1", runId: "run-1" });
    handleChenSqlAiWireMessage(paneId, {
      type: "mcp.cancel_result",
      version: 1,
      resource_session_id: "sql-resource",
      data: { jsonrpc: "2.0", id: "rpc-1", result: { cancelled: true } }
    });
    expect(session.proposalDecisions.get("tool-1")).toBe("cancelled");
  });

  it("uses the server approval deadline and prevents an expired submission", () => {
    const paneId = "sql-approval-expiry";
    const session = registerChenSqlAiSession(
      paneId,
      () => true,
      () => null,
      () => ({ applied: true })
    )!;
    paneIds.push(paneId);
    const deadline = Date.now() + 90_000;
    const resolve = vi.spyOn(session.agent.actions, "resolveApproval");
    handleChenSqlAiMessage(
      paneId,
      agentEventToUiMessage(
        {
          seq: 1,
          type: "approval.requested",
          run_id: "run-1",
          approval_id: "approval-1",
          tool_call_id: "tool-1",
          payload: { tool_name: "inspect_schema", expires_at: new Date(deadline).toISOString() }
        },
        "sql",
        {}
      )
    );
    expect(session.metadataApproval?.expiresAt).toBe(deadline);
    expect(session.metadataApproval?.expiresInSeconds).toBeGreaterThan(88);
    expect(session.metadataApproval?.expiresInSeconds).toBeLessThanOrEqual(90);
    session.metadataApproval!.expiresAt = Date.now() - 1000;
    session.resolveMetadataApproval("approve_once");
    expect(resolve).not.toHaveBeenCalled();
    handleChenSqlAiMessage(
      paneId,
      agentEventToUiMessage(
        { seq: 1, type: "run.cancelled", run_id: "run-1", payload: { error_code: "approval_expired" } },
        "sql",
        {}
      )
    );
    expect(session.metadataApproval).toBeNull();
    expect(session.errorCode).toBe("");
  });

  it("keeps streamed SQL text ordered across progress events", async () => {
    const paneId = "sql-stream-pane";
    const session = registerChenSqlAiSession(
      paneId,
      () => true,
      () => ({
        dialect: "postgresql",
        nodeKey: "database",
        consoleId: "console-1",
        paneId,
        tabId: "tab-1",
        workspaceTabId: "workspace-1",
        workspaceTabKind: "query",
        currentContext: "database",
        revision: 1,
        selectionFrom: 0,
        selectionTo: 0,
        selectedSql: "",
        documentSql: ""
      }),
      () => ({ applied: true })
    )!;
    paneIds.push(paneId);
    session.errorCode = "agent_unavailable";
    session.errorText = "old error";
    session.chat.messages.value = [{ id: "stale", role: "assistant", parts: [{ type: "text", text: "旧会话" }] }];
    const resourceSessionId = await agentHarness.attach(handleChenSqlAiWireMessage, paneId, "sql");
    expect(session.chat.messages.value.some((message) => message.id === "stale")).toBe(false);
    expect(session.errorCode).toBe("");
    expect(session.errorText).toBe("");
    const request = session.request("generate", "生成查询");
    let requestFinished = false;
    void request.then(() => {
      requestFinished = true;
    });
    await vi.waitFor(() => expect(agentHarness.sendMessage).toHaveBeenCalledOnce());

    for (const text of ["正在", "生成"]) {
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
    agentHarness.emit(resourceSessionId, {
      type: "message.completed",
      run_id: "run-1",
      message_id: "answer-1",
      payload: {
        id: "answer-1",
        role: "assistant",
        status: "completed",
        content: "正在生成完成",
        parts: [{ type: "text", text: "正在生成完成" }]
      }
    });
    await vi.waitFor(() => {
      expect(session.chat.status.value).toBe("streaming");
      expect(session.taskActive).toBe(true);
      expect(requestFinished).toBe(false);
    });

    agentHarness.emit(resourceSessionId, {
      type: "run.completed",
      run_id: "run-1",
      message_id: "answer-1"
    });
    await request;

    const text = session.chat.messages.value
      .filter((message) => message.role === "assistant")
      .flatMap((message) => message.parts)
      .flatMap((part) => (part.type === "text" ? [part.text] : []));
    expect(text).toEqual(["正在生成", "完成"]);
  });
});
