import type { SqlLanguage } from "sql-formatter";

interface SqlDialectProfile {
  label: string;
  databaseNamespace: boolean;
  quote: "`" | '"' | "[";
  monaco: "mysql" | "pgsql" | "sql";
  formatter: SqlLanguage;
  preview: "limit" | "top" | "fetch" | "rownum";
  sample?: string;
}

export const chenSqlDialects = {
  mysql: { label: "MySQL", databaseNamespace: true, quote: "`", monaco: "mysql", formatter: "mysql", preview: "limit" },
  mariadb: {
    label: "MariaDB",
    databaseNamespace: true,
    quote: "`",
    monaco: "mysql",
    formatter: "mariadb",
    preview: "limit"
  },
  postgresql: {
    label: "PostgreSQL",
    databaseNamespace: false,
    quote: '"',
    monaco: "pgsql",
    formatter: "postgresql",
    preview: "limit"
  },
  oracle: {
    label: "Oracle",
    databaseNamespace: false,
    quote: '"',
    monaco: "sql",
    formatter: "plsql",
    preview: "rownum",
    sample: "SELECT 1 FROM DUAL;"
  },
  sqlserver: {
    label: "SQL Server",
    databaseNamespace: false,
    quote: "[",
    monaco: "sql",
    formatter: "tsql",
    preview: "top"
  },
  db2: {
    label: "Db2",
    databaseNamespace: false,
    quote: '"',
    monaco: "sql",
    formatter: "db2",
    preview: "fetch",
    sample: "SELECT 1 FROM SYSIBM.SYSDUMMY1;"
  },
  // ponytail: the installed formatter has no Dameng or ClickHouse grammar.
  // Use dedicated grammars when available; SQL execution and completion already
  // use the server's actual dialect, independently of this presentation fallback.
  dameng: {
    label: "Dameng",
    databaseNamespace: false,
    quote: '"',
    monaco: "sql",
    formatter: "plsql",
    preview: "limit",
    sample: "SELECT 1 FROM DUAL;"
  },
  clickhouse: {
    label: "ClickHouse",
    databaseNamespace: true,
    quote: "`",
    monaco: "mysql",
    formatter: "sql",
    preview: "limit"
  },
  "oceanbase-mysql": {
    label: "OceanBase · MySQL",
    databaseNamespace: true,
    quote: "`",
    monaco: "mysql",
    formatter: "mysql",
    preview: "limit"
  },
  "oceanbase-oracle": {
    label: "OceanBase · Oracle",
    databaseNamespace: false,
    quote: '"',
    monaco: "sql",
    formatter: "plsql",
    preview: "rownum",
    sample: "SELECT 1 FROM DUAL;"
  }
} as const satisfies Record<string, SqlDialectProfile>;

export type ChenSqlDialect = keyof typeof chenSqlDialects;

export function canonicalChenDialect(value: string): ChenSqlDialect | undefined {
  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, ChenSqlDialect> = {
    postgres: "postgresql",
    pgsql: "postgresql",
    mssql: "sqlserver",
    dm: "dameng",
    oceanbase: "oceanbase-mysql"
  };
  const canonical = aliases[normalized] || normalized;
  return Object.hasOwn(chenSqlDialects, canonical) ? (canonical as ChenSqlDialect) : undefined;
}

export function chenSqlDialect(value: string): SqlDialectProfile {
  const canonical = canonicalChenDialect(value);
  if (canonical) return chenSqlDialects[canonical];
  return { label: value, databaseNamespace: false, quote: '"', monaco: "sql", formatter: "sql", preview: "fetch" };
}

export function chenSampleSql(dialect: string): string {
  return chenSqlDialect(dialect).sample || "SELECT 1;";
}
