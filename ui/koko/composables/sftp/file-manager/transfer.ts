import type { FileTransferEndpointRef } from "@jumpserver/connectors-core";
import type { Ref } from "vue";
import type { SftpFileEntry } from "../useSftpFileManager";
import type { SftpTransferEntry, SftpTransferSourcePayload } from "./workspaceTypes";
import { joinTransferPath } from "./selectors";

export const SFTP_TRANSFER_MIME_TYPE = "application/x-jumpserver-sftp-files";
export const SFTP_FOLDER_MAX_DEPTH = 32;

type DragDataTransfer = Pick<DataTransfer, "setData" | "getData" | "types" | "effectAllowed" | "dropEffect">;
type BrowserFileSystemEntry = Pick<FileSystemEntry, "name" | "isFile" | "isDirectory">;
type BrowserFileEntry = BrowserFileSystemEntry & {
  file: (success: (file: File) => void, error?: (cause: unknown) => void) => void;
};
type BrowserDirectoryEntry = BrowserFileSystemEntry & {
  createReader: () => {
    readEntries: (success: (entries: BrowserFileSystemEntry[]) => void, error?: (cause: unknown) => void) => void;
  };
};
type WebkitDataTransferItem = DataTransferItem & {
  webkitGetAsEntry?: () => BrowserFileSystemEntry | null;
};

export interface BrowserUploadItem {
  file?: File;
  relativePath: string;
  is_dir: boolean;
}

export interface BrowserUploadSelection {
  items: BrowserUploadItem[];
  failures: unknown[];
}

export interface ExpandedTransferSelection {
  entries: SftpTransferEntry[];
  directories: string[];
  failures: Array<{ path: string; cause: unknown }>;
}

function relativePath(...parts: string[]) {
  const path = parts
    .filter(Boolean)
    .join("/")
    .replace(/^\/+|\/+$/g, "");
  // Reject backslash/colon segments too: without this a name like "evil\..\..\Startup\bad.exe"
  // has no "/" and isn't literally "."/"..", so it would otherwise pass through untouched.
  if (
    !path ||
    path.includes("\0") ||
    path.split("/").some((part) => !part || part === "." || part === ".." || /[\\:]/.test(part))
  )
    return "";
  return path;
}

export function transferEntriesFromSelection(
  entries: Array<Pick<SftpFileEntry, "name" | "size" | "is_dir">>
): SftpTransferEntry[] {
  return entries
    .filter((entry) => entry.name !== "..")
    .map((entry) => ({ name: entry.name, size: entry.size, ...(entry.is_dir ? { is_dir: true } : {}) }));
}

export async function expandTransferSelection(
  payload: SftpTransferSourcePayload,
  listDirectory: (path: string) => Promise<Array<Pick<SftpFileEntry, "name" | "size" | "is_dir">>>,
  maxDepth = SFTP_FOLDER_MAX_DEPTH
): Promise<ExpandedTransferSelection> {
  const entries = payload.entries.filter((entry) => !entry.is_dir);
  const directories: string[] = [];
  const failures: ExpandedTransferSelection["failures"] = [];

  async function walk(path: string, relativeDir: string, depth: number): Promise<void> {
    if (depth > maxDepth) {
      failures.push({ path, cause: new Error(`Folder depth exceeds ${maxDepth}`) });
      return;
    }
    try {
      const children = await listDirectory(path);
      directories.push(relativeDir);
      for (const child of children) {
        if (child.name === "..") continue;
        const childRelative = relativePath(relativeDir, child.name);
        if (!childRelative) continue;
        if (child.is_dir) await walk(joinTransferPath(path, child.name), childRelative, depth + 1);
        else entries.push({ name: child.name, size: child.size, relativeDir });
      }
    } catch (cause) {
      failures.push({ path, cause });
    }
  }

  for (const entry of payload.entries) {
    if (!entry.is_dir || entry.name === "..") continue;
    const directory = relativePath(entry.relativeDir || "", entry.name);
    if (directory) await walk(joinTransferPath(payload.sourcePath, entry.relativeDir || "", entry.name), directory, 1);
  }
  return { entries, directories, failures };
}

function browserFile(entry: BrowserFileEntry) {
  return new Promise<File>((resolve, reject) => entry.file(resolve, reject));
}

async function browserDirectoryEntries(entry: BrowserDirectoryEntry) {
  const reader = entry.createReader();
  const entries: BrowserFileSystemEntry[] = [];
  while (true) {
    const batch = await new Promise<BrowserFileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) return entries;
    entries.push(...batch);
  }
}

export async function collectBrowserUploadSelection(
  files: ArrayLike<File>,
  dataTransferItems?: Iterable<DataTransferItem>,
  maxDepth = SFTP_FOLDER_MAX_DEPTH
): Promise<BrowserUploadSelection> {
  const items: BrowserUploadItem[] = [];
  const failures: unknown[] = [];
  const roots: BrowserFileSystemEntry[] = [];
  for (const item of dataTransferItems || []) {
    const entry = (item as WebkitDataTransferItem).webkitGetAsEntry?.();
    if (entry) roots.push(entry);
  }

  async function walk(entry: BrowserFileSystemEntry, parent: string, depth: number): Promise<void> {
    const path = relativePath(parent, entry.name);
    if (!path) return;
    if (depth > maxDepth) {
      failures.push(new Error(`Folder depth exceeds ${maxDepth}`));
      return;
    }
    try {
      if (entry.isFile) {
        items.push({ file: await browserFile(entry as BrowserFileEntry), relativePath: path, is_dir: false });
        return;
      }
      if (!entry.isDirectory) return;
      const children = await browserDirectoryEntries(entry as BrowserDirectoryEntry);
      items.push({ relativePath: path, is_dir: true });
      for (const child of children) await walk(child, path, depth + 1);
    } catch (cause) {
      failures.push(cause);
    }
  }

  if (roots.length) {
    for (const root of roots) await walk(root, "", 1);
  } else {
    for (const file of Array.from(files)) {
      const path = relativePath(file.webkitRelativePath || file.name);
      if (path) items.push({ file, relativePath: path, is_dir: false });
    }
  }
  return { items, failures };
}

export function buildTransferSourcePayload(options: {
  sourceEndpoint: FileTransferEndpointRef | null | undefined;
  sourcePath: string;
  sourceSelectionRevision: number;
  entries: SftpTransferEntry[];
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

  return entries.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const item = entry as Record<string, unknown>;
    if (typeof item.name !== "string" || relativePath(item.name) !== item.name || typeof item.size !== "string")
      return false;
    if (item.is_dir !== undefined && typeof item.is_dir !== "boolean") return false;
    return (
      item.relativeDir === undefined ||
      (typeof item.relativeDir === "string" && relativePath(item.relativeDir) === item.relativeDir)
    );
  });
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
