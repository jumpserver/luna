import type { SftpFileEntry } from "#koko/composables/sftp/useSftpFileManager";

export type PreviewKind = "text" | "image" | "unsupported" | "empty";
export type TextEncoding = "utf-8" | "utf-8-bom" | "utf-16le" | "utf-16be";
export type LineEnding = "LF" | "CRLF";
export type EditorPane = "left" | "right";

export interface EditorTab {
  path: string;
  pane: EditorPane;
  entry: SftpFileEntry;
  content: string;
  savedContent: string;
  kind: PreviewKind;
  previewUrl: string;
  loading: boolean;
  loadStarted: boolean;
  saving: boolean;
  error: string;
  encoding: TextEncoding;
  savedEncoding: TextEncoding;
  lineEnding: LineEnding;
  savedLineEnding: LineEnding;
  remoteVersion: string;
  remoteMetadataVersion: string;
  externalChanged: boolean;
  draftRestored: boolean;
  largeBlocked: boolean;
  lineWrapping: boolean;
  language: string;
  expectedLanguage: string;
  contentLanguageMismatch: boolean;
  cursorLine: number;
  cursorColumn: number;
  preview: boolean;
}

export interface TreeNode {
  entries: SftpFileEntry[];
  loading: boolean;
  error: string;
  updatedAt?: number;
}

export interface EntryTreeRow {
  kind: "entry";
  entry: SftpFileEntry;
  path: string;
  depth: number;
  expanded: boolean;
}

export interface PendingTreeRow {
  kind: "pending";
  path: string;
  depth: number;
  createKind: "file" | "directory";
}

export interface TreeStatusRow {
  kind: "loading" | "error";
  path: string;
  parent: string;
  depth: number;
  error?: string;
}

export type TreeRow = EntryTreeRow | PendingTreeRow | TreeStatusRow;

export interface ContextTarget {
  entry: SftpFileEntry;
  path: string;
}

export type AlertTarget = { kind: "delete"; target: ContextTarget } | { kind: "unsaved-close"; tab: EditorTab };

export interface SaveConflict {
  tab: EditorTab;
  remoteEntry: SftpFileEntry | null;
  remoteContent: string;
  loading: boolean;
  error: string;
}

export interface QuickOpenItem {
  entry: SftpFileEntry;
  path: string;
  open: boolean;
}

export interface DraggedEditorItem {
  entry: SftpFileEntry;
  path: string;
  source: "tab" | "tree";
}

export interface EditorNavigationLocation {
  entry: SftpFileEntry;
  pane: EditorPane;
  path: string;
}

export interface DiffLine {
  number: number;
  text: string;
  changed: boolean;
}

export interface DiffWindow {
  local: DiffLine[];
  remote: DiffLine[];
  truncated: boolean;
}

export const DIRECTORY_CACHE_TTL_MS = 30_000;

export const ENCODING_ITEMS = [
  { label: "UTF-8", value: "utf-8" },
  { label: "UTF-8 with BOM", value: "utf-8-bom" },
  { label: "UTF-16 LE", value: "utf-16le" },
  { label: "UTF-16 BE", value: "utf-16be" }
] as const satisfies Array<{ label: string; value: TextEncoding }>;

export const LINE_ENDING_ITEMS = [
  { label: "LF", value: "LF" },
  { label: "CRLF", value: "CRLF" }
] as const satisfies Array<{ label: string; value: LineEnding }>;

export const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"]);

export const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "json",
  "yaml",
  "yml",
  "toml",
  "ini",
  "conf",
  "env",
  "js",
  "ts",
  "tsx",
  "jsx",
  "vue",
  "html",
  "css",
  "scss",
  "less",
  "py",
  "go",
  "rs",
  "java",
  "c",
  "h",
  "cpp",
  "hpp",
  "sh",
  "zsh",
  "bash",
  "sql",
  "xml",
  "log"
]);

