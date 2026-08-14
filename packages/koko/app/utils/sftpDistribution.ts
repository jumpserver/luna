import type {
  CreateFileTransferTaskInput,
  FileTransferConflictPolicy,
  FileTransferEndpointRef
} from "~/shared/file-transfer/types";

export interface SftpDistributionEntry {
  name: string;
  size: string | number;
}

export interface SftpDistributionTarget {
  endpoint: FileTransferEndpointRef;
  destinationPath: string;
}

export interface SftpDistributionInput {
  distributionId?: string;
  sourceEndpoint: FileTransferEndpointRef;
  sourcePath: string;
  entries: SftpDistributionEntry[];
  targets: SftpDistributionTarget[];
  conflictPolicy: FileTransferConflictPolicy;
}

export interface SftpDistributionGroup {
  destination: FileTransferEndpointRef;
  inputs: CreateFileTransferTaskInput[];
}

function normalizeDirectory(path: string) {
  const normalized = path.trim().replace(/\/+$/, "");
  return normalized || "/";
}

export function buildSftpDistributionGroups(input: SftpDistributionInput): SftpDistributionGroup[] {
  const sourcePath = normalizeDirectory(input.sourcePath);
  const entries = input.entries
    .map((entry) => ({ ...entry, size: Number(entry.size) }))
    .filter((entry) => entry.name && Number.isFinite(entry.size) && entry.size >= 0);

  return input.targets
    .filter((target) => target.endpoint.id !== input.sourceEndpoint.id)
    .map((target) => {
      const destinationPath = normalizeDirectory(target.destinationPath);
      return {
        destination: target.endpoint,
        inputs: entries.map((entry) => ({
          batchId: input.distributionId
            ? `sftp-dist:${input.distributionId}::target::${encodeURIComponent(target.endpoint.id)}`
            : "",
          sourceEndpoint: input.sourceEndpoint,
          destinationEndpoint: target.endpoint,
          source: {
            name: entry.name,
            size: entry.size,
            path: `${sourcePath}/${entry.name}`.replace(/\/+/g, "/")
          },
          destinationPath,
          conflictPolicy: input.conflictPolicy
        }))
      };
    })
    .filter((group) => group.inputs.length > 0);
}
