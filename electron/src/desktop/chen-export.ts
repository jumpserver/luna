import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rename, rm } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { readableFromWebBody } from "../shared/bytes";

export function chenExportTarget(value: string, origins: Set<string>) {
  const url = new URL(value);
  if (url.protocol !== "jms-app:" || url.host !== "app" || url.pathname !== "/chen/api/v1/downloads" || url.hash)
    throw new Error("Invalid Chen download route");
  const origin = url.searchParams.get("__jms_chen_endpoint") || "";
  const endpoint = new URL(origin);
  if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.origin !== origin || !origins.has(origin))
    throw new Error("Unregistered Chen download endpoint");
  return new URL(url.pathname, origin).href;
}

export async function saveChenDownload(response: Response, filePath: string) {
  if (!response.ok || !response.body) throw new Error(`Export download failed (${response.status})`);
  // Keep an interrupted stream separate from the user-selected filename, including when replacing a file.
  const temporary = path.join(path.dirname(filePath), `.chen-export-${randomUUID()}.partial`);
  try {
    await pipeline(readableFromWebBody(response.body), createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
    await rename(temporary, filePath);
  } finally {
    await rm(temporary, { force: true });
  }
}
