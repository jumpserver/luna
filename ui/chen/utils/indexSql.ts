export interface ChenCreateIndexInput {
  schema: string;
  table: string;
  name: string;
  columns: string[];
  unique: boolean;
  method?: string;
}

function identifier(value: string, label: string) {
  const result = value.trim();
  if (!result) throw new Error(`${label} is required`);
  if (Array.from(result).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new Error(`${label} contains an unsupported control character`);
  }
  return result;
}

function quoteIdentifier(value: string, dbType: string) {
  const dialect = dbType.toLowerCase();
  if (dialect.includes("mysql") || dialect.includes("mariadb")) return `\`${value.replaceAll("`", "``")}\``;
  if (dialect.includes("sqlserver")) return `[${value.replaceAll("]", "]]")}]`;
  return `"${value.replaceAll('"', '""')}"`;
}

function qualifiedName(schema: string, name: string, dbType: string) {
  return [schema.trim(), identifier(name, "Name")]
    .filter(Boolean)
    .map((part) => quoteIdentifier(part, dbType))
    .join(".");
}

export function chenIndexMethods(dbType: string) {
  const dialect = dbType.toLowerCase();
  if (dialect.includes("postgres")) return ["btree", "hash", "gin", "gist", "brin"];
  return [];
}

export function chenSupportsIndexDdl(dbType: string) {
  return !dbType.toLowerCase().includes("clickhouse");
}

export function buildChenCreateIndexSql(input: ChenCreateIndexInput, dbType: string) {
  if (!chenSupportsIndexDdl(dbType)) throw new Error("Index changes are not supported for this database type");
  const table = qualifiedName(input.schema, input.table, dbType);
  const name = quoteIdentifier(identifier(input.name, "Index name"), dbType);
  if (!input.columns.length) throw new Error("Select at least one column");
  const seen = new Set<string>();
  const columns = input.columns.map((column) => {
    const normalized = identifier(column, "Column name");
    const key = normalized.toLocaleLowerCase();
    if (seen.has(key)) throw new Error(`Column “${normalized}” is duplicated`);
    seen.add(key);
    return quoteIdentifier(normalized, dbType);
  });
  const methods = chenIndexMethods(dbType);
  const method = input.method?.trim().toLowerCase() || "";
  if (method && !methods.includes(method)) throw new Error(`Index method “${input.method}” is not supported`);
  const using = method ? ` USING ${method}` : "";
  return `CREATE${input.unique ? " UNIQUE" : ""} INDEX ${name} ON ${table}${using} (${columns.join(", ")});`;
}

export function buildChenDropIndexSql(schema: string, table: string, indexName: string, dbType: string) {
  if (!chenSupportsIndexDdl(dbType)) throw new Error("Index changes are not supported for this database type");
  const dialect = dbType.toLowerCase();
  const name = identifier(indexName, "Index name");
  if (dialect.includes("mysql") || dialect.includes("mariadb") || dialect.includes("sqlserver")) {
    return `DROP INDEX ${quoteIdentifier(name, dbType)} ON ${qualifiedName(schema, table, dbType)};`;
  }
  return `DROP INDEX ${qualifiedName(schema, name, dbType)};`;
}
