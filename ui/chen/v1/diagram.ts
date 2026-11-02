import type { ChenSchemaDiagramForeignKey, ChenSchemaDiagramTable } from "~/chen/types/schemaOverview";
import type { GoCatalogInspect, GoCatalogObject, GoCatalogSection } from "./api";

export type DiagramStatus = "Complete" | "Partial" | "Unknown" | "Restricted" | "Unsupported";
type Row = NonNullable<GoCatalogSection["items"]>[number];
const text = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);
function ordinal(value: unknown): number | null {
  const number = typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value)) ? Number(value) : NaN;
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}
export function diagramObjectId(session: string, object: GoCatalogObject): string {
  return JSON.stringify([session, object.database, object.schema, object.name, object.kind]);
}
function sectionStatus(section?: GoCatalogSection): DiagramStatus {
  if (section?.source === "restricted") return "Restricted";
  if (!section || section.deferred) return "Unknown";
  if (section.error || section.truncated) return "Partial";
  if (!section.supported) return "Unsupported";
  return "Complete";
}
function groups(section?: GoCatalogSection): Row[][] {
  const result = new Map<string, Row[]>();
  for (const [index, row] of (section?.items || []).slice(0, 200).entries()) {
    const key = text(row.name) ? JSON.stringify([row.name]) : JSON.stringify([null, index]);
    const group = result.get(key) || [];
    group.push(row);
    result.set(key, group);
  }
  return [...result.values()].map((rows) =>
    rows.sort((a, b) => (ordinal(a.ordinal) ?? Infinity) - (ordinal(b.ordinal) ?? Infinity))
  );
}
function completeKey(rows: Row[], columns: Set<string>): boolean {
  const count = ordinal(rows[0]?.column_count);
  return (
    !!text(rows[0]?.name) &&
    count === rows.length &&
    rows.every(
      (row, index) =>
        ordinal(row.column_count) === count &&
        ordinal(row.ordinal) === index + 1 &&
        !!text(row.column) &&
        columns.has(String(row.column))
    ) &&
    new Set(rows.map((row) => row.column)).size === rows.length
  );
}

/** One authorized inspect only; no target probes or recursive catalog traversal. */
export function inspectDiagram(session: string, object: GoCatalogObject, dialect: string, info: GoCatalogInspect) {
  if (info.database !== object.database || info.schema !== object.schema || info.table !== object.name) {
    throw new Error("catalog_scope_changed");
  }
  const source: ChenSchemaDiagramTable = {
    id: diagramObjectId(session, object),
    schema: object.schema,
    name: object.name,
    metadataStatus: "Current",
    database: object.database,
    columns: info.columns.slice(0, 200).map((column) => ({
      name: column.name,
      ordinal: ordinal(info.column_ordinals?.[column.name]),
      nativeType: text(column.data_type),
      nullable: column.nullable
    })),
    primaryKey: [],
    foreignKeys: []
  };
  const visible = new Set(source.columns.map((column) => column.name));
  const statuses = {
    columns: (info.columns_restricted
      ? "Restricted"
      : info.truncated || info.columns.length > 200
        ? "Partial"
        : source.columns.some((column) => column.ordinal === null)
          ? "Unknown"
          : "Complete") as DiagramStatus,
    primaryKey: sectionStatus(info.sections.primary_key),
    foreignKeys: sectionStatus(info.sections.foreign_keys)
  };
  const pkGroups = groups(info.sections.primary_key);
  if (pkGroups.length === 1 && statuses.primaryKey === "Complete" && completeKey(pkGroups[0]!, visible)) {
    source.primaryKey = pkGroups[0]!.map((row) => String(row.column));
  } else if (pkGroups.length && statuses.primaryKey === "Complete") statuses.primaryKey = "Partial";
  const targets = new Map<string, ChenSchemaDiagramTable>();
  // FK metadata in these dialects names a schema in the source database; MySQL schema is a database.
  const mysql = ["mysql", "mariadb", "oceanbase-mysql"].includes(dialect);
  const localDatabase = ["postgresql", "sqlserver", "oracle", "dameng", "oceanbase-oracle", "db2"].includes(dialect);
  for (const [index, rows] of groups(info.sections.foreign_keys).entries()) {
    const first = rows[0]!;
    const schema = text(first.referenced_schema);
    const name = text(first.referenced_table);
    const database = mysql ? schema : localDatabase ? object.database : null;
    const consistent = rows.every(
      (row) => text(row.referenced_schema) === schema && text(row.referenced_table) === name
    );
    const identityKnown = consistent && !!schema && !!name && !!database;
    const targetId = identityKnown
      ? diagramObjectId(session, { database, schema, name, kind: "table" })
      : JSON.stringify([source.id, "unknown-target", text(first.name), index]);
    const complete =
      statuses.foreignKeys === "Complete" &&
      completeKey(rows, visible) &&
      consistent &&
      identityKnown &&
      rows.every(
        (row) => !!text(row.referenced_column) && (targetId !== source.id || visible.has(String(row.referenced_column)))
      );
    const foreignKey: ChenSchemaDiagramForeignKey = {
      name: text(first.name) || "",
      columns: rows.map((row) => text(row.column) || "?"),
      referencedSchema: schema,
      referencedTable: name,
      referencedColumns: rows.map((row) => text(row.referenced_column) || "?"),
      referencedId: targetId,
      incomplete: !complete,
      ordinals: rows.map((row) => ordinal(row.ordinal))
    };
    source.foreignKeys.push(foreignKey);
    if (targetId === source.id) continue;
    const target =
      targets.get(targetId) ||
      ({
        id: targetId,
        database: database || undefined,
        schema: schema || "",
        name: name || "?",
        metadataStatus:
          !identityKnown || !consistent ? "Unknown" : database !== object.database ? "External" : "NotLoaded",
        columns: [],
        primaryKey: [],
        foreignKeys: []
      } satisfies ChenSchemaDiagramTable);
    // These are referenced column names only. Their type, nullability and physical ordinal are unknown.
    for (const row of rows) {
      const column = text(row.referenced_column);
      if (column && !target.columns.some((item) => item.name === column))
        target.columns.push({ name: column, ordinal: null, nativeType: null, nullable: null });
    }
    targets.set(targetId, target);
  }
  if (source.foreignKeys.some((key) => key.incomplete) && statuses.foreignKeys === "Complete")
    statuses.foreignKeys = "Partial";
  if ((info.sections.primary_key?.items?.length || 0) > 200) statuses.primaryKey = "Partial";
  if ((info.sections.foreign_keys?.items?.length || 0) > 200) statuses.foreignKeys = "Partial";
  return { tables: [source, ...targets.values()], statuses };
}
