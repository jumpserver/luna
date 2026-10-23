import { describe, expect, it } from "vitest";
import { canonicalChenDialect, chenSampleSql, chenSqlDialect } from "~/chen/utils/sqlDialect";
import { formatChenSql } from "~/chen/utils/sqlFormat";
import { useGoChenProtocol } from "./routing";
import { objectSelect, qualifiedObjectName, quoteIdentifier } from "./workspace";

const dialectCases = [
  ["mysql", "`app`.`items`", "SELECT * FROM `app`.`items` LIMIT 200;", true],
  ["mariadb", "`app`.`items`", "SELECT * FROM `app`.`items` LIMIT 200;", true],
  ["postgresql", '"app"."items"', 'SELECT * FROM "app"."items" LIMIT 200;', false],
  ["oracle", '"app"."items"', 'SELECT * FROM "app"."items" WHERE ROWNUM <= 200;', false],
  ["sqlserver", "[app].[items]", "SELECT TOP (200) * FROM [app].[items];", false],
  ["db2", '"app"."items"', 'SELECT * FROM "app"."items" FETCH FIRST 200 ROWS ONLY;', false],
  ["dameng", '"app"."items"', 'SELECT * FROM "app"."items" LIMIT 200;', false],
  ["clickhouse", "`app`.`items`", "SELECT * FROM `app`.`items` LIMIT 200;", true],
  ["oceanbase-mysql", "`app`.`items`", "SELECT * FROM `app`.`items` LIMIT 200;", true],
  ["oceanbase-oracle", '"app"."items"', 'SELECT * FROM "app"."items" WHERE ROWNUM <= 200;', false]
] as const;
const object = { database: "database", schema: "app", name: "items", kind: "table" as const };

describe("read-only database dialects", () => {
  it.each(dialectCases)(
    "uses %s namespace, quoting and bounded preview syntax",
    (dialect, name, preview, databaseNamespace) => {
      expect(qualifiedObjectName(object, dialect)).toBe(name);
      expect(objectSelect(object, dialect)).toBe(`SELECT * FROM ${name};`);
      expect(objectSelect(object, dialect, true)).toBe(preview);
      expect(chenSqlDialect(dialect).databaseNamespace).toBe(databaseNamespace);
      expect(useGoChenProtocol(dialect, dialect)).toBe(true);
      expect(useGoChenProtocol(dialect, "")).toBe(false);
    }
  );

  it("keeps schema names separate from database names when a schema is unspecified", () => {
    expect(qualifiedObjectName({ ...object, schema: "" }, "oracle")).toBe('"items"');
    expect(qualifiedObjectName({ ...object, schema: "" }, "sqlserver")).toBe("[items]");
    expect(qualifiedObjectName({ ...object, schema: "" }, "clickhouse")).toBe("`database`.`items`");
  });

  it("escapes quote characters without splitting dotted or SQL-like identifiers", () => {
    const name = `a.b]; SELECT 'value'; --\n\`"`;
    expect(quoteIdentifier(name, "sqlserver")).toBe(`[a.b]]; SELECT 'value'; --\n\`"]`);
    expect(quoteIdentifier(name, "oracle")).toBe(`"a.b]; SELECT 'value'; --\n\`"""`);
    expect(quoteIdentifier(name, "oceanbase-mysql")).toBe("`a.b]; SELECT 'value'; --\n``\"`");
  });

  it("starts query consoles with a valid scalar SELECT for engines requiring FROM", () => {
    for (const dialect of ["oracle", "dameng", "oceanbase-oracle"])
      expect(chenSampleSql(dialect)).toBe("SELECT 1 FROM DUAL;");
    expect(chenSampleSql("db2")).toBe("SELECT 1 FROM SYSIBM.SYSDUMMY1;");
    for (const dialect of ["mysql", "mariadb", "postgresql", "sqlserver", "clickhouse", "oceanbase-mysql"])
      expect(chenSampleSql(dialect)).toBe("SELECT 1;");
  });

  it("canonicalizes deployment aliases while preserving OceanBase compatibility modes", () => {
    expect(canonicalChenDialect(" PGSQL ")).toBe("postgresql");
    expect(canonicalChenDialect("dm")).toBe("dameng");
    expect(canonicalChenDialect("mssql")).toBe("sqlserver");
    expect(canonicalChenDialect("oceanbase")).toBe("oceanbase-mysql");
    expect(canonicalChenDialect("oceanbase-oracle")).toBe("oceanbase-oracle");
    expect(canonicalChenDialect("__proto__")).toBeUndefined();
    expect(useGoChenProtocol("postgresql", "PGSQL")).toBe(true);
    expect(useGoChenProtocol("oceanbase-oracle", "oceanbase-mysql")).toBe(false);
  });

  it.each(dialectCases)(
    "formats %s query presentation without rewriting literals or quoted names",
    (dialect, _name, preview) => {
      const sql = preview.replace("*", "'9007199254740993; a.b' AS value");
      const formatted = formatChenSql(sql, dialect);
      expect(formatted.replace(/\s+/g, " ").trim()).toBe(sql);
      expect(formatChenSql("SELECT 'unterminated", dialect).replace(/\s+/g, " ")).toBe("SELECT 'unterminated");
    }
  );
});
