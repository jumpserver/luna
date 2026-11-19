import { format } from "sql-formatter";
import { chenSqlDialect } from "./sqlDialect";

export function formatChenSql(statement: string, dbType: string) {
  if (!statement.trim()) return statement;
  try {
    return format(statement, { language: chenSqlDialect(dbType).formatter });
  } catch {
    return statement;
  }
}
