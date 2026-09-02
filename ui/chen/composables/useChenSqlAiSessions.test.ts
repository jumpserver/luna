import { describe, expect, it } from "vitest";
import {
  handleChenSqlAiWireMessage,
  registerChenSqlAiSession,
  unregisterChenSqlAiSession
} from "./useChenSqlAiSessions";

describe("Chen SQL AI proposals", () => {
  it("buffers a validated proposal until the user decides", () => {
    const paneId = "sql-proposal-pane";
    const session = registerChenSqlAiSession(
      paneId,
      () => true,
      () => null,
      () => ({ applied: true })
    )!;
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

    unregisterChenSqlAiSession(paneId);
  });
});
