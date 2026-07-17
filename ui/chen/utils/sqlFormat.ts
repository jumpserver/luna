import type { SqlLanguage } from "sql-formatter";
import { format } from "sql-formatter";

const formatterLanguageMap = {
  clickhouse: "sql",
  mariadb: "mariadb",
  mysql: "mysql",
  postgresql: "postgresql",
  oracle: "plsql",
  sqlserver: "tsql",
  db2: "db2",
  // ponytail: Dameng reuses PL/SQL only for display formatting. Add a dedicated
  // formatter before supporting stored procedures or Dameng-specific DDL.
  dameng: "plsql"
} as const;

export function formatChenSql(statement: string, dbType: string) {
  if (!statement.trim()) return statement;
  const normalizedDbType = dbType.trim().toLowerCase() as keyof typeof formatterLanguageMap;
  const language = formatterLanguageMap[normalizedDbType];
  try {
    return format(statement, { language: language as SqlLanguage });
  } catch {
    return statement;
  }
}
