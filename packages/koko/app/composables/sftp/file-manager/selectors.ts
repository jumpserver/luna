import type { RecentSftpConnection, SftpDistributionTargetOption, SftpTransferDropPayload } from "./workspaceTypes";
import type {
  CreateFileTransferTaskInput,
  FileTransferEndpointRef,
  FileTransferTask
} from "~/shared/file-transfer/types";

export function defaultGlobalLeftPaneId(isTauriRuntime: boolean) {
  return isTauriRuntime ? "local" : "web-upload";
}

export function assetSupportsSftp(permedProtocols?: Array<{ name?: string }>) {
  const declaredProtocols = (permedProtocols || [])
    .map((item) =>
      String(item?.name || "")
        .trim()
        .toLowerCase()
    )
    .filter(Boolean);
  return declaredProtocols.length === 0 || declaredProtocols.includes("sftp");
}

export function rememberSftpConnection(connections: RecentSftpConnection[], entry: RecentSftpConnection, limit = 8) {
  return [entry, ...connections.filter((item) => item.assetId !== entry.assetId)].slice(0, limit);
}

export function filterSftpDistributionTargets(targets: SftpDistributionTargetOption[], search: string) {
  const query = search.trim().toLowerCase();
  if (!query) return targets;

  return targets.filter((target) =>
    `${target.organizationName} ${target.assetName} ${target.endpoint.label}`.toLowerCase().includes(query)
  );
}

export function buildSftpTransferInputs(
  payload: SftpTransferDropPayload,
  destination: FileTransferEndpointRef
): CreateFileTransferTaskInput[] {
  if (payload.sourceEndpoint.id === destination.id) return [];

  const sourceBasePath = payload.sourcePath.replace(/\/$/, "") || "/";
  return payload.entries
    .map((entry) => ({ ...entry, size: Number(entry.size) }))
    .filter((entry) => entry.name && Number.isFinite(entry.size) && entry.size >= 0)
    .map((entry) => ({
      batchId: "",
      sourceEndpoint: payload.sourceEndpoint,
      destinationEndpoint: destination,
      source: {
        name: entry.name,
        size: entry.size,
        path: `${sourceBasePath}/${entry.name}`.replace(/\/+/g, "/")
      },
      destinationPath: payload.destinationPath,
      conflictPolicy: "ask"
    }));
}

export function completedTransferSourceNames(tasks: FileTransferTask[]) {
  const sourceNames = [...new Set(tasks.map((task) => task.source.name))];
  return sourceNames.filter((name) =>
    tasks.filter((task) => task.source.name === name).every((task) => task.status === "completed")
  );
}
