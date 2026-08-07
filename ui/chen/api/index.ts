import type { ChenActionItem, ChenAuthResponse, ChenProfile, ChenSqlHints, ChenTreeNode } from "~/chen/types";

const buildHeaders = (token?: string, init?: HeadersInit) => ({
  ...getWebApiHeaders(),
  ...(token ? { token } : {}),
  ...(init || {})
});

export function chenPath(path: string, endpointUrl = window.location.origin) {
  const connectorPath = `/chen${path.startsWith("/") ? path : `/${path}`}`;
  const endpoint = new URL(endpointUrl || window.location.origin, window.location.origin);

  if (endpoint.origin === window.location.origin) {
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

export async function fetchChenSqlHints(
  chenToken: string,
  nodeKey: string,
  context: string,
  fetchImpl: typeof fetch = fetch,
  endpointUrl?: string
): Promise<ChenSqlHints> {
  const response = await fetchImpl(chenPath("/api/resources/hints", endpointUrl), {
    method: "POST",
    credentials: "include",
    headers: {
      ...buildHeaders(chenToken, getWebApiMutationHeaders()),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ nodeKey, context })
  });
  const result = await readJson<unknown>(response);
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Chen returned malformed SQL hints");
  }

  return Object.fromEntries(
    Object.entries(result)
      .filter(
        (entry): entry is [string, string[]] =>
          Array.isArray(entry[1]) && entry[1].every((column) => typeof column === "string")
      )
      .map(([table, columns]) => [table, [...columns]])
  );
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
