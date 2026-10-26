import type { ChenSqlEditorContext, ChenSqlProposal } from "~/chen/composables/useChenSqlAiSessions";
import { describe, expect, it } from "vitest";
import { prepareGoSqlProposal } from "./sqlAi";

const context: ChenSqlEditorContext = {
  dialect: "postgresql",
  database: "db",
  schema: "public",
  nodeKey: "console-1",
  consoleId: "console-1",
  paneId: "workspace",
  tabId: "query",
  workspaceTabId: "query",
  workspaceTabKind: "query",
  currentContext: "db/public",
  revision: 9,
  selectionFrom: 7,
  selectionTo: 10,
  selectedSql: "old",
  documentSql: "SELECT old FROM t"
};
function proposal(target: ChenSqlProposal["base"]["target"] = "document"): ChenSqlProposal {
  return { sql: "SELECT new FROM t", originalSql: context.documentSql, base: { ...context, target } };
}
describe("Go SQL AI proposal application", () => {
  it("returns a document edit without executing SQL", () => {
    expect(prepareGoSqlProposal(proposal(), context)).toEqual({ target: "document", sql: "SELECT new FROM t" });
  });
  it("replaces only the approved original selection", () => {
    expect(prepareGoSqlProposal({ ...proposal("selection"), sql: "new", originalSql: "old" }, context)).toEqual({
      target: "selection",
      sql: "SELECT new FROM t"
    });
  });
  it.each([
    "paneId",
    "tabId",
    "nodeKey",
    "workspaceTabId",
    "workspaceTabKind",
    "currentContext",
    "database",
    "schema"
  ] as const)("rejects a proposal from another %s", (field) => {
    expect(
      prepareGoSqlProposal({ ...proposal(), base: { ...proposal().base, [field]: "another" } }, context)
    ).toBeNull();
  });
  it("rejects stale models even if text was edited then restored", () => {
    expect(prepareGoSqlProposal(proposal(), { ...context, revision: 11 })).toBeNull();
    expect(prepareGoSqlProposal(proposal("new_query"), { ...context, revision: 11 })).toBeNull();
  });
  it("rejects changed originals and invalid selection ranges", () => {
    expect(prepareGoSqlProposal({ ...proposal(), originalSql: "SELECT other" }, context)).toBeNull();
    for (const [from, to] of [
      [-1, 2],
      [1, 999],
      [2, 1],
      [1.5, 4]
    ]) {
      const value = proposal("selection");
      value.base.selectionFrom = from!;
      value.base.selectionTo = to!;
      expect(prepareGoSqlProposal(value, context)).toBeNull();
    }
    expect(prepareGoSqlProposal(proposal(), null)).toBeNull();
  });
});
