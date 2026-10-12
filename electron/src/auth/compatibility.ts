import type { SiteCompatibility } from "../../../ui/types/clientCompatibility";
import { parseUrl } from "../shared/url";

// Raise only when the client starts depending on a breaking server change.
export const MIN_CORE_VERSION = "v5.1.0";
const COMPATIBILITY_PATH = "/api/v1/settings/client/compatibility/";

function parseVersion(value: unknown) {
  if (typeof value !== "string" || value.length > 256) return null;
  // JumpServer's terminal -lts suffix labels the stable release channel.
  // Other suffixes retain their SemVer prerelease meaning (including rc1/beta8).
  const normalized = value
    .trim()
    .replace(/^v/, "")
    .replace(/^(\d+\.\d+\.\d+)-lts(?=\+|$)/, "$1");
  const match = normalized.match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
  );
  if (!match) return null;
  const prerelease = match[4]?.split(".") || [];
  if (prerelease.some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith("0"))) return null;
  return { release: match.slice(1, 4).map(BigInt), prerelease };
}

export function compareVersions(left: unknown, right: unknown): number | null {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return null;
  for (let i = 0; i < 3; i += 1) {
    if (a.release[i] !== b.release[i]) return a.release[i] > b.release[i] ? 1 : -1;
  }
  if (!a.prerelease.length || !b.prerelease.length) {
    return Number(!a.prerelease.length) - Number(!b.prerelease.length);
  }
  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i += 1) {
    const x = a.prerelease[i];
    const y = b.prerelease[i];
    if (x === y) continue;
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const xNumeric = /^\d+$/.test(x);
    const yNumeric = /^\d+$/.test(y);
    if (xNumeric && yNumeric) return BigInt(x) > BigInt(y) ? 1 : -1;
    if (xNumeric !== yNumeric) return xNumeric ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
}

export function normalizeCompatibilitySite(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^https?:\/\//i.test(value) ||
    Array.from(value).some((character) => character.charCodeAt(0) <= 32 || character === "\\")
  ) {
    throw new Error("Invalid site URL");
  }
  const url = parseUrl(value);
  if (!url.hostname || url.username || url.password || /[?#]/.test(url.href)) throw new Error("Invalid site URL");
  return url.toString().replace(/\/+$/, "");
}

export function clientDownloadUrl(site: unknown): string {
  return `${normalizeCompatibilitySite(site)}/core/download/`;
}

export async function checkSiteCompatibility(
  site: unknown,
  clientVersion: string,
  fetchResponse: typeof fetch,
  timeout = 10_000
): Promise<SiteCompatibility> {
  const result: SiteCompatibility = {
    status: "unknown",
    site: typeof site === "string" ? site : "",
    clientVersion,
    minCoreVersion: MIN_CORE_VERSION,
    failures: []
  };
  try {
    result.site = normalizeCompatibilitySite(site);
  } catch {
    return { ...result, reason: "invalid-site" };
  }
  if (!parseVersion(clientVersion)) return { ...result, reason: "invalid-client-version" };

  let response: Response;
  let body: string;
  try {
    // Use the caller's network adapter while keeping the preflight anonymous.
    response = await fetchResponse(`${result.site}${COMPATIBILITY_PATH}`, {
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      credentials: "omit",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(timeout)
    });
    if (response.status === 404) return { ...result, reason: "endpoint-missing" };
    if (!response.ok) return { ...result, reason: "http" };
    body = "";
    const reader = response.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      let bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 64 * 1024) {
            await reader.cancel();
            return { ...result, reason: "invalid-response" };
          }
          body += decoder.decode(chunk.value, { stream: true });
        }
        body += decoder.decode();
      } finally {
        reader.releaseLock();
      }
    }
  } catch (error) {
    const failure = error as { name?: string; code?: string; message?: string; cause?: { code?: string } };
    const reason = ["TimeoutError", "AbortError"].includes(failure?.name || "")
      ? "timeout"
      : /CERT|TLS|SELF_SIGNED/.test(failure?.cause?.code || failure?.code || failure?.message || "")
        ? "tls"
        : "network";
    return { ...result, reason };
  }

  try {
    const data = JSON.parse(body);
    if (
      !data ||
      data.schema_version !== 1 ||
      !parseVersion(data.core_version) ||
      !parseVersion(data.min_client_version)
    ) {
      throw new Error("Invalid compatibility response");
    }
    result.coreVersion = data.core_version;
    result.minClientVersion = data.min_client_version;
    if (compareVersions(clientVersion, data.min_client_version)! < 0) result.failures.push("client-too-old");
    if (compareVersions(data.core_version, MIN_CORE_VERSION)! < 0) result.failures.push("core-too-old");
    return { ...result, status: result.failures.length ? "incompatible" : "compatible" };
  } catch {
    return { ...result, reason: "invalid-response" };
  }
}
