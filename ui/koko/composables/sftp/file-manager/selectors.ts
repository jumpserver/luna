import type {
  CreateFileTransferTaskInput,
  FileTransferEndpointRef,
  FileTransferTask
} from "@jumpserver/connectors-core";
import type { RecentSftpConnection, SftpDistributionTargetOption, SftpTransferDropPayload } from "./workspaceTypes";

export function defaultGlobalLeftPaneId(isDesktopRuntime: boolean) {
  return isDesktopRuntime ? "local" : "web-upload";
}

function protocolName(item?: { name?: unknown }) {
  const name = item?.name;
  if (typeof name === "string") return name.trim().toLowerCase();
  if (name && typeof name === "object" && "value" in name) {
    return String((name as { value?: unknown }).value || "")
      .trim()
      .toLowerCase();
  }
  return "";
}

function declaredProtocolNames(permedProtocols?: Array<{ name?: unknown }>) {
  return (permedProtocols || []).map(protocolName).filter(Boolean);
}

export function assetSupportsSftp(permedProtocols?: Array<{ name?: unknown }>) {
  return declaredProtocolNames(permedProtocols).includes("sftp");
}

export function rememberSftpConnection(connections: RecentSftpConnection[], entry: RecentSftpConnection, limit = 8) {
  return [entry, ...connections.filter((item) => item.assetId !== entry.assetId)].slice(0, limit);
}

export function uniqueRemotePanesForSend<T extends { assetId?: string }>(panes: T[]): T[] {
  const seen = new Set<string>();
  return panes.filter((pane) => {
    if (!pane.assetId) return true;
    if (seen.has(pane.assetId)) return false;
    seen.add(pane.assetId);
    return true;
  });
}

export function filterSftpDistributionTargets(targets: SftpDistributionTargetOption[], search: string) {
  const query = search.trim().toLowerCase();
  if (!query) return targets;

  return targets.filter((target) =>
    `${target.organizationName} ${target.assetName} ${target.endpoint.label}`.toLowerCase().includes(query)
  );
}

export function isSftpDirectoryAffectedByTransfer(displayedDirectory: string, targetPath: string) {
  const displayed = displayedDirectory.replace(/\/+$/, "") || "/";
  const normalizedTarget = targetPath.replace(/\/+$/, "");
  const separator = normalizedTarget.lastIndexOf("/");
  const destinationDirectory = normalizedTarget.slice(0, Math.max(separator, 0)) || "/";
  if (displayed === "/") return true;
  return destinationDirectory === displayed || destinationDirectory.startsWith(`${displayed}/`);
}

export function transferFileDisplayPath(source: { name: string; relativeDir?: string }) {
  const dir = source.relativeDir?.replace(/[\\/]+$/, "").replace(/\\/g, "/");
  return dir ? `${dir}/${source.name}` : source.name;
}

export function transferFileBreadcrumbItems(source: { name: string; relativeDir?: string }) {
  const dir = source.relativeDir?.replace(/[\\/]+$/, "").replace(/\\/g, "/") || "";
  if (!dir) return [];
  const parts = [...dir.split("/").filter(Boolean), source.name];
  if (parts.length <= 3) return parts;
  return [parts[0]!, "…", parts.at(-1)!];
}

export const sftpFolderConflictError = "folder_exists";

export function topLevelFolderName(relativeDir?: string) {
  return (
    relativeDir
      ?.replace(/\\/g, "/")
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .filter(Boolean)[0] || ""
  );
}

export function pathBelongsToFolder(path: string | undefined, folder: string) {
  const relative = path?.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "") || "";
  return relative === folder || relative.startsWith(`${folder}/`);
}

export function collidingTopLevelFolders(
  selectedFolders: string[],
  destEntries: Array<{ name: string; is_dir?: boolean }>
) {
  const destDirs = new Set(
    destEntries.filter((entry) => entry.is_dir && entry.name !== "..").map((entry) => entry.name)
  );
  return [...new Set(selectedFolders.filter((name) => name && name !== ".." && destDirs.has(name)))];
}

export function nextKeepBothFolderName(name: string, existing: Set<string>) {
  let index = 1;
  let candidate = `${name} (${index})`;
  while (existing.has(candidate)) {
    index += 1;
    candidate = `${name} (${index})`;
  }
  return candidate;
}

export function rewriteFolderPrefix(path: string, from: string, to: string) {
  const relative = path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (relative === from) return to;
  if (relative.startsWith(`${from}/`)) return `${to}${relative.slice(from.length)}`;
  return path;
}

export function destRootFromTask(destinationPath: string, relativeDir?: string) {
  const dest = destinationPath.replace(/[\\/]+$/, "");
  const relative = relativeDir?.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "") || "";
  if (!relative) return dest || "/";
  const posix = dest.replace(/\\/g, "/");
  if (posix === relative)
    return dest.endsWith(relative) ? dest.slice(0, dest.length - relative.length) || "/" : dest || "/";
  if (posix.endsWith(`/${relative}`)) return dest.slice(0, dest.length - relative.length).replace(/[\\/]+$/, "") || "/";
  return dest || "/";
}

export function joinTransferPath(basePath: string, ...parts: string[]): string {
  const base = basePath || "/";
  const names = parts.filter(Boolean);
  // Local desktop paths (Windows drive / UNC) must keep platform separators.
  if (/^[a-z]:[\\/]/i.test(base) || base.startsWith("\\\\")) {
    const sep = base.includes("\\") ? "\\" : "/";
    return [base.replace(/[\\/]+$/, ""), ...names.map((name) => name.replace(/\//g, sep))].join(sep);
  }
  return [base.replace(/\/+$/, "") || "/", ...names].join("/").replace(/\/+/g, "/");
}

export function safeLocalDownloadName(name: string) {
  let safeName = name.replace(/[<>:"/\\|?*\p{Cc}]/gu, "_").replace(/[. ]+$/g, "_");
  if (!safeName) safeName = "download";
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safeName)) safeName = `_${safeName}`;
  return safeName;
}

export function buildSftpTransferInputs(
  payload: SftpTransferDropPayload,
  destination: FileTransferEndpointRef
): CreateFileTransferTaskInput[] {
  if (payload.sourceEndpoint.id === destination.id) return [];

  return payload.entries
    .map((entry) => ({ ...entry, size: Number(entry.size) }))
    .filter((entry) => !entry.is_dir && entry.name && Number.isFinite(entry.size) && entry.size >= 0)
    .map((entry) => ({
      batchId: "",
      sourceEndpoint: payload.sourceEndpoint,
      destinationEndpoint: destination,
      source: {
        name: entry.name,
        size: entry.size,
        path: joinTransferPath(payload.sourcePath, entry.relativeDir || "", entry.name),
        ...(entry.relativeDir ? { relativeDir: entry.relativeDir } : {})
      },
      destinationPath: joinTransferPath(payload.destinationPath, entry.relativeDir || ""),
      conflictPolicy: "ask"
    }));
}

export function completedTransferSourceNames(tasks: FileTransferTask[]) {
  const sourceNames = [...new Set(tasks.map((task) => task.source.name))];
  return sourceNames.filter((name) =>
    tasks.filter((task) => task.source.name === name).every((task) => task.status === "completed")
  );
}