export const LANGUAGE_MAP: Record<string, string> = {
  bash: "shell",
  c: "c",
  conf: "ini",
  cpp: "cpp",
  css: "css",
  env: "ini",
  go: "go",
  h: "c",
  hpp: "cpp",
  html: "html",
  ini: "ini",
  java: "java",
  js: "javascript",
  json: "json",
  jsx: "javascript",
  less: "less",
  log: "plaintext",
  md: "markdown",
  py: "python",
  rs: "rust",
  scss: "scss",
  sh: "shell",
  sql: "sql",
  toml: "ini",
  ts: "typescript",
  tsx: "typescript",
  txt: "plaintext",
  vue: "html",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "shell"
};

const TAB_ICON_MAP: Record<string, string> = {
  bash: "i-lucide-terminal",
  c: "i-lucide-file-code",
  conf: "i-lucide-settings-2",
  css: "i-lucide-palette",
  csv: "i-lucide-table-2",
  crt: "i-lucide-shield-check",
  env: "i-lucide-settings-2",
  gif: "i-lucide-image",
  go: "i-lucide-file-code",
  gz: "i-lucide-file-archive",
  h: "i-lucide-file-code",
  html: "i-lucide-globe",
  ini: "i-lucide-settings-2",
  java: "i-lucide-file-code",
  js: "i-lucide-braces",
  jpg: "i-lucide-image",
  jpeg: "i-lucide-image",
  json: "i-lucide-braces",
  jsx: "i-lucide-braces",
  key: "i-lucide-key-round",
  lock: "i-lucide-lock-keyhole",
  log: "i-lucide-scroll-text",
  md: "i-lucide-file-text",
  pem: "i-lucide-shield-check",
  png: "i-lucide-image",
  py: "i-lucide-file-code",
  sh: "i-lucide-terminal",
  sock: "i-lucide-plug-zap",
  sql: "i-lucide-database",
  tar: "i-lucide-file-archive",
  tgz: "i-lucide-file-archive",
  toml: "i-lucide-settings-2",
  ts: "i-lucide-braces",
  tsx: "i-lucide-braces",
  txt: "i-lucide-file-text",
  vue: "i-lucide-component",
  webp: "i-lucide-image",
  xls: "i-lucide-table-2",
  xlsx: "i-lucide-table-2",
  xml: "i-lucide-file-code",
  xz: "i-lucide-file-archive",
  yaml: "i-lucide-file-text",
  yml: "i-lucide-file-text",
  zip: "i-lucide-file-archive"
};

export function fileExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() || "";
}

export function expectedLanguage(name: string) {
  return LANGUAGE_MAP[fileExtension(name)] || "plaintext";
}

export function detectContentLanguage(content: string, fallback: string) {
  const sample = content.trimStart().slice(0, 4096);
  const lower = sample.toLowerCase();
  if (
    lower.startsWith("<!doctype html") ||
    lower.startsWith("<html") ||
    lower.startsWith("<head") ||
    lower.startsWith("<body")
  )
    return "html";
  if (lower.startsWith("<?xml")) return "xml";
  if (sample.startsWith("{") || sample.startsWith("[")) {
    try {
      JSON.parse(content);
      return "json";
    } catch {
      // Keep the extension-derived mode for incomplete or non-JSON content.
    }
  }
  return fallback;
}

export function updateDetectedLanguage(tab: EditorTab, content: string) {
  tab.expectedLanguage = expectedLanguage(tab.entry.name);
  tab.language = detectContentLanguage(content, tab.expectedLanguage);
  tab.contentLanguageMismatch =
    tab.expectedLanguage !== "plaintext" && tab.language !== "plaintext" && tab.language !== tab.expectedLanguage;
}

export function isDirtyTab(tab: EditorTab) {
  return (
    tab.kind === "text" &&
    (tab.content !== tab.savedContent || tab.encoding !== tab.savedEncoding || tab.lineEnding !== tab.savedLineEnding)
  );
}

export function tabIcon(tab: EditorTab) {
  if (tab.kind === "image") return "i-lucide-image";
  if (tab.kind === "unsupported" || tab.error) return "i-lucide-file-warning";
  const ext = fileExtension(tab.entry.name);
  return TAB_ICON_MAP[ext] || "i-lucide-file-code-2";
}

