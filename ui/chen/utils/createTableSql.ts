import type { ChenCreateTableColumn } from "~/chen/types";

const COMMON_TYPES = ["INTEGER", "BIGINT", "VARCHAR", "TEXT", "DECIMAL", "BOOLEAN", "DATE", "TIMESTAMP"];

export function chenCreateTableTypes(dbType: string) {
  const dialect = dbType.toLowerCase();
  if (dialect.includes("mysql") || dialect.includes("mariadb")) {
    return ["INT", "BIGINT", "VARCHAR", "TEXT", "DECIMAL", "BOOLEAN", "DATE", "DATETIME", "JSON"];
  }
  if (dialect.includes("postgres")) {
    return ["INTEGER", "BIGINT", "VARCHAR", "TEXT", "NUMERIC", "BOOLEAN", "DATE", "TIMESTAMP", "JSONB", "UUID"];
  }
  if (dialect.includes("sqlserver")) {
    return ["INT", "BIGINT", "VARCHAR", "NVARCHAR", "TEXT", "DECIMAL", "BIT", "DATE", "DATETIME2", "UNIQUEIDENTIFIER"];
  }
  if (dialect.includes("oracle") || dialect.includes("dameng")) {
    return ["NUMBER", "VARCHAR2", "NVARCHAR2", "CLOB", "DATE", "TIMESTAMP"];
  }
  if (dialect.includes("clickhouse")) {
    return ["Int32", "Int64", "UInt32", "UInt64", "String", "Decimal", "Boolean", "Date", "DateTime", "UUID"];
  }
  return COMMON_TYPES;
}

function quoteIdentifier(value: string, dbType: string) {
  const dialect = dbType.toLowerCase();
  if (dialect.includes("mysql") || dialect.includes("mariadb")) return `\`${value.replaceAll("`", "``")}\``;
  if (dialect.includes("sqlserver")) return `[${value.replaceAll("]", "]]")}]`;
  return `"${value.replaceAll('"', '""')}"`;
}

function normalizedIdentifier(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  if (Array.from(normalized).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new Error(`${label} contains an unsupported control character`);
  }
  return normalized;
}

export function buildChenCreateTableSql(tableName: string, columns: ChenCreateTableColumn[], dbType: string) {
  const normalizedTableName = normalizedIdentifier(tableName, "Table name");
  if (!columns.length) throw new Error("Add at least one column");

  const allowedTypes = new Map(chenCreateTableTypes(dbType).map((type) => [type.toLowerCase(), type]));
  const names = new Set<string>();
  const primaryKeys: string[] = [];
  const clickHouse = dbType.toLowerCase().includes("clickhouse");
  const definitions = columns.map((column, index) => {
    const name = normalizedIdentifier(column.name, `Column ${index + 1} name`);
    const normalizedKey = name.toLocaleLowerCase();
    if (names.has(normalizedKey)) throw new Error(`Column name “${name}” is duplicated`);
    names.add(normalizedKey);

    const type = allowedTypes.get(column.type.toLowerCase());
    if (!type) throw new Error(`Column “${name}” has an unsupported type`);
    const size = column.size.trim();
    if (size && !/^\d+(?:\s*,\s*\d+)?$/.test(size)) {
      throw new Error(`Column “${name}” has an invalid length or precision`);
    }

    const sizedType = `${type}${size ? `(${size.replaceAll(/\s/g, "")})` : ""}`;
    const columnType = clickHouse && column.nullable ? `Nullable(${sizedType})` : sizedType;
    if (column.primaryKey) primaryKeys.push(quoteIdentifier(name, dbType));
    return `  ${quoteIdentifier(name, dbType)} ${columnType}${clickHouse ? "" : column.nullable ? " NULL" : " NOT NULL"}`;
  });

  if (primaryKeys.length && !clickHouse) definitions.push(`  PRIMARY KEY (${primaryKeys.join(", ")})`);

  const statement = `CREATE TABLE ${quoteIdentifier(normalizedTableName, dbType)} (\n${definitions.join(",\n")}\n)`;
  if (!clickHouse) return `${statement};`;

  const orderBy = primaryKeys.length ? `(${primaryKeys.join(", ")})` : "tuple()";
  const primaryKey = primaryKeys.length ? `\nPRIMARY KEY ${orderBy}` : "";
  return `${statement}\nENGINE = MergeTree${primaryKey}\nORDER BY ${orderBy};`;
}
