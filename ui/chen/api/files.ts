import { buildHeaders, chenPath, readJson } from "./client";

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