export function entryIcon(entry: SftpFileEntry, expanded = false) {
  if (entry.is_dir) return expanded ? "i-lucide-folder-open" : "i-lucide-folder";
  return TAB_ICON_MAP[fileExtension(entry.name)] || "i-lucide-file";
}

export function entryIconClass(entry: SftpFileEntry) {
  if (entry.is_dir) return "tree-folder-icon";
  const extension = fileExtension(entry.name);
  if (["crt", "pem", "csv", "xls", "xlsx"].includes(extension)) return "text-success";
  if (["json", "yaml", "yml", "toml", "ini", "conf", "env", "zip", "tar", "tgz", "gz", "xz"].includes(extension))
    return "text-warning";
  if (IMAGE_EXTENSIONS.has(extension) || ["js", "ts", "tsx", "jsx", "vue", "py", "go"].includes(extension))
    return "text-info";
  return "text-(--app-muted)";
}

export function comparisonWindow(localContent: string, remoteContent: string): DiffWindow {
  const localLines = localContent.split("\n");
  const remoteLines = remoteContent.split("\n");
  let prefix = 0;
  while (prefix < localLines.length && prefix < remoteLines.length && localLines[prefix] === remoteLines[prefix])
    prefix++;

  let suffix = 0;
  while (
    suffix < localLines.length - prefix &&
    suffix < remoteLines.length - prefix &&
    localLines[localLines.length - suffix - 1] === remoteLines[remoteLines.length - suffix - 1]
  )
    suffix++;

  const contextLines = 3;
  const maxVisibleLines = 240;
  const localStart = Math.max(0, prefix - contextLines);
  const remoteStart = Math.max(0, prefix - contextLines);
  const localEnd = Math.min(localLines.length, localLines.length - suffix + contextLines, localStart + maxVisibleLines);
  const remoteEnd = Math.min(
    remoteLines.length,
    remoteLines.length - suffix + contextLines,
    remoteStart + maxVisibleLines
  );
  return {
    local: localLines.slice(localStart, localEnd).map((text, index) => ({
      number: localStart + index + 1,
      text,
      changed: localStart + index >= prefix && localStart + index < localLines.length - suffix
    })),
    remote: remoteLines.slice(remoteStart, remoteEnd).map((text, index) => ({
      number: remoteStart + index + 1,
      text,
      changed: remoteStart + index >= prefix && remoteStart + index < remoteLines.length - suffix
    })),
    truncated: localEnd < localLines.length - suffix || remoteEnd < remoteLines.length - suffix
  };
}

export function countChangedLines(value: string) {
  if (!value) return 0;
  let count = value.endsWith("\n") ? 0 : 1;
  for (let index = 0; index < value.length; index++) {
    if (value.charCodeAt(index) === 10) count++;
  }
  return count;
}

export function changedLineCounts(before: string, after: string) {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before.charCodeAt(prefix) === after.charCodeAt(prefix))
    prefix++;

  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before.charCodeAt(before.length - suffix - 1) === after.charCodeAt(after.length - suffix - 1)
  )
    suffix++;

  const beforeChanged = before.slice(prefix, before.length - suffix);
  const afterChanged = after.slice(prefix, after.length - suffix);
  return {
    added: countChangedLines(afterChanged),
    removed: countChangedLines(beforeChanged)
  };
}

export function joinPath(parent: string, name: string) {
  return `${parent.replace(/\/$/, "")}/${name}` || `/${name}`;
}

export function parentPath(path: string) {
  const index = path.lastIndexOf("/");
  return index <= 0 ? "/" : path.slice(0, index);
}

