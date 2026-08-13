import type { Ref } from "vue";
import type { SftpFileEntry } from "../useSftpFileManager";
import type { SftpTransferSourcePayload } from "./workspaceTypes";
import type { FileTransferEndpointRef } from "~/shared/file-transfer/types";

export const SFTP_TRANSFER_MIME_TYPE = "application/x-jumpserver-sftp-files";

type TransferableEntry = Pick<SftpFileEntry, "name" | "size">;
type DragDataTransfer = Pick<DataTransfer, "setData" | "getData" | "types" | "effectAllowed" | "dropEffect">;

export function transferEntriesFromSelection(
  entries: Array<Pick<SftpFileEntry, "name" | "size" | "is_dir">>
): TransferableEntry[] {
  return entries
    .filter((entry) => !entry.is_dir && entry.name !== "..")
    .map((entry) => ({ name: entry.name, size: entry.size }));
}

export function buildTransferSourcePayload(options: {
  sourceEndpoint: FileTransferEndpointRef | null | undefined;
  sourcePath: string;
  sourceSelectionRevision: number;
  entries: TransferableEntry[];
}): SftpTransferSourcePayload | null {
  const { sourceEndpoint, sourcePath, sourceSelectionRevision, entries } = options;
  if (!sourceEndpoint || !entries.length) return null;

  return {
    sourceEndpoint,
    sourcePath,
    sourceSelectionRevision,
    entries
  };
}

export function writeTransferDragData(
  event: Pick<DragEvent, "dataTransfer">,
  payload: SftpTransferSourcePayload,
  activeTransferDragSourceId: Ref<string | null>
) {
  event.dataTransfer?.setData(SFTP_TRANSFER_MIME_TYPE, JSON.stringify(payload));
  event.dataTransfer?.setData("text/plain", payload.entries.map((entry) => entry.name).join("\n"));
  activeTransferDragSourceId.value = payload.sourceEndpoint.id;
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
}

function isTransferPayload(payload: unknown, currentEndpointId?: string | null): payload is SftpTransferSourcePayload {
  if (!payload || typeof payload !== "object") return false;

  const candidate = payload as Record<string, unknown>;
  const sourceEndpoint = candidate.sourceEndpoint;
  const sourcePath = candidate.sourcePath;
  const sourceSelectionRevision = candidate.sourceSelectionRevision;
  const entries = candidate.entries;

  if (!sourceEndpoint || typeof sourceEndpoint !== "object") return false;
  if (typeof (sourceEndpoint as FileTransferEndpointRef).id !== "string") return false;
  if (currentEndpointId && (sourceEndpoint as FileTransferEndpointRef).id === currentEndpointId) return false;
  if (typeof sourcePath !== "string" || !sourcePath) return false;
  if (!Number.isInteger(sourceSelectionRevision)) return false;
  if (!Array.isArray(entries) || entries.length === 0) return false;

  return entries.every(
    (entry) => entry && typeof entry === "object" && typeof entry.name === "string" && typeof entry.size === "string"
  );
}

export function parseTransferDragPayload(
  event: Pick<DragEvent, "dataTransfer">,
  currentEndpointId?: string | null
): SftpTransferSourcePayload | null {
  const encoded = event.dataTransfer?.getData(SFTP_TRANSFER_MIME_TYPE);
  if (!encoded) return null;

  try {
    const payload = JSON.parse(encoded);
    return isTransferPayload(payload, currentEndpointId) ? payload : null;
  } catch {
    return null;
  }
}

export function hasTransferMimeType(event: Pick<DragEvent, "dataTransfer">) {
  return Array.from(event.dataTransfer?.types || []).includes(SFTP_TRANSFER_MIME_TYPE);
}

export function isCrossEndpointTransferDrag(activeSourceId: string | null | undefined, currentEndpointId: string) {
  return Boolean(activeSourceId) && activeSourceId !== currentEndpointId;
}

export function hasEndpointPrefix(endpointId: string | null | undefined, prefix: string) {
  return typeof endpointId === "string" && endpointId.startsWith(prefix);
}

export function createMockDataTransfer() {
  const store = new Map<string, string>();
  const dataTransfer: DragDataTransfer = {
    effectAllowed: "none",
    dropEffect: "none",
    setData(type, value) {
      store.set(type, value);
    },
    getData(type) {
      return store.get(type) || "";
    },
    get types() {
      return [...store.keys()];
    }
  };

  return dataTransfer;
}
