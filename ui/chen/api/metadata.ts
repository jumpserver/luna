import type { ChenSchemaMetadataSection, ChenSchemaOverview } from "~/chen/types/schemaOverview";
import type {
  ChenQualifiedRelation,
  ChenRelationColumnsMetadata,
  ChenRelationMetadataPage,
  ChenSqlMetadataScope
} from "~/chen/types/sqlMetadata";
import type { ChenTableMetadata, ChenTableMetadataSection } from "~/chen/types/tableMetadata";

import { buildHeaders, chenPath, readJson } from "./client";
import { parseSchemaOverview } from "./parsers/schemaOverview";
import { parseSqlColumnsResponse, parseSqlRelationsResponse } from "./parsers/sqlMetadata";
import { parseTableMetadata } from "./parsers/tableMetadata";

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

  return parseSqlRelationsResponse(await readJson<unknown>(response));
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

  return parseSqlColumnsResponse(await readJson<unknown>(response));
}

export async function fetchChenSchemaOverview(
  chenToken: string,
  nodeKey: string,
  sections: ChenSchemaMetadataSection[] = ["tables", "views"],
  fetchImpl: typeof fetch = fetch,
  endpointUrl?: string,
  force = false
): Promise<ChenSchemaOverview> {
  const response = await fetchImpl(chenPath("/api/resources/metadata/schema-overview", endpointUrl), {
    method: "POST",
    credentials: "include",
    headers: {
      ...buildHeaders(chenToken, getWebApiMutationHeaders()),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ nodeKey, sections, ...(force ? { force: true } : {}) })
  });

  return parseSchemaOverview(await readJson<unknown>(response));
}

export async function fetchChenTableMetadata(
  chenToken: string,
  nodeKey: string,
  sections: ChenTableMetadataSection[] = ["columns", "primaryKey"],
  fetchImpl: typeof fetch = fetch,
  endpointUrl?: string,
  force = false
): Promise<ChenTableMetadata> {
  const response = await fetchImpl(chenPath("/api/resources/metadata/table", endpointUrl), {
    method: "POST",
    credentials: "include",
    headers: {
      ...buildHeaders(chenToken, getWebApiMutationHeaders()),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ nodeKey, sections, ...(force ? { force: true } : {}) })
  });

  return parseTableMetadata(await readJson<unknown>(response));
}