export function pathHasPrefix(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function rewritePathPrefix(path: string, from: string, to: string) {
  return pathHasPrefix(path, from) ? `${to}${path.slice(from.length)}` : path;
}

export function rewriteTreePaths(tree: Record<string, TreeNode>, expanded: Iterable<string>, from: string, to: string) {
  return {
    tree: Object.fromEntries(Object.entries(tree).map(([path, node]) => [rewritePathPrefix(path, from, to), node])),
    expanded: new Set([...expanded].map((path) => rewritePathPrefix(path, from, to)))
  };
}

export function removeTreePaths(tree: Record<string, TreeNode>, expanded: Iterable<string>, prefix: string) {
  return {
    tree: Object.fromEntries(Object.entries(tree).filter(([path]) => !pathHasPrefix(path, prefix))),
    expanded: new Set([...expanded].filter((path) => !pathHasPrefix(path, prefix)))
  };
}

export function fileVersion(entry: SftpFileEntry | null | undefined) {
  return entry ? entry.version || metadataVersion(entry) : "";
}

export function metadataVersion(entry: SftpFileEntry | null | undefined) {
  return entry ? `${entry.size}\u0000${entry.mod_time}\u0000${entry.perm}` : "";
}

export async function contentVersion(buffer: ArrayBuffer) {
  if (!globalThis.crypto?.subtle) return "";
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return `sha256:${[...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function parseFileSize(size: string) {
  const normalized = size.trim().toLowerCase().replaceAll(",", "");
  const match = /^([\d.]+)\s*(b|kb|kib|mb|mib|gb|gib)?$/.exec(normalized);
  if (!match) return 0;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;
  const unit = match[2] || "b";
  const multiplier = unit.startsWith("g")
    ? 1024 ** 3
    : unit.startsWith("m")
      ? 1024 ** 2
      : unit.startsWith("k")
        ? 1024
        : 1;
  return amount * multiplier;
}

export function formatFileSize(size: string) {
  const bytes = parseFileSize(size);
  if (!Number.isFinite(bytes) || bytes < 0) return size;
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex++;
  } while (value >= 1024 && unitIndex < units.length - 1);
  const digits = value >= 10 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

export function entryTitle(entry: SftpFileEntry, path: string) {
  const details = [path];
  if (!entry.is_dir) details.push(formatFileSize(entry.size));
  const modified = Number(entry.mod_time);
  if (Number.isFinite(modified) && modified > 0) details.push(new Date(modified * 1000).toLocaleString());
  return details.join("\n");
}

export function decodeText(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let encoding: TextEncoding = "utf-8";
  let offset = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    encoding = "utf-8-bom";
    offset = 3;
  } else if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    encoding = "utf-16le";
    offset = 2;
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    encoding = "utf-16be";
    offset = 2;
  }

  const decoderName = encoding === "utf-8-bom" ? "utf-8" : encoding;
  let text: string;
  try {
    text = new TextDecoder(decoderName, { fatal: true }).decode(bytes.subarray(offset));
  } catch {
    throw new Error("unsupported_text_encoding");
  }
  const lineEnding: LineEnding = text.includes("\r\n") ? "CRLF" : "LF";
  return {
    content: text.replace(/\r\n?/g, "\n"),
    encoding,
    lineEnding
  };
}

export function encodeText(content: string, encoding: TextEncoding, lineEnding: LineEnding) {
  const normalized = content.replace(/\r\n?/g, "\n");
  const text = lineEnding === "CRLF" ? normalized.replaceAll("\n", "\r\n") : normalized;
  if (encoding === "utf-8" || encoding === "utf-8-bom") {
    const encoded = new TextEncoder().encode(text);
    const output = new Uint8Array(encoded.byteLength + (encoding === "utf-8-bom" ? 3 : 0));
    if (encoding === "utf-8-bom") output.set([0xef, 0xbb, 0xbf]);
    output.set(encoded, output.byteLength - encoded.byteLength);
    return output;
  }

  const littleEndian = encoding === "utf-16le";
  const output = new Uint8Array(2 + text.length * 2);
  output.set(littleEndian ? [0xff, 0xfe] : [0xfe, 0xff]);
  const view = new DataView(output.buffer);
  for (let index = 0; index < text.length; index++) {
    view.setUint16(2 + index * 2, text.charCodeAt(index), littleEndian);
  }
  return output;
}
