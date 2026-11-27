import type { GoCatalogEntry, GoCatalogRelation, GoProgramRef, GoProgramSummary } from "./api";

export function isProgram(object: GoCatalogEntry): object is GoProgramSummary {
  return "ref" in object;
}

export function catalogRef(object: GoCatalogEntry): GoProgramRef | GoCatalogRelation {
  return isProgram(object) ? object.ref : object;
}

export function objectKey(object: GoCatalogEntry, sessionId?: string): string {
  const ref = catalogRef(object);
  // Logical identity survives reconnection. OIDs are evidence of a specific live instance.
  const identity: unknown[] = [ref.database, ref.schema, ref.kind, ref.name];
  if (ref.kind === "procedure" || ref.kind === "function") {
    identity.push((ref.input_types ?? []).map(({ schema, name }) => [schema, name]));
  } else if (ref.kind === "trigger") {
    identity.push(ref.table);
  }
  if (sessionId !== undefined) identity.unshift(sessionId);
  return JSON.stringify(identity);
}
