import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installAgentSessionHarness } from "#koko/tests/agent/sessionHarness";
import {
  handleChenSqlAiWireMessage,
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
    session.proposalRequestIds.set("rpc-proposal", "tool-proposal");

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
