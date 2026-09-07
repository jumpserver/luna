import type {
  ChenQualifiedRelation,
  ChenRelationColumnsMetadata,
  ChenRelationMetadataPage
} from "~/chen/types/sqlMetadata";

import { isRecord } from "./common";

export function parseQualifiedRelation(value: unknown): ChenQualifiedRelation {
  if (
    !isRecord(value) ||
    !(typeof value.catalog === "string" || value.catalog === null) ||
    typeof value.schema !== "string" ||
    typeof value.name !== "string" ||
    !(value.kind === "table" || value.kind === "view" || value.kind === "materialized_view")
  ) {
    throw new Error("Chen returned malformed SQL relation metadata");
  }
  return {
    catalog: value.catalog,
    schema: value.schema,
    name: value.name,
    kind: value.kind
  };
}

export function parseSqlRelationsResponse(value: unknown): ChenRelationMetadataPage {
  if (!isRecord(value) || !Array.isArray(value.items) || typeof value.truncated !== "boolean") {
    throw new Error("Chen returned malformed SQL relation metadata");
  }

  return {
    items: value.items.map(parseQualifiedRelation),
    truncated: value.truncated
  };
}

export function parseSqlColumnsResponse(value: unknown): ChenRelationColumnsMetadata[] {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error("Chen returned malformed SQL column metadata");
  }

  return value.items.map((item) => {
    if (!isRecord(item) || !Array.isArray(item.columns)) {
      throw new Error("Chen returned malformed SQL column metadata");
    }
    return {
      relation: parseQualifiedRelation(item.relation),
      columns: item.columns.map((column) => {
        if (
          !isRecord(column) ||
          typeof column.name !== "string" ||
          !(typeof column.dataType === "string" || column.dataType === null) ||
          typeof column.nullable !== "boolean"
        ) {
          throw new Error("Chen returned malformed SQL column metadata");
        }
        return {
          name: column.name,
          dataType: column.dataType,
          nullable: column.nullable
        };
      })
    };
  });
}
