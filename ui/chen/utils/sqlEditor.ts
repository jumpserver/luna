import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { ChenSqlCompletionSource } from "~/chen/utils/sqlCompletion";
import { MariaSQL, MSSQL, MySQL, PLSQL, PostgreSQL, sql, StandardSQL } from "@codemirror/lang-sql";

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

export function chenSqlExtensions(dbType: string, completionSource?: ChenSqlCompletionSource): Extension {
  const dialect = chenSqlDialect(dbType);
  return [
    sql({ dialect }),
    completionSource ? dialect.language.data.of({ autocomplete: completionSource }) : []
  ];
}

export function replaceChenSqlDocument(editor: Pick<EditorView, "dispatch" | "state">, value: string) {
  if (editor.state.doc.toString() === value) return;
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
}
