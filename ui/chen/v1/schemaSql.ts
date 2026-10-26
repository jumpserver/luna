import type { GoCatalogColumn, GoCatalogObject, GoCatalogInspect } from "./api";
import type { ChenCreateTableColumn } from "~/chen/types";
import { buildChenCreateTableSql, chenCreateTableTypes } from "~/chen/utils/createTableSql";
import { canonicalChenDialect } from "~/chen/utils/sqlDialect";
import { qualifiedObjectName, quoteIdentifier } from "./workspace";

export function createTableSql(object: GoCatalogObject, columns: ChenCreateTableColumn[], dialect: string) {
  const sql = buildChenCreateTableSql(object.name, columns, dialect);
  // The legacy builder quotes ClickHouse with ANSI quotes; normalize only its table identifier.
  const end = sql.indexOf(" (\n");
  if (end < 0) throw new Error("Invalid table definition");
  return `CREATE TABLE ${qualifiedObjectName({ ...object, name: object.name.trim() }, dialect)}${sql.slice(end)}`;
}
export type GoColumnAction = "add" | "rename" | "drop" | "alter";
export function canAlterColumnDefinition(dialect: string) {
  return !["mysql", "mariadb", "oceanbase-mysql"].includes(canonicalChenDialect(dialect) || dialect);
}
export function columnChangeSql(
  object: GoCatalogObject,
  dialect: string,
  action: GoColumnAction,
  original: GoCatalogColumn | undefined,
  input: { name: string; type: string; size: string; nullable: boolean }
) {
  const name = input.name.trim();
  if (!name || Array.from(name).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
    throw new Error("A column name is required");
  const table = qualifiedObjectName(object, dialect);
  const column = quoteIdentifier(name, dialect);
  const kind = canonicalChenDialect(dialect) || dialect;
  const previous = original && quoteIdentifier(original.name, dialect);
  if (action !== "add" && !previous) throw new Error("Select a column");
  if (action === "drop") return `ALTER TABLE ${table} DROP COLUMN ${previous};`;
  if (action === "rename") {
    if (name === original!.name) throw new Error("Enter a different column name");
    if (kind === "sqlserver") {
      const path = `${table}.${previous}`.replaceAll("'", "''");
      return `EXEC sp_rename N'${path}', N'${name.replaceAll("'", "''")}', 'COLUMN';`;
    }
    return `ALTER TABLE ${table} RENAME COLUMN ${previous} TO ${column};`;
  }
  if (action === "alter" && !canAlterColumnDefinition(kind))
    throw new Error("Use native DDL to preserve column attributes");
  const normalizeType = (value: string) =>
    value
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/^charactervarying/, "varchar");
  const inputDefinition = `${input.type}${input.size.trim() ? `(${input.size.replaceAll(/\s/g, "")})` : ""}`;
  const sameType = !!original && normalizeType(inputDefinition) === normalizeType(original.data_type);
  const nullChanged = !!original && input.nullable !== original.nullable;
  if (action === "alter" && sameType && ["postgresql", "db2"].includes(kind)) {
    if (!nullChanged) throw new Error("No structure changes to save");
    return `ALTER TABLE ${table} ALTER COLUMN ${previous} ${input.nullable ? "DROP" : "SET"} NOT NULL;`;
  }
  if (action === "alter" && sameType && !nullChanged) throw new Error("No structure changes to save");
  const type = chenCreateTableTypes(kind).find((item) => item.toLowerCase() === input.type.toLowerCase());
  if (!type) throw new Error("Select a supported type");
  const size = input.size.trim();
  if (size && !/^\d+(?:\s*,\s*\d+)?$/.test(size)) throw new Error("Invalid length or precision");
  const sized = `${type}${size ? `(${size.replaceAll(/\s/g, "")})` : ""}`;
  const definition =
    kind === "clickhouse"
      ? input.nullable
        ? `Nullable(${sized})`
        : sized
      : `${sized}${input.nullable ? " NULL" : " NOT NULL"}`;
  const oracle = ["oracle", "oceanbase-oracle", "dameng"].includes(kind);
  if (action === "add")
    return `ALTER TABLE ${table} ADD${oracle ? ` (${column} ${definition})` : ` ${kind === "sqlserver" ? "" : "COLUMN "}${column} ${definition}`};`;
  if (oracle) return `ALTER TABLE ${table} MODIFY (${previous} ${definition});`;
  if (kind === "sqlserver") return `ALTER TABLE ${table} ALTER COLUMN ${previous} ${definition};`;
  if (kind === "clickhouse") return `ALTER TABLE ${table} MODIFY COLUMN ${previous} ${definition};`;
  const parts = [
    `ALTER TABLE ${table} ALTER COLUMN ${previous} ${kind === "db2" ? "SET DATA TYPE" : "TYPE"} ${sized};`
  ];
  if (input.nullable !== original!.nullable)
    parts.push(`ALTER TABLE ${table} ALTER COLUMN ${previous} ${input.nullable ? "DROP" : "SET"} NOT NULL;`);
  return parts.join("\n");
}
export function droppableIndexes(metadata: GoCatalogInspect) {
  const rows = metadata.sections.indexes.items || [];
  const protectedNames = new Set((metadata.sections.primary_key.items || []).map((row) => String(row.name)));
  // ponytail: providers do not consistently identify constraint-backed indexes yet.
  // Keep all unique indexes protected until that metadata is available.
  for (const row of rows) {
    if (row.primary || row.unique || row.constraint || row.constraint_name || row.protected)
      protectedNames.add(String(row.name));
  }
  return [...new Set(rows.map((row) => String(row.name)))].filter(
    (name) => name && !protectedNames.has(name) && !/^PRIMARY$/i.test(name)
  );
}
