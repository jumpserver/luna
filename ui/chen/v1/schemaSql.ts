import type { GoCatalogColumn, GoCatalogInspect, GoCatalogObject } from "./api";
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
export function needsNativeColumnDefinition(dialect: string) {
  return ["mysql", "mariadb", "oceanbase-mysql"].includes(canonicalChenDialect(dialect) || dialect);
}
export function columnChangeSql(
  object: GoCatalogObject,
  dialect: string,
  action: GoColumnAction,
  original: GoCatalogColumn | undefined,
  input: { name: string; type: string; size: string; nullable: boolean },
  nativeDdl = ""
): string {
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
    if (needsNativeColumnDefinition(kind))
      return `ALTER TABLE ${table} CHANGE COLUMN ${previous} ${column} ${mysqlColumnDefinition(nativeDdl, original!.name)};`;
    if (kind === "sqlserver") {
      const path = `${table}.${previous}`.replaceAll("'", "''");
      return `EXEC sp_rename N'${path}', N'${name.replaceAll("'", "''")}', 'COLUMN';`;
    }
    return `ALTER TABLE ${table} RENAME COLUMN ${previous} TO ${column};`;
  }
  const normalizeType = (value: string) =>
    value
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/^charactervarying/, "varchar");
  const inputDefinition = `${input.type}${input.size.trim() ? `(${input.size.replaceAll(/\s/g, "")})` : ""}`;
  const sameType = !!original && normalizeType(inputDefinition) === normalizeType(original.data_type);
  const nullChanged = !!original && input.nullable !== original.nullable;
  if (action === "alter" && name !== original!.name && !needsNativeColumnDefinition(kind)) {
    const rename = columnChangeSql(object, dialect, "rename", original, input, nativeDdl);
    if (sameType && !nullChanged) return rename;
    return `${rename}\n${columnChangeSql(object, dialect, "alter", { ...original!, name }, input, nativeDdl)}`;
  }
  if (action === "alter" && sameType && ["postgresql", "db2"].includes(kind)) {
    if (!nullChanged) throw new Error("No structure changes to save");
    return `ALTER TABLE ${table} ALTER COLUMN ${previous} ${input.nullable ? "DROP" : "SET"} NOT NULL;`;
  }
  if (action === "alter" && sameType && !nullChanged && name === original!.name)
    throw new Error("No structure changes to save");
  const type = chenCreateTableTypes(kind).find((item) => item.toLowerCase() === input.type.toLowerCase());
  if (!type && !(action === "alter" && sameType)) throw new Error("Select a supported type");
  const size = input.size.trim();
  if (size && !/^\d+(?:\s*,\s*\d+)?$/.test(size) && !(action === "alter" && sameType))
    throw new Error("Invalid length or precision");
  const sized = type ? `${type}${size ? `(${size.replaceAll(/\s/g, "")})` : ""}` : original!.data_type;
  if (action === "alter" && needsNativeColumnDefinition(kind))
    return `ALTER TABLE ${table} ${name === original!.name ? `MODIFY COLUMN ${previous}` : `CHANGE COLUMN ${previous} ${column}`} ${changeMysqlColumnDefinition(
      mysqlColumnDefinition(nativeDdl, original!.name),
      sameType ? undefined : sized,
      input.nullable
    )};`;
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
// SHOW CREATE preserves attributes that a type/nullable form cannot reconstruct:
// defaults, generated expressions, charset/collation, comments and auto-increment.
function mysqlDefinitionTokens(sql: string) {
  const tokens: { value: string; start: number; end: number; depth: number; quoted: boolean }[] = [];
  let depth = 0;
  for (let offset = 0; offset < sql.length;) {
    if (/\s/.test(sql[offset]!)) {
      offset++;
      continue;
    }
    const start = offset;
    const quote = sql[offset]!;
    const quoted = ["'", '"', "`"].includes(quote);
    if (quoted) {
      offset++;
      let closed = false;
      while (offset < sql.length) {
        if (sql[offset] === "\\" && quote !== "`") {
          offset += 2;
          continue;
        }
        if (sql[offset++] !== quote) continue;
        if (sql[offset] === quote) {
          offset++;
          continue;
        }
        closed = true;
        break;
      }
      if (!closed) throw new Error("Unable to read complete DDL");
    } else if (sql.startsWith("/*", offset)) {
      const end = sql.indexOf("*/", offset + 2);
      if (end < 0) throw new Error("Unable to read complete DDL");
      offset = end + 2;
    } else if (/[\w$]/.test(quote)) {
      while (offset < sql.length && /[\w$]/.test(sql[offset]!)) offset++;
    } else offset++;
    const value = sql.slice(start, offset);
    if (value === ")") depth--;
    tokens.push({ value, start, end: offset, depth, quoted });
    if (value === "(") depth++;
  }
  return tokens;
}

