import type { ChenActionItem, ChenAuthResponse, ChenProfile, ChenTreeNode } from "~/chen/types";
import type {
  ChenSchemaOverview,
  ChenSchemaOverviewCapabilities,
  ChenSchemaDiagramTable,
  ChenSchemaOverviewIndex,
  ChenSchemaMetadataSection,
  ChenSchemaOverviewTable,
  ChenSchemaOverviewView
} from "~/chen/types/schemaOverview";
import type {
  ChenTableConstraint,
  ChenTableForeignKey,
  ChenTableIndex,
  ChenTableMetadata,
  ChenTableMetadataColumn,
  ChenTableMetadataSection
} from "~/chen/types/tableMetadata";
import type {
  ChenQualifiedRelation,
  ChenRelationColumnsMetadata,
  ChenRelationMetadataPage,
  ChenSqlMetadataScope
} from "~/chen/types/sqlMetadata";

const buildHeaders = (token?: string, init?: HeadersInit) => ({
  ...getWebApiHeaders(),
  ...(token ? { token } : {}),
  ...(init || {})
});

export function chenPath(path: string, endpointUrl?: string) {
  const connectorPath = `/chen${path.startsWith("/") ? path : `/${path}`}`;
  const currentOrigin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const endpoint = new URL(endpointUrl || currentOrigin, currentOrigin);

  if (isElectronRuntime()) {
    const target = new URL(withWebSitePrefix(connectorPath), currentOrigin);
    target.searchParams.set("__jms_chen_endpoint", endpoint.origin);
    return target.toString();
  }

  if (endpoint.origin === currentOrigin) {
    return withWebSitePrefix(connectorPath);
  }

  return new URL(connectorPath, endpoint.origin).toString();
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || `${response.status}`);
  }

  if (!text.trim()) {
    return {} as T;
  }

  return JSON.parse(text) as T;
}

export async function authChen(token: string, disableAutoHash = false, endpointUrl?: string) {
  const response = await fetch(chenPath("/api/auth", endpointUrl), {
    method: "POST",
    credentials: "include",
    headers: {
      ...buildHeaders(undefined, getWebApiMutationHeaders()),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      token,
      disableAutoHash
    })
  });

  return readJson<ChenAuthResponse>(response);
}

export async function fetchChenProfile(chenToken: string, endpointUrl?: string) {
  const response = await fetch(chenPath("/api/profile", endpointUrl), {
    credentials: "include",
    headers: buildHeaders(chenToken)
  });

  return readJson<ChenProfile>(response);
}

export async function uploadChenSqlFile(
  chenToken: string,
  file: File,
  fetchImpl: typeof fetch = fetch,
  endpointUrl?: string
) {
  const body = new FormData();
  body.append("file", file);
  const response = await fetchImpl(chenPath("/api/console/upload", endpointUrl), {
    method: "POST",
    credentials: "include",
    headers: buildHeaders(chenToken, getWebApiMutationHeaders()),
    body
  });
  const result = await readJson<{ path?: string }>(response);
  if (!result.path?.trim()) throw new Error("Chen upload returned no SQL file path");
  return { path: result.path };
}

export async function fetchChenSqlRelations(
  chenToken: string,
  scope: ChenSqlMetadataScope,
  prefix = "",
  limit = 100,
  fetchImpl: typeof fetch = fetch,
  endpointUrl?: string
): Promise<ChenRelationMetadataPage> {
  const response = await fetchImpl(chenPath("/api/resources/metadata/relations", endpointUrl), {
    method: "POST",
    credentials: "include",
    headers: {
      ...buildHeaders(chenToken, getWebApiMutationHeaders()),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ ...scope, prefix, limit })
  });
  const result = await readJson<unknown>(response);
  if (!isRecord(result) || !Array.isArray(result.items) || typeof result.truncated !== "boolean") {
    throw new Error("Chen returned malformed SQL relation metadata");
  }

  return {
    items: result.items.map(parseQualifiedRelation),
    truncated: result.truncated
  };
}

