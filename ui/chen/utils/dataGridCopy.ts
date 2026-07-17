import type { ChenDataViewField, ChenDataViewMeta } from "~/chen/types";

type ChenDataRow = Record<string, any>;

export function canUseChenCopy(canCopy: unknown) {
  return canCopy === true;
}

function normalizeDbType(dbType: string) {
  return dbType.trim().toLowerCase();
}

export function quoteChenIdentifier(dbType: string, identifier: string) {
  if (!identifier.trim()) {
    throw new Error("SQL identifier must not be blank");
  }
  for (const character of identifier) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) {
      throw new Error("SQL identifier must not contain control characters");
    }
  }

  switch (normalizeDbType(dbType)) {
    case "mysql":
    case "mariadb":
    case "clickhouse":
      return `\`${identifier.replaceAll("`", "``")}\``;
    case "sqlserver":
      return `[${identifier.replaceAll("]", "]]")}]`;
    case "postgresql":
    case "oracle":
    case "db2":
    case "dm":
    case "dameng":
      return `"${identifier.replaceAll("\"", "\"\"")}"`;
    default:
      throw new Error(`Unsupported database type: ${dbType}`);
  }
}

export function formatChenSqlLiteral(dbType: string, value: unknown) {
  if (value == null) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("SQL number must be finite");
    return String(value);
  }
  if (typeof value === "bigint") return String(value);
  if (typeof value === "boolean") {
    const numericBoolean = ["sqlserver", "oracle", "dm", "dameng"].includes(normalizeDbType(dbType));
    if (numericBoolean) return value ? "1" : "0";
    return value ? "TRUE" : "FALSE";
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function formatChenTsvValue(value: unknown) {
  const text = value == null ? "NULL" : String(value);
  if (!/[\t\r\n"]/.test(text)) return text;
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

export function formatChenTsv(rows: ChenDataRow[], fields: Pick<ChenDataViewField, "name">[]) {
  return rows
    .map((row) => fields.map((field) => formatChenTsvValue(row[field.name])).join("\t"))
    .join("\n");
}

function quoteTable(dbType: string, meta: ChenDataViewMeta) {
  if (!meta.schema || !meta.table) {
    throw new Error("DataView schema and table metadata are required");
  }
  return `${quoteChenIdentifier(dbType, meta.schema)}.${quoteChenIdentifier(dbType, meta.table)}`;
}

function fieldColumn(field: ChenDataViewField) {
  return field.columnName || field.name;
}

function isPrimaryKey(field: ChenDataViewField) {
  return field.isPrimaryKey === true || field.primaryKey === true;
}

export function hasChenPrimaryKey(fields: ChenDataViewField[]) {
  return fields.some(isPrimaryKey);
}

export function createChenInsertSql(
  dbType: string,
  meta: ChenDataViewMeta,
  fields: ChenDataViewField[],
  row: ChenDataRow
) {
  if (!fields.length) throw new Error("INSERT requires at least one field");
  const table = quoteTable(dbType, meta);
  const columns = fields.map((field) => quoteChenIdentifier(dbType, fieldColumn(field))).join(", ");
  const values = fields.map((field) => formatChenSqlLiteral(dbType, row[field.name])).join(", ");
  return `INSERT INTO ${table} (${columns}) VALUES (${values});`;
}

export function createChenUpdateSql(
  dbType: string,
  meta: ChenDataViewMeta,
  fields: ChenDataViewField[],
  row: ChenDataRow
) {
  const primaryFields = fields.filter(isPrimaryKey);
  if (!primaryFields.length) {
    throw new Error("UPDATE requires reliable primary key metadata");
  }

  const writableFields = fields.filter((field) => !isPrimaryKey(field));
  if (!writableFields.length) {
    throw new Error("UPDATE requires at least one writable field");
  }

  const table = quoteTable(dbType, meta);
  const assignments = writableFields.map((field) => {
    return `${quoteChenIdentifier(dbType, fieldColumn(field))} = ${formatChenSqlLiteral(dbType, row[field.name])}`;
  }).join(", ");
  const conditions = primaryFields.map((field) => {
    const identifier = quoteChenIdentifier(dbType, fieldColumn(field));
    const value = formatChenSqlLiteral(dbType, row[field.name]);
    return value === "NULL" ? `${identifier} IS NULL` : `${identifier} = ${value}`;
  }).join(" AND ");

  return `UPDATE ${table} SET ${assignments} WHERE ${conditions};`;
}
