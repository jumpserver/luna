import type { CompletionSource } from "@codemirror/autocomplete";

import { CompletionContext } from "@codemirror/autocomplete";
import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  chenSqlExtensions,
  chenSqlStatementAtCursor,
  chenSqlStatementRanges,
  executableChenSql
} from "~/chen/utils/sqlEditor";

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

describe("sql editor keyword completion", () => {
  async function completionLabels(keywordCase: "lower" | "upper") {
    const state = EditorState.create({
      doc: "sel",
      extensions: [chenSqlExtensions("postgresql", undefined, keywordCase)]
    });
    const sources = state.languageDataAt<CompletionSource>("autocomplete", state.doc.length);
    const results = await Promise.all(
      sources.map((source) => source(new CompletionContext(state, state.doc.length, true)))
    );
    return results.flatMap((result) => result?.options.map((option) => option.label) || []);
  }

  it("uses the configured keyword case", async () => {
    expect(await completionLabels("lower")).toContain("select");
    expect(await completionLabels("upper")).toContain("SELECT");
  });
});