export async function fetchChenSqlColumns(
  chenToken: string,
  scope: ChenSqlMetadataScope,
  relations: ChenQualifiedRelation[],
  fetchImpl: typeof fetch = fetch,
  endpointUrl?: string
): Promise<ChenRelationColumnsMetadata[]> {
  const response = await fetchImpl(chenPath("/api/resources/metadata/columns", endpointUrl), {
    method: "POST",
    credentials: "include",
    headers: {
      ...buildHeaders(chenToken, getWebApiMutationHeaders()),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ ...scope, relations })
  });
  const result = await readJson<unknown>(response);
  if (!isRecord(result) || !Array.isArray(result.items)) {
    throw new Error("Chen returned malformed SQL column metadata");
  }

  return result.items.map((item) => {
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

export async function fetchChenSchemaOverview(
  chenToken: string,
  nodeKey: string,
  sections: ChenSchemaMetadataSection[] = ["tables", "views"],
  fetchImpl: typeof fetch = fetch,
  endpointUrl?: string
): Promise<ChenSchemaOverview> {
  const response = await fetchImpl(chenPath("/api/resources/metadata/schema-overview", endpointUrl), {
    method: "POST",
    credentials: "include",
    headers: {
      ...buildHeaders(chenToken, getWebApiMutationHeaders()),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ nodeKey, sections })
  });

  return parseSchemaOverview(await readJson<unknown>(response));
}

export async function fetchChenTableMetadata(
  chenToken: string,
  nodeKey: string,
  sections: ChenTableMetadataSection[] = ["columns", "primaryKey"],
  fetchImpl: typeof fetch = fetch,
  endpointUrl?: string
): Promise<ChenTableMetadata> {
  const response = await fetchImpl(chenPath("/api/resources/metadata/table", endpointUrl), {
    method: "POST",
    credentials: "include",
    headers: {
      ...buildHeaders(chenToken, getWebApiMutationHeaders()),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ nodeKey, sections })
  });

  return parseTableMetadata(await readJson<unknown>(response));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseQualifiedRelation(value: unknown): ChenQualifiedRelation {
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

function parseSchemaOverview(value: unknown): ChenSchemaOverview {
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

function parseTableMetadata(value: unknown): ChenTableMetadata {
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
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

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isNullableNumber(value: unknown): value is number | null {
  return (typeof value === "number" && Number.isFinite(value)) || value === null;
}

export function sanitizeChenExportFileName(value: string, fallback = "chen-export") {
  const withoutControls = Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("");
  const fileName = withoutControls.split(/[\\/]/).at(-1)?.trim() || "";
  return fileName && fileName !== "." && fileName !== ".." ? fileName : fallback;
}

function contentDispositionFileName(value: string | null) {
  if (!value) return "";

  const encoded = value.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i)?.[1];
  if (encoded) {
    const candidate = encoded.trim().replace(/^"|"$/g, "");
    try {
      return decodeURIComponent(candidate);
    } catch {
      return candidate;
    }
  }

  return (
    value
      .match(/filename\s*=\s*(?:"([^"]+)"|([^;]+))/i)
      ?.slice(1)
      .find(Boolean)
      ?.trim() || ""
  );
}

export async function fetchChenExport(
  chenToken: string,
  fileKey: string,
  fetchImpl: typeof fetch = fetch,
  endpointUrl?: string
) {
  const response = await fetchImpl(chenPath(`/api/console/export/${encodeURIComponent(fileKey)}`, endpointUrl), {
    credentials: "include",
    headers: buildHeaders(chenToken)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Chen export failed (${response.status})`);
  }

  const responseFileName = contentDispositionFileName(response.headers.get("Content-Disposition"));
  return {
    blob: await response.blob(),
    fileName: sanitizeChenExportFileName(responseFileName || fileKey)
  };
}

export async function fetchChenTreeChildren(
  chenToken: string,
  parent?: ChenTreeNode | null,
  force = false,
  endpointUrl?: string
) {
  const url = new URL(chenPath("/api/resources/children", endpointUrl), window.location.origin);
  if (force) url.searchParams.set("force", "true");

  const hasParent = !!parent;
  const response = await fetch(url.toString(), {
    method: "POST",
    credentials: "include",
    headers: {
      ...buildHeaders(chenToken, getWebApiMutationHeaders()),
      "Content-Type": "application/json"
    },
    ...(hasParent ? { body: JSON.stringify(parent) } : {})
  });

  return readJson<ChenTreeNode[]>(response);
}

export async function fetchChenActions(chenToken: string, node: ChenTreeNode, endpointUrl?: string) {
  const response = await fetch(chenPath("/api/resources/actions", endpointUrl), {
    method: "POST",
    credentials: "include",
    headers: {
      ...buildHeaders(chenToken, getWebApiMutationHeaders()),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(node)
  });

  return readJson<ChenActionItem[]>(response);
}

export async function runChenAction(chenToken: string, node: ChenTreeNode, action: string, endpointUrl?: string) {
  const response = await fetch(chenPath("/api/resources/actions/do", endpointUrl), {
    method: "POST",
    credentials: "include",
    headers: {
      ...buildHeaders(chenToken, getWebApiMutationHeaders()),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ node, action })
  });

  return readJson<{ event: string; data: any }>(response);
}
