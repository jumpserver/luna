import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { chenSqlStatementAtCursor, chenSqlStatementRanges, executableChenSql } from "~/chen/utils/sqlEditor";

function sqlState(documentSql: string, anchor = 0, head = anchor) {
  return EditorState.create({
    doc: documentSql,
    selection: { anchor, head },
    extensions: [sql({ dialect: PostgreSQL })]
  });
}

describe("sql editor execution targets", () => {
  const documentSql = "select 'first;value';\n\nselect 2;";

  it("runs the statement containing the cursor", () => {
    const cursor = documentSql.indexOf("2");
    expect(executableChenSql(sqlState(documentSql, cursor))).toBe("select 2;");
  });

  it("prefers selected SQL", () => {
    expect(executableChenSql(sqlState(documentSql, 0, 6))).toBe("select");
  });

  it("does not turn a blank line into an execute-all target", () => {
    expect(executableChenSql(sqlState(documentSql, documentSql.indexOf("\n\n") + 1))).toBe("");
  });

  it("keeps semicolons inside strings in one statement", () => {
    expect(chenSqlStatementRanges(sqlState(documentSql)).map(({ sql }) => sql)).toEqual([
      "select 'first;value';",
      "select 2;"
    ]);
  });

  it("resolves leading and trailing whitespace on the statement line", () => {
    const state = sqlState("  select 1;   \n");
    expect(chenSqlStatementAtCursor(state, 0)?.sql).toBe("select 1;");
    expect(chenSqlStatementAtCursor(state, 13)?.sql).toBe("select 1;");
  });
});
