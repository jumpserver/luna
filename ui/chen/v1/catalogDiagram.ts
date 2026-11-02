import type { GoCatalogObject } from "./api";
import type { ChenSchemaDiagramTable } from "~/chen/types/schemaOverview";
import { diagramObjectId } from "./diagram";

export interface DiagramOptions {
  database: string;
  schema: string;
  table?: string;
  direction: "schema" | "incoming";
  section: "nodes" | "edges";
  cursor?: string;
  limit?: number;
}
export interface DiagramEdge {
  name: string;
  source: GoCatalogObject;
  target: GoCatalogObject | null;
  target_openable: boolean;
  state: "complete" | "partial" | "restricted";
  pairs: { ordinal: number; source: string | null; target: string | null }[];
}
export interface DiagramPage {
  database: string;
  schema: string;
  table: string;
  direction: DiagramOptions["direction"];
  section: DiagramOptions["section"];
  state: "complete" | "partial" | "unsupported";
  source: string;
  visibility: "authorized_catalog";
  snapshot: false;
  sampled_at: string;
  items: { object?: GoCatalogObject; edge?: DiagramEdge }[];
  has_more: boolean;
  next_cursor?: string;
}
export const diagramBudget = { nodes: 500, edges: 500, pairs: 8192, bytes: 4 * 1024 * 1024 };
const name = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 256;
function object(v: unknown): v is GoCatalogObject {
  if (!v || typeof v !== "object") return false;
  const o = v as GoCatalogObject;
  return name(o.database) && name(o.schema) && name(o.name) && o.kind === "table";
}
export function parseDiagram(value: unknown, options: DiagramOptions): DiagramPage {
  const p = value as DiagramPage;
  if (
    !p ||
    p.database !== options.database ||
    p.schema !== options.schema ||
    p.table !== (options.table || "") ||
    p.direction !== options.direction ||
    p.section !== options.section ||
    !["complete", "partial", "unsupported"].includes(p.state) ||
    p.visibility !== "authorized_catalog" ||
    p.snapshot !== false ||
    !Array.isArray(p.items) ||
    p.items.length > 100 ||
    typeof p.has_more !== "boolean" ||
    (p.has_more && (!p.items.length || !p.next_cursor || p.next_cursor === options.cursor)) ||
    new TextEncoder().encode(JSON.stringify(p)).length > 530 * 1024
  )
    throw new Error("Invalid catalog diagram page");
  for (const item of p.items) {
    if (p.section === "nodes") {
      if (!object(item.object) || item.object.database !== p.database || item.edge)
        throw new Error("Invalid diagram object");
    } else {
      const e = item.edge;
      if (
        !e ||
        item.object ||
        !name(e.name) ||
        !object(e.source) ||
        e.source.database !== p.database ||
        (e.target !== null && !object(e.target)) ||
        typeof e.target_openable !== "boolean" ||
        (e.target_openable && (!e.target || e.target.database !== p.database)) ||
        !["complete", "partial", "restricted"].includes(e.state) ||
        !Array.isArray(e.pairs) ||
        e.pairs.length > 64 ||
        !e.pairs.length ||
        e.pairs.some(
          (pair, i) =>
            !Number.isInteger(pair.ordinal) ||
            pair.ordinal < 1 ||
            pair.ordinal > 64 ||
            (i > 0 && pair.ordinal <= e.pairs[i - 1]!.ordinal) ||
            (e.state === "complete" && pair.ordinal !== i + 1) ||
            (pair.source !== null && !name(pair.source)) ||
            (pair.target !== null && !name(pair.target))
        ) ||
        (e.state === "complete" && (!e.target || e.pairs.some((pair) => pair.source === null || pair.target === null)))
      )
        throw new Error("Invalid diagram constraint");
    }
  }
  return p;
}
export function diagramEdgeId(session: string, edge: DiagramEdge) {
  return JSON.stringify([diagramObjectId(session, edge.source), edge.name]);
}
export function catalogDiagramTables(
  session: string,
  objects: GoCatalogObject[],
  edges: DiagramEdge[]
): ChenSchemaDiagramTable[] {
  const tables = new Map<string, ChenSchemaDiagramTable>();
  function ensure(o: GoCatalogObject, openable: boolean) {
    const id = diagramObjectId(session, o);
    let table = tables.get(id);
    if (!table) {
      table = {
        id,
        database: o.database,
        schema: o.schema,
        name: o.name,
        object: openable ? o : undefined,
        openable,
        metadataStatus: openable ? "NotLoaded" : "External",
        columns: [],
        primaryKey: [],
        foreignKeys: []
      };
      tables.set(id, table);
    }
    return table;
  }
  objects.forEach((o) => ensure(o, true));
  for (const edge of edges) {
    const source = ensure(edge.source, true);
    let target: ChenSchemaDiagramTable;
    if (edge.target) target = ensure(edge.target, edge.target_openable);
    else {
      const id = `${diagramEdgeId(session, edge)}:restricted`;
      target = {
        id,
        schema: "",
        name: "?",
        metadataStatus: "Unknown",
        openable: false,
        columns: [],
        primaryKey: [],
        foreignKeys: []
      };
      tables.set(id, target);
    }
    for (const pair of edge.pairs) {
      for (const [node, column] of [
        [source, pair.source],
        [target, pair.target]
      ] as const) {
        if (column && !node.columns.some((c) => c.name === column))
          node.columns.push({ name: column, ordinal: null, nativeType: null, nullable: null });
      }
    }
    source.foreignKeys.push({
      name: edge.name,
      referencedId: target.id,
      referencedSchema: edge.target?.schema ?? null,
      referencedTable: edge.target?.name ?? null,
      columns: edge.pairs.map((p) => p.source ?? "?"),
      referencedColumns: edge.pairs.map((p) => p.target ?? "?"),
      ordinals: edge.pairs.map((p) => p.ordinal),
      incomplete: edge.state !== "complete"
    });
  }
  return [...tables.values()];
}
