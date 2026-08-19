import type { EditorState, Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { ChenSqlKeywordCase } from "~/chen/composables/useChenWorkspacePreferences";
import type { ChenSqlCompletionSource } from "~/chen/utils/sqlCompletion";
import { MariaSQL, MSSQL, MySQL, PLSQL, PostgreSQL, sql, StandardSQL } from "@codemirror/lang-sql";
import { syntaxTree } from "@codemirror/language";

export interface ChenSqlStatementRange {
  from: number;
  to: number;
  sql: string;
}

export function chenSqlDialect(dbType: string) {
  switch (dbType.trim().toLowerCase()) {
    case "mysql":
      return MySQL;
    case "mariadb":
      return MariaSQL;
    case "postgresql":
      return PostgreSQL;
    case "oracle":
      return PLSQL;
    case "sqlserver":
    case "sql server":
    case "mssql":
      return MSSQL;
    default:
      return StandardSQL;
  }
}

export function chenSqlExtensions(
  dbType: string,
  completionSource?: ChenSqlCompletionSource,
  sqlKeywordCase: ChenSqlKeywordCase = "lower"
): Extension {
  const dialect = chenSqlDialect(dbType);
  return [
    sql({ dialect, upperCaseKeywords: sqlKeywordCase === "upper" }),
    completionSource ? dialect.language.data.of({ autocomplete: completionSource }) : []
  ];
}

export function replaceChenSqlDocument(editor: Pick<EditorView, "dispatch" | "state">, value: string) {
  if (editor.state.doc.toString() === value) return;
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
}

export function chenSqlStatementRanges(state: EditorState): ChenSqlStatementRange[] {
  return syntaxTree(state)
    .topNode.getChildren("Statement")
    .map(({ from, to }) => ({ from, to, sql: state.doc.sliceString(from, to) }))
    .filter(({ sql }) => Boolean(sql.trim()));
}

export function chenSqlStatementAtCursor(state: EditorState, cursor = state.selection.main.head) {
  const position = Math.max(0, Math.min(cursor, state.doc.length));
  const line = state.doc.lineAt(position);

  for (const statement of chenSqlStatementRanges(state)) {
    if (position >= statement.from && position <= statement.to) return statement;
    if (position < statement.from && statement.from <= line.to) return statement;
    if (position > statement.to && statement.to >= line.from) return statement;
  }

  return null;
}

export function executableChenSql(state: EditorState) {
  const { from, to, head } = state.selection.main;
  if (from !== to) return state.doc.sliceString(from, to);
  return chenSqlStatementAtCursor(state, head)?.sql || "";
}
