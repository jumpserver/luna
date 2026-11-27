import type { GoCatalogRelation } from "./api";

export function objectKey(object: GoCatalogRelation, sessionId?: string): string {
  // Keep native identifiers intact, including quoted case and literal separators.
  const identity = [object.database, object.schema, object.kind, object.name];
  if (sessionId !== undefined) identity.unshift(sessionId);
  return JSON.stringify(identity);
}