export function mysqlColumnDefinition(ddl: string, name: string) {
  const tokens = mysqlDefinitionTokens(ddl);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.depth !== 1 || token.value !== quoteIdentifier(name, "mysql")) continue;
    const previous = tokens[i - 1];
    if (previous?.value !== "(" && previous?.value !== ",") continue;
    const end = tokens
      .slice(i + 1)
      .find((part) => (part.value === "," && part.depth === 1) || (part.value === ")" && part.depth === 0));
    if (end) return ddl.slice(token.end, end.start).trim();
  }
  throw new Error("Unable to read complete DDL");
}

function changeMysqlColumnDefinition(definition: string, type: string | undefined, nullable: boolean) {
  let tokens = mysqlDefinitionTokens(definition);
  if (!tokens.length) throw new Error("Unable to read complete DDL");
  if (type) {
    let end = tokens[0]!.end;
    let next = 1;
    if (/^(PRECISION|VARYING)$/i.test(tokens[next]?.value || "")) end = tokens[next++]!.end;
    if (tokens[next]?.value === "(") {
      const closing = tokens.slice(next + 1).find((token) => token.value === ")" && token.depth === 0);
      if (!closing) throw new Error("Unable to read complete DDL");
      end = closing.end;
    }
    definition = type + definition.slice(end);
    tokens = mysqlDefinitionTokens(definition);
  }
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.depth !== 0 || token.quoted) continue;
    if (/^(DEFAULT|COMMENT|AUTO_INCREMENT|ON|INVISIBLE|VISIBLE|COLUMN_FORMAT|STORAGE)$/i.test(token.value)) break;
    if (token.value.toUpperCase() !== "NULL") continue;
    const previous = tokens[i - 1]!;
    const start = previous.value.toUpperCase() === "NOT" ? previous.start : token.start;
    return definition.slice(0, start) + (nullable ? "NULL" : "NOT NULL") + definition.slice(token.end);
  }
  // SHOW CREATE may omit NULL on a nullable column. Insert the explicit clause
  // before DEFAULT and other attributes while preserving their exact spelling.
  const attribute = tokens.find(
    (token) =>
      token.depth === 0 &&
      !token.quoted &&
      /^(DEFAULT|COMMENT|AUTO_INCREMENT|ON|INVISIBLE|VISIBLE|COLUMN_FORMAT|STORAGE)$/i.test(token.value)
  );
  const end = attribute?.start ?? definition.length;
  return `${definition.slice(0, end).trimEnd()} ${nullable ? "NULL" : "NOT NULL"}${attribute ? ` ${definition.slice(end)}` : ""}`;
}

export function droppableIndexes(metadata: GoCatalogInspect) {
  const rows = metadata.sections.indexes.items || [];
  const protectedNames = new Set(
    [...(metadata.sections.primary_key.items || []), ...(metadata.sections.constraints?.items || [])].map((row) =>
      String(row.name)
    )
  );
  const flag = (value: unknown) => value === true || value === 1 || value === "1";
  for (const row of rows) {
    if (flag(row.primary) || flag(row.constraint) || row.constraint_name || flag(row.protected))
      protectedNames.add(String(row.name));
  }
  return [...new Set(rows.map((row) => String(row.name)))].filter(
    (name) => name && !protectedNames.has(name) && !/^PRIMARY$/i.test(name)
  );
}
