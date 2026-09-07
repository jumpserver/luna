import type {
  ChenTableConstraint,
  ChenTableForeignKey,
  ChenTableIndex,
  ChenTableMetadata,
  ChenTableMetadataColumn,
  ChenTableMetadataSection
} from "~/chen/types/tableMetadata";

import { isNullableNumber, isNullableString, isRecord, isStringArray } from "./common";

export function parseTableMetadata(value: unknown): ChenTableMetadata {
  if (
    !isRecord(value) ||
    !(typeof value.catalog === "string" || value.catalog === null) ||
    typeof value.schema !== "string" ||
    typeof value.name !== "string" ||
    value.kind !== "table" ||
    !isRecord(value.capabilities) ||
    !Array.isArray(value.loadedSections) ||
    !Array.isArray(value.columns) ||
    !(isRecord(value.primaryKey) || value.primaryKey === null) ||
    !Array.isArray(value.foreignKeys) ||
    !Array.isArray(value.indexes) ||
    !Array.isArray(value.constraints) ||
    !isNullableString(value.ddl)
  ) {
    throw new Error("Chen returned malformed table metadata");
  }
  const capabilities = value.capabilities;
  const capabilityKeys = ["columns", "primaryKey", "foreignKeys", "indexes", "constraints", "ddl"] as const;
  if (!isRecord(capabilities) || capabilityKeys.some((key) => typeof capabilities[key] !== "boolean")) {
    throw new Error("Chen returned malformed table metadata");
  }
  const primaryKey = value.primaryKey;
  if (
    primaryKey &&
    (typeof primaryKey.name !== "string" ||
      !Array.isArray(primaryKey.columns) ||
      primaryKey.columns.some((column) => typeof column !== "string"))
  ) {
    throw new Error("Chen returned malformed table metadata");
  }
  return {
    catalog: value.catalog,
    schema: value.schema,
    name: value.name,
    kind: "table",
    capabilities: capabilities as unknown as ChenTableMetadata["capabilities"],
    loadedSections: value.loadedSections as ChenTableMetadataSection[],
    columns: value.columns.map(parseTableColumn),
    primaryKey: primaryKey as ChenTableMetadata["primaryKey"],
    foreignKeys: value.foreignKeys.map(parseTableForeignKey),
    indexes: value.indexes.map(parseTableIndex),
    constraints: value.constraints.map(parseTableConstraint),
    ddl: value.ddl
  };
}

function parseTableColumn(value: unknown): ChenTableMetadataColumn {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    typeof value.ordinal !== "number" ||
    typeof value.nativeType !== "string" ||
    typeof value.jdbcType !== "number" ||
    !isNullableNumber(value.size) ||
    !isNullableNumber(value.scale) ||
    typeof value.nullable !== "boolean" ||
    !isNullableString(value.defaultValue) ||
    !isNullableString(value.comment)
  ) {
    throw new Error("Chen returned malformed table metadata");
  }
  return value as unknown as ChenTableMetadataColumn;
}

function parseTableForeignKey(value: unknown): ChenTableForeignKey {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    !isStringArray(value.columns) ||
    !isNullableString(value.referencedCatalog) ||
    !isNullableString(value.referencedSchema) ||
    typeof value.referencedTable !== "string" ||
    !isStringArray(value.referencedColumns)
  ) {
    throw new Error("Chen returned malformed table metadata");
  }
  return value as unknown as ChenTableForeignKey;
}

function parseTableIndex(value: unknown): ChenTableIndex {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    typeof value.unique !== "boolean" ||
    !isNullableString(value.method) ||
    !Array.isArray(value.parts) ||
    !isNullableString(value.definition) ||
    value.parts.some(
      (part) =>
        !isRecord(part) ||
        typeof part.ordinal !== "number" ||
        !isNullableString(part.columnName) ||
        !isNullableString(part.expression) ||
        !isNullableString(part.sortOrder) ||
        typeof part.included !== "boolean"
    )
  ) {
    throw new Error("Chen returned malformed table metadata");
  }
  return value as unknown as ChenTableIndex;
}

function parseTableConstraint(value: unknown): ChenTableConstraint {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    !["PRIMARY KEY", "FOREIGN KEY", "UNIQUE", "CHECK"].includes(String(value.type)) ||
    !isStringArray(value.columns) ||
    !isNullableString(value.referencedCatalog) ||
    !isNullableString(value.referencedSchema) ||
    !isNullableString(value.referencedTable) ||
    !isStringArray(value.referencedColumns) ||
    !isNullableString(value.definition)
  ) {
    throw new Error("Chen returned malformed table metadata");
  }
  return value as unknown as ChenTableConstraint;
}
