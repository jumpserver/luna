import type { GoCatalogObject } from "./api";

export type OverviewSection = "tables" | "views" | "statistics" | "indexes" | "properties";
export type OverviewState =
  | "supported"
  | "unknown"
  | "unsupported"
  | "restricted"
  | "query_error"
  | "partial"
  | "truncated";
export interface OverviewValue {
  state: OverviewState;
  value: string | null;
  source?: string;
}
export interface OverviewRow {
  object: GoCatalogObject;
  name: string;
  ordinal?: number;
  fields: Record<string, OverviewValue>;
}
export interface GoOverview {
  database: string;
  schema: string;
  section: OverviewSection;
  state: OverviewState;
  sampled_at: string;
  snapshot: boolean;
  visibility: string;
  items: OverviewRow[];
  fields: Record<string, OverviewValue>;
  has_more: boolean;
  next_cursor?: string;
}
export interface OverviewOptions {
  database: string;
  schema: string;
  section: OverviewSection;
  q?: string;
  sort?: "name_asc" | "name_desc";
  cursor?: string;
  limit?: number;
}
export const overviewSections: OverviewSection[] = ["tables", "views", "statistics", "indexes", "properties"];
const states: OverviewState[] = [
  "supported",
  "unknown",
  "unsupported",
  "restricted",
  "query_error",
  "partial",
  "truncated"
];
function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function fields(v: unknown): v is Record<string, OverviewValue> {
  return (
    record(v) &&
    Object.values(v).every(
      (f) =>
        record(f) &&
        states.includes(f.state as OverviewState) &&
        (f.value === null || typeof f.value === "string") &&
        (f.source === undefined || typeof f.source === "string")
    )
  );
}
export function parseOverview(v: unknown): GoOverview {
  if (
    !record(v) ||
    typeof v.database !== "string" ||
    typeof v.schema !== "string" ||
    !overviewSections.includes(v.section as OverviewSection) ||
    !states.includes(v.state as OverviewState) ||
    typeof v.sampled_at !== "string" ||
    typeof v.snapshot !== "boolean" ||
    typeof v.visibility !== "string" ||
    !fields(v.fields) ||
    typeof v.has_more !== "boolean" ||
    (v.next_cursor !== undefined && typeof v.next_cursor !== "string") ||
    !Array.isArray(v.items) ||
    v.items.length > 200 ||
    v.items.some(
      (r) =>
        !record(r) ||
        !record(r.object) ||
        typeof r.object.database !== "string" ||
        typeof r.object.schema !== "string" ||
        typeof r.object.name !== "string" ||
        !["table", "view"].includes(String(r.object.kind)) ||
        typeof r.name !== "string" ||
        !fields(r.fields)
    ) ||
    (v.has_more && !v.next_cursor)
  )
    throw new Error("Malformed catalog overview");
  return v as unknown as GoOverview;
}
// Never round a decimal string through Number, including values above 2^53.
export function overviewNumber(value: string, locale: string) {
  return /^\d+$/.test(value) ? new Intl.NumberFormat(locale).format(BigInt(value)) : value;
}
export function overviewPageTotal(rows: OverviewRow[], key: string): OverviewValue {
  let total = 0n;
  let known = 0;
  for (const row of rows) {
    const v = row.fields[key];
    if (v?.state === "supported" && v.value !== null && /^\d+$/.test(v.value)) {
      total += BigInt(v.value);
      known++;
    }
  }
  return {
    value: known ? total.toString() : null,
    state: known === rows.length && known > 0 ? "supported" : known ? "partial" : "unknown"
  };
}
