import type { ChenActionItem, ChenAuthResponse, ChenProfile, ChenTreeNode } from "~/chen/types";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseQualifiedRelation(value: unknown): ChenQualifiedRelation {
  if (
    !isRecord(value) ||
    !(typeof value.catalog === "string" || value.catalog === null) ||
    typeof value.schema !== "string" ||
    typeof value.name !== "string" ||
    !(value.kind === "table" || value.kind === "view")
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
