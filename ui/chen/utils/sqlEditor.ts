import type { EditorView } from "@codemirror/view";
import type { ChenSqlHints } from "~/chen/types";
import { MariaSQL, MSSQL, MySQL, PLSQL, PostgreSQL, StandardSQL } from "@codemirror/lang-sql";

function chenSqlDialect(dbType: string) {
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

export function chenSqlConfig(dbType: string, hints: ChenSqlHints) {
  return { dialect: chenSqlDialect(dbType), schema: hints };
}

export function replaceChenSqlDocument(editor: Pick<EditorView, "dispatch" | "state">, value: string) {
  if (editor.state.doc.toString() === value) return;
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
}
