import type { ChenTableStructureColumn } from "~/chen/types";

import { chenCreateTableTypes } from "~/chen/utils/createTableSql";

function quoteIdentifier(value: string, dbType: string) {
  const dialect = dbType.toLowerCase();
  if (dialect.includes("mysql") || dialect.includes("mariadb")) return `\`${value.replaceAll("`", "``")}\``;
  if (dialect.includes("sqlserver")) return `[${value.replaceAll("]", "]]")}]`;
  return `"${value.replaceAll('"', '""')}"`;
}

function identifier(value: string, label: string) {
  const result = value.trim();
  if (!result) throw new Error(`${label} is required`);
  if (Array.from(result).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new Error(`${label} contains an unsupported control character`);
  }
  return result;
}

function tableIdentifier(schema: string, table: string, dbType: string) {
  const parts = [schema.trim(), identifier(table, "Table name")].filter(Boolean);
  return parts.map((part) => quoteIdentifier(part, dbType)).join(".");
}

function columnDefinition(column: ChenTableStructureColumn, dbType: string) {
  const type = chenCreateTableTypes(dbType).find((item) => item.toLowerCase() === column.type.toLowerCase());
  const unchangedMetadataType =
    !column.added &&
    column.type.toLowerCase() === column.originalType.toLowerCase() &&
    /^[a-z][\w ]*$/i.test(column.type);
  if (!type && !unchangedMetadataType) {
    throw new Error(`Column “${column.name.trim() || column.originalName}” has an unsupported type`);
  }
  const size = column.size.trim();
  if (size && !/^\d+(?:\s*,\s*\d+)?$/.test(size)) {
    throw new Error(`Column “${column.name.trim() || column.originalName}” has an invalid length or precision`);
  }
  const sizedType = `${type || column.type}${size ? `(${size.replaceAll(/\s/g, "")})` : ""}`;
  if (dbType.toLowerCase().includes("clickhouse") && column.nullable) return `Nullable(${sizedType})`;
  return `${sizedType}${column.nullable ? " NULL" : " NOT NULL"}`;
}

export function buildChenAlterTableSql(
  schemaName: string,
  tableName: string,
  columns: ChenTableStructureColumn[],
  dbType: string
) {
  const table = tableIdentifier(schemaName, tableName, dbType);
  const dialect = dbType.toLowerCase();
  const mysql = dialect.includes("mysql") || dialect.includes("mariadb");
  const sqlServer = dialect.includes("sqlserver");
  const oracle = dialect.includes("oracle") || dialect.includes("dameng");
  const clickHouse = dialect.includes("clickhouse");
  const names = new Set<string>();
  const statements: string[] = [];

  for (const column of columns) {
    if (column.deleted) {
      if (!column.added)
        statements.push(`ALTER TABLE ${table} DROP COLUMN ${quoteIdentifier(column.originalName, dbType)};`);
      continue;
    }

    const name = identifier(column.name, "Column name");
    const nameKey = name.toLocaleLowerCase();
    if (names.has(nameKey)) throw new Error(`Column name “${name}” is duplicated`);
    names.add(nameKey);
    const definition = columnDefinition(column, dbType);

    if (column.added) {
      if (oracle) statements.push(`ALTER TABLE ${table} ADD (${quoteIdentifier(name, dbType)} ${definition});`);
      else {
        statements.push(
          `ALTER TABLE ${table} ADD${sqlServer ? "" : " COLUMN"} ${quoteIdentifier(name, dbType)} ${definition};`
        );
      }
      continue;
    }

    const renamed = name !== column.originalName;
    const definitionChanged =
      column.type.toLowerCase() !== column.originalType.toLowerCase() ||
      column.size.replaceAll(/\s/g, "") !== column.originalSize.replaceAll(/\s/g, "") ||
      column.nullable !== column.originalNullable;

    if (mysql && (renamed || definitionChanged)) {
      statements.push(
        `ALTER TABLE ${table} CHANGE COLUMN ${quoteIdentifier(column.originalName, dbType)} ${quoteIdentifier(name, dbType)} ${definition};`
      );
      continue;
    }
    if (renamed) {
      if (sqlServer) {
        const qualifiedColumn = `${schemaName ? `${schemaName}.` : ""}${tableName}.${column.originalName}`.replaceAll(
          "'",
          "''"
        );
        statements.push(`EXEC sp_rename '${qualifiedColumn}', '${name.replaceAll("'", "''")}', 'COLUMN';`);
      } else {
        statements.push(
          `ALTER TABLE ${table} RENAME COLUMN ${quoteIdentifier(column.originalName, dbType)} TO ${quoteIdentifier(name, dbType)};`
        );
      }
    }
    if (!definitionChanged) continue;

    if (oracle) statements.push(`ALTER TABLE ${table} MODIFY (${quoteIdentifier(name, dbType)} ${definition});`);
    else if (sqlServer || clickHouse) {
      statements.push(
        `ALTER TABLE ${table} ${clickHouse ? "MODIFY COLUMN" : "ALTER COLUMN"} ${quoteIdentifier(name, dbType)} ${definition};`
      );
    } else {
      if (column.type.toLowerCase() !== column.originalType.toLowerCase() || column.size !== column.originalSize) {
        statements.push(
          `ALTER TABLE ${table} ALTER COLUMN ${quoteIdentifier(name, dbType)} TYPE ${definition.split(" ")[0]};`
        );
      }
      if (column.nullable !== column.originalNullable) {
        statements.push(
          `ALTER TABLE ${table} ALTER COLUMN ${quoteIdentifier(name, dbType)} ${column.nullable ? "DROP" : "SET"} NOT NULL;`
        );
      }
    }
  }

  if (!statements.length) throw new Error("No structure changes to save");
  return statements.join("\n");
}
