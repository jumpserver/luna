import type {
  ChenSchemaDiagramTable,
  ChenSchemaMetadataSection,
  ChenSchemaOverview,
  ChenSchemaOverviewCapabilities,
  ChenSchemaOverviewIndex,
  ChenSchemaOverviewTable,
  ChenSchemaOverviewView
} from "~/chen/types/schemaOverview";

import { isNullableNumber, isNullableString, isRecord, isStringArray } from "./common";

export function parseSchemaOverview(value: unknown): ChenSchemaOverview {
  if (
    !isRecord(value) ||
    !(typeof value.catalog === "string" || value.catalog === null) ||
    typeof value.schema !== "string" ||
    !isRecord(value.capabilities) ||
    !Array.isArray(value.loadedSections) ||
    !Array.isArray(value.tables) ||
    !Array.isArray(value.views) ||
    !Array.isArray(value.statistics) ||
    !Array.isArray(value.indexes) ||
    !Array.isArray(value.diagram) ||
    !(typeof value.ddl === "string" || value.ddl === null)
  ) {
    throw new Error("Chen returned malformed schema overview metadata");
  }

  return {
    catalog: value.catalog,
    schema: value.schema,
    capabilities: parseSchemaOverviewCapabilities(value.capabilities),
    loadedSections: value.loadedSections as ChenSchemaMetadataSection[],
    tables: value.tables.map(parseSchemaOverviewTable),
    views: value.views.map(parseSchemaOverviewView),
    statistics: value.statistics.map((statistic) => {
      if (
        !isRecord(statistic) ||
        typeof statistic.schema !== "string" ||
        typeof statistic.table !== "string" ||
        !isNullableNumber(statistic.estimatedRows) ||
        !isNullableNumber(statistic.totalSizeBytes)
      ) {
        throw new Error("Chen returned malformed schema overview metadata");
      }
      return statistic as unknown as ChenSchemaOverview["statistics"][number];
    }),
    indexes: value.indexes.map(parseSchemaOverviewIndex),
    diagram: value.diagram.map(parseSchemaDiagramTable),
    ddl: value.ddl
  };
}

function parseSchemaOverviewCapabilities(value: Record<string, unknown>): ChenSchemaOverviewCapabilities {
  const keys = [
    "tableRows",
    "tableSize",
    "tableEngine",
    "tableCharacterSet",
    "tableCollation",
    "tableComment",
    "viewComment",
    "statistics",
    "indexes",
    "ddl",
    "diagram",
    "diagramRelationships"
  ] as const;
  if (keys.some((key) => typeof value[key] !== "boolean")) {
    throw new Error("Chen returned malformed schema overview metadata");
  }
  return {
    tableRows: value.tableRows as boolean,
    tableSize: value.tableSize as boolean,
    tableEngine: value.tableEngine as boolean,
    tableCharacterSet: value.tableCharacterSet as boolean,
    tableCollation: value.tableCollation as boolean,
    tableComment: value.tableComment as boolean,
    viewComment: value.viewComment as boolean,
    statistics: value.statistics as boolean,
    indexes: value.indexes as boolean,
    ddl: value.ddl as boolean,
    diagram: value.diagram as boolean,
    diagramRelationships: value.diagramRelationships as boolean
  };
}

function parseSchemaDiagramTable(value: unknown): ChenSchemaDiagramTable {
  if (
    !isRecord(value) ||
    typeof value.schema !== "string" ||
    typeof value.name !== "string" ||
    !Array.isArray(value.columns) ||
    !isStringArray(value.primaryKey) ||
    !Array.isArray(value.foreignKeys) ||
    value.columns.some(
      (column) =>
        !isRecord(column) ||
        typeof column.name !== "string" ||
        typeof column.ordinal !== "number" ||
        typeof column.nativeType !== "string" ||
        typeof column.nullable !== "boolean"
    ) ||
    value.foreignKeys.some(
      (foreignKey) =>
        !isRecord(foreignKey) ||
        typeof foreignKey.name !== "string" ||
        !isStringArray(foreignKey.columns) ||
        !isNullableString(foreignKey.referencedSchema) ||
        !isNullableString(foreignKey.referencedTable) ||
        !isStringArray(foreignKey.referencedColumns)
    )
  ) {
    throw new Error("Chen returned malformed schema diagram metadata");
  }
  return value as unknown as ChenSchemaDiagramTable;
}

function parseSchemaOverviewTable(value: unknown): ChenSchemaOverviewTable {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    typeof value.schema !== "string" ||
    !isNullableNumber(value.estimatedRows) ||
    !isNullableNumber(value.totalSizeBytes) ||
    !isNullableString(value.engine) ||
    !isNullableString(value.characterSet) ||
    !isNullableString(value.collation) ||
    !isNullableString(value.comment)
  ) {
    throw new Error("Chen returned malformed schema overview metadata");
  }
  return value as unknown as ChenSchemaOverviewTable;
}

function parseSchemaOverviewView(value: unknown): ChenSchemaOverviewView {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    typeof value.schema !== "string" ||
    typeof value.type !== "string" ||
    !isNullableString(value.comment)
  ) {
    throw new Error("Chen returned malformed schema overview metadata");
  }
  return value as unknown as ChenSchemaOverviewView;
}

function parseSchemaOverviewIndex(value: unknown): ChenSchemaOverviewIndex {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    typeof value.schema !== "string" ||
    typeof value.table !== "string" ||
    !Array.isArray(value.columns) ||
    value.columns.some((column) => typeof column !== "string") ||
    !(typeof value.unique === "boolean" || value.unique === null) ||
    !isNullableString(value.method) ||
    !isNullableString(value.definition)
  ) {
    throw new Error("Chen returned malformed schema overview metadata");
  }
  return value as unknown as ChenSchemaOverviewIndex;
}
