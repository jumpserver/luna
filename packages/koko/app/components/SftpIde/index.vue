<script setup lang="ts">
import type { ConnectorSessionContext } from "@jumpserver/connectors-core";
import type { SftpEditorDraft } from "#koko/composables/sftp/useSftpEditorDrafts";
import type { SftpFileEntry } from "#koko/composables/sftp/useSftpFileManager";
import { connectorSessionKey } from "@jumpserver/connectors-core";
import { useDebounceFn, useIntervalFn } from "@vueuse/core";
import { SFTP_REQUEST_TIMEOUT_ERROR } from "#koko/composables/sftp/protocol";
import { useSftpEditorDrafts } from "#koko/composables/sftp/useSftpEditorDrafts";
import { sortSftpEntries, useSftpFileManager } from "#koko/composables/sftp/useSftpFileManager";
import { SftpFileConflictError } from "#koko/composables/sftp/useSftpOperations";
import CodeMirrorEditor from "./CodeMirrorEditor.client.vue";

type PreviewKind = "text" | "image" | "unsupported" | "empty";
type TextEncoding = "utf-8" | "utf-8-bom" | "utf-16le" | "utf-16be";
type LineEnding = "LF" | "CRLF";
type EditorPane = "left" | "right";
interface EditorTab {
  path: string;
  pane: EditorPane;
  entry: SftpFileEntry;
  content: string;
  savedContent: string;
  kind: PreviewKind;
  previewUrl: string;
  loading: boolean;
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
}
interface TreeNode {
  entries: SftpFileEntry[];
  loading: boolean;
  error: string;
}
interface EntryTreeRow {
  kind: "entry";
  entry: SftpFileEntry;
  path: string;
  depth: number;
  expanded: boolean;
}
interface PendingTreeRow {
  kind: "pending";
  path: string;
  depth: number;
  createKind: "file" | "directory";
}
interface TreeStatusRow {
  kind: "loading" | "error";
  path: string;
  parent: string;
  depth: number;
  error?: string;
}
type TreeRow = EntryTreeRow | PendingTreeRow | TreeStatusRow;
interface ContextTarget {
  entry: SftpFileEntry;
  path: string;
}
type AlertTarget = { kind: "delete"; target: ContextTarget } | { kind: "unsaved-close"; tab: EditorTab };
interface SaveConflict {
  tab: EditorTab;
  remoteEntry: SftpFileEntry | null;
  remoteContent: string;
  loading: boolean;
  error: string;
}
interface QuickOpenItem {
  entry: SftpFileEntry;
  path: string;
  open: boolean;
}
interface DraggedEditorItem {
  entry: SftpFileEntry;
  path: string;
  source: "tab" | "tree";
}

const props = defineProps<{ sftpToken: string }>();
const { t } = useI18n();
const toast = useToast();
const providedContext = inject(connectorSessionKey, ref(null));
const context = computed<ConnectorSessionContext | null>(() => {
  const value = unref(providedContext);
  if (!value || !props.sftpToken) return null;
  if (value.tokenId === props.sftpToken) return value;
  return { ...value, tokenId: props.sftpToken };
});
const manager = useSftpFileManager(context);
const drafts = useSftpEditorDrafts(toRef(props, "sftpToken"));
const tabs = ref<EditorTab[]>([]);
const activePane = ref<EditorPane>("left");
const paneActivePaths = reactive<Record<EditorPane, string>>({ left: "", right: "" });
const splitOpen = ref(false);
const splitRatio = ref(50);
const editorGroups = ref<HTMLElement | null>(null);
const resizingSplit = ref(false);
const activePath = computed({
  get: () => paneActivePaths[activePane.value],
  set: (path: string) => {
    const existing = tabs.value.find((tab) => tab.path === path);
    if (existing) activePane.value = existing.pane;
    paneActivePaths[activePane.value] = path;
  }
});
const search = ref("");
const searchVisible = ref(false);
const rootPath = ref("");
const selectedDirectory = ref("");
const pendingCreate = ref<{ parent: string; kind: "file" | "directory" } | null>(null);
const pendingName = ref("");
const pendingError = ref("");
const pendingSubmitting = ref(false);
const pendingInput = ref<HTMLInputElement | null>(null);
const uploadInput = ref<HTMLInputElement | null>(null);
const uploadDirectory = ref("");
const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const contextTarget = ref<ContextTarget | null>(null);
const tabContextMenuVisible = ref(false);
const tabContextMenuPosition = ref({ x: 0, y: 0 });
const tabContextPath = ref("");
const tabCloseDialogOpen = ref(false);
const tabCloseTargets = ref<EditorTab[]>([]);
const tabCloseSubmitting = ref(false);
const renameDialogOpen = ref(false);
const renameTarget = ref<ContextTarget | null>(null);
const renameValue = ref("");
const renameError = ref("");
const renameSubmitting = ref(false);
const alertDialogOpen = ref(false);
const alertTarget = ref<AlertTarget | null>(null);
const alertSubmitting = ref(false);
const saveConflict = ref<SaveConflict | null>(null);
const conflictSubmitting = ref(false);
const saveAllRunning = ref(false);
const restoringDrafts = ref(false);
const remoteCheckInProgress = ref(false);
const localChangesOpen = ref(false);
const localChangeTab = ref<EditorTab | null>(null);
const workspaceCloseDialogOpen = ref(false);
const editorLayout = ref<HTMLElement | null>(null);
const explorerWidth = ref(280);
const resizingExplorer = ref(false);
const draggedEditorItem = ref<DraggedEditorItem | null>(null);
const editorDropPane = ref<EditorPane | null>(null);
const quickOpenVisible = ref(false);
const quickOpenQuery = ref("");
const quickOpenIndex = ref(0);
const quickOpenList = ref<HTMLElement | null>(null);
let workspaceCloseResolver: ((confirmed: boolean) => void) | null = null;
const tree = ref<Record<string, TreeNode>>({});
const expanded = ref(new Set<string>());
const activeTab = computed(() => tabs.value.find((tab) => tab.path === activePath.value) || null);
const editorDragMime = "application/x-jumpserver-editor-item";
const renameDisabled = computed(
  () => !renameValue.value.trim() || renameValue.value.trim() === renameTarget.value?.entry.name
);
const alertTitle = computed(() =>
  alertTarget.value?.kind === "delete" ? t("koko.actions.delete") : t("koko.actions.close")
);
const alertDescription = computed(() => {
  const target = alertTarget.value;
  if (!target) return "";
  return target.kind === "delete"
    ? t("koko.sftpEditor.deleteConfirm", { name: target.target.entry.name })
    : t("koko.sftpEditor.unsavedCloseConfirm", { name: target.tab.entry.name });
});
const maxEditorBytes = 10 * 1024 * 1024;
const encodingItems = [
  { label: "UTF-8", value: "utf-8" },
  { label: "UTF-8 with BOM", value: "utf-8-bom" },
  { label: "UTF-16 LE", value: "utf-16le" },
  { label: "UTF-16 BE", value: "utf-16be" }
] satisfies Array<{ label: string; value: TextEncoding }>;
const lineEndingItems = [
  { label: "LF", value: "LF" },
  { label: "CRLF", value: "CRLF" }
] satisfies Array<{ label: string; value: LineEnding }>;
const languageItems = [
  { label: "Plain Text", value: "plaintext" },
  { label: "JSON", value: "json" },
  { label: "YAML", value: "yaml" },
  { label: "HTML", value: "html" },
  { label: "XML", value: "xml" },
  { label: "Markdown", value: "markdown" },
  { label: "JavaScript", value: "javascript" },
  { label: "TypeScript", value: "typescript" },
  { label: "CSS", value: "css" },
  { label: "INI", value: "ini" },
  { label: "Python", value: "python" },
  { label: "Go", value: "go" },
  { label: "C", value: "c" },
  { label: "C++", value: "cpp" },
  { label: "Java", value: "java" },
  { label: "Rust", value: "rust" },
  { label: "Shell", value: "shell" },
  { label: "SQL", value: "sql" }
] satisfies Array<{ label: string; value: string }>;
const imageExtensions = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"]);
const textExtensions = new Set([
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
const languageMap: Record<string, string> = {
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
function editorLanguage(tab: EditorTab) {
  return tab.language;
}

function expectedLanguage(name: string) {
  return languageMap[fileExtension(name)] || "plaintext";
}

function detectContentLanguage(content: string, fallback: string) {
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

function updateDetectedLanguage(tab: EditorTab, content: string) {
  tab.expectedLanguage = expectedLanguage(tab.entry.name);
  tab.language = detectContentLanguage(content, tab.expectedLanguage);
  tab.contentLanguageMismatch =
    tab.expectedLanguage !== "plaintext" && tab.language !== "plaintext" && tab.language !== tab.expectedLanguage;
}

function languageLabel(value: string) {
  return languageItems.find((item) => item.value === value)?.label || value;
}
const dirty = (tab: EditorTab) =>
  tab.kind === "text" &&
  (tab.content !== tab.savedContent || tab.encoding !== tab.savedEncoding || tab.lineEnding !== tab.savedLineEnding);
const dirtyTabs = computed(() => tabs.value.filter((tab) => dirty(tab)));
const savingTabs = computed(() => tabs.value.filter((tab) => tab.saving));
const tabCloseDirtyCount = computed(() => tabCloseTargets.value.filter((tab) => dirty(tab)).length);
const tabIconMap: Record<string, string> = {
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

function fileExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() || "";
}

function tabIcon(tab: EditorTab) {
  if (tab.kind === "image") return "i-lucide-image";
  if (tab.kind === "unsupported" || tab.error) return "i-lucide-file-warning";
  const ext = fileExtension(tab.entry.name);
  return tabIconMap[ext] || "i-lucide-file-code-2";
}

function entryIcon(entry: SftpFileEntry, expanded = false) {
  if (entry.is_dir) return expanded ? "i-lucide-folder-open" : "i-lucide-folder";
  return tabIconMap[fileExtension(entry.name)] || "i-lucide-file";
}

function entryIconClass(entry: SftpFileEntry) {
  if (entry.is_dir) return "text-primary";
  const extension = fileExtension(entry.name);
  if (["crt", "pem", "csv", "xls", "xlsx"].includes(extension)) return "text-success";
  if (["json", "yaml", "yml", "toml", "ini", "conf", "env", "zip", "tar", "tgz", "gz", "xz"].includes(extension))
    return "text-warning";
  if (imageExtensions.has(extension) || ["js", "ts", "tsx", "jsx", "vue", "py", "go"].includes(extension))
    return "text-info";
  return "text-(--app-muted)";
}

function paneTabs(pane: EditorPane) {
  return tabs.value.filter((tab) => tab.pane === pane);
}

function paneActiveTab(pane: EditorPane) {
  return tabs.value.find((tab) => tab.pane === pane && tab.path === paneActivePaths[pane]) || null;
}

function subTabsForPane(pane: EditorPane) {
  return paneTabs(pane).map((tab) => ({
    id: tab.path,
    label: tab.entry.name,
    icon: tabIcon(tab),
    title: tab.path,
    dirty: dirty(tab)
  }));
}

function comparisonWindow(localContent: string, remoteContent: string) {
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

function changedLineCounts(before: string, after: string) {
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

function countChangedLines(value: string) {
  if (!value) return 0;
  let count = value.endsWith("\n") ? 0 : 1;
  for (let index = 0; index < value.length; index++) {
    if (value.charCodeAt(index) === 10) count++;
  }
  return count;
}

const conflictComparison = computed(() => {
  const conflict = saveConflict.value;
  return conflict ? comparisonWindow(conflict.tab.content, conflict.remoteContent) : null;
});
const localChangeComparison = computed(() => {
  const tab = localChangeTab.value;
  return tab ? comparisonWindow(tab.savedContent, tab.content) : null;
});
const localChangeStats = computed(() => {
  const tab = localChangeTab.value;
  return tab ? changedLineCounts(tab.savedContent, tab.content) : { added: 0, removed: 0 };
});

function tabChangeStats(tab: EditorTab) {
  return changedLineCounts(tab.savedContent, tab.content);
}

function openLocalChanges(tab = activeTab.value) {
  if (!tab || !dirty(tab)) return;
  localChangeTab.value = tab;
  localChangesOpen.value = true;
}

function joinPath(parent: string, name: string) {
  return `${parent.replace(/\/$/, "")}/${name}` || `/${name}`;
}

function parentPath(path: string) {
  const index = path.lastIndexOf("/");
  return index <= 0 ? "/" : path.slice(0, index);
}

function formatError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause);
  return message === SFTP_REQUEST_TIMEOUT_ERROR ? t("koko.sftpEditor.requestTimeout") : message;
}

function fileVersion(entry: SftpFileEntry | null | undefined) {
  return entry ? entry.version || metadataVersion(entry) : "";
}

function metadataVersion(entry: SftpFileEntry | null | undefined) {
  return entry ? `${entry.size}\u0000${entry.mod_time}\u0000${entry.perm}` : "";
}

async function contentVersion(buffer: ArrayBuffer) {
  if (!globalThis.crypto?.subtle) return "";
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return `sha256:${[...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function parseFileSize(size: string) {
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

function formatFileSize(size: string) {
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

function entryTitle(entry: SftpFileEntry, path: string) {
  const details = [path];
  if (!entry.is_dir) details.push(formatFileSize(entry.size));
  const modified = Number(entry.mod_time);
  if (Number.isFinite(modified) && modified > 0) details.push(new Date(modified * 1000).toLocaleString());
  return details.join("\n");
}

function beginExplorerResize(event: PointerEvent) {
  event.preventDefault();
  resizingExplorer.value = true;
}

function resizeExplorer(event: PointerEvent) {
  if (!resizingExplorer.value || !editorLayout.value) return;
  const left = editorLayout.value.getBoundingClientRect().left;
  explorerWidth.value = Math.min(480, Math.max(220, event.clientX - left));
}

function endExplorerResize() {
  resizingExplorer.value = false;
}

function beginSplitResize(event: PointerEvent) {
  event.preventDefault();
  resizingSplit.value = true;
}

function resizeSplit(event: PointerEvent) {
  if (!resizingSplit.value || !editorGroups.value) return;
  const bounds = editorGroups.value.getBoundingClientRect();
  splitRatio.value = Math.min(80, Math.max(20, ((event.clientX - bounds.left) / bounds.width) * 100));
}

function endSplitResize() {
  resizingSplit.value = false;
}

function decodeText(buffer: ArrayBuffer) {
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

function encodeText(content: string, encoding: TextEncoding, lineEnding: LineEnding) {
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

function createEditorTab(entry: SftpFileEntry, path: string, pane: EditorPane = activePane.value): EditorTab {
  return reactive({
    path,
    pane,
    entry,
    content: "",
    savedContent: "",
    kind: "empty",
    previewUrl: "",
    loading: true,
    saving: false,
    error: "",
    encoding: "utf-8",
    savedEncoding: "utf-8",
    lineEnding: "LF",
    savedLineEnding: "LF",
    remoteVersion: fileVersion(entry),
    remoteMetadataVersion: metadataVersion(entry),
    externalChanged: false,
    draftRestored: false,
    largeBlocked: false,
    lineWrapping: false,
    language: expectedLanguage(entry.name),
    expectedLanguage: expectedLanguage(entry.name),
    contentLanguageMismatch: false,
    cursorLine: 1,
    cursorColumn: 1
  });
}

function draftFromTab(tab: EditorTab): SftpEditorDraft {
  return {
    path: tab.path,
    entry: { ...tab.entry },
    content: tab.content,
    savedContent: tab.savedContent,
    encoding: tab.encoding,
    savedEncoding: tab.savedEncoding,
    lineEnding: tab.lineEnding,
    savedLineEnding: tab.savedLineEnding,
    remoteVersion: tab.remoteVersion,
    remoteMetadataVersion: tab.remoteMetadataVersion,
    updatedAt: Date.now()
  };
}

async function persistDirtyDraftsNow() {
  if (restoringDrafts.value) return;
  await Promise.all(
    tabs.value.map((tab) => (dirty(tab) ? drafts.save(draftFromTab(tab)) : drafts.remove(tab.path)))
  ).catch(() => undefined);
}

const persistDirtyDrafts = useDebounceFn(persistDirtyDraftsNow, 800);

const treeRows = computed<TreeRow[]>(() => {
  const rows: TreeRow[] = [];
  const query = search.value.trim().toLowerCase();
  const walk = (parent: string, depth: number) => {
    const node = tree.value[parent];
    if (pendingCreate.value?.parent === parent) {
      rows.push({ kind: "pending", path: `pending:${parent}`, depth, createKind: pendingCreate.value.kind });
    }
    for (const entry of node?.entries || []) {
      if (entry.name === "..") continue;
      const path = joinPath(parent, entry.name);
      if (!query || entry.name.toLowerCase().includes(query) || entry.is_dir) {
        rows.push({ kind: "entry", entry, path, depth, expanded: expanded.value.has(path) });
      }
      if (entry.is_dir && expanded.value.has(path)) walk(path, depth + 1);
    }
    if (parent !== rootPath.value && node?.loading) {
      rows.push({ kind: "loading", path: `loading:${parent}`, parent, depth });
    } else if (parent !== rootPath.value && node?.error) {
      rows.push({ kind: "error", path: `error:${parent}`, parent, depth, error: node.error });
    }
  };
  if (rootPath.value) walk(rootPath.value, 0);
  return rows;
});

function quickOpenScore(path: string, query: string) {
  if (!query) return 0;
  const normalizedPath = path.toLowerCase();
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  if (name === query) return 0;
  if (name.startsWith(query)) return 10 + name.length - query.length;
  const nameIndex = name.indexOf(query);
  if (nameIndex >= 0) return 30 + nameIndex;
  const pathIndex = normalizedPath.indexOf(query);
  if (pathIndex >= 0) return 60 + pathIndex;

  let queryIndex = 0;
  let gaps = 0;
  let lastMatch = -1;
  for (let index = 0; index < normalizedPath.length && queryIndex < query.length; index++) {
    if (normalizedPath[index] !== query[queryIndex]) continue;
    if (lastMatch >= 0) gaps += index - lastMatch - 1;
    lastMatch = index;
    queryIndex++;
  }
  return queryIndex === query.length ? 100 + gaps : Number.POSITIVE_INFINITY;
}

const quickOpenItems = computed<QuickOpenItem[]>(() => {
  const entries = new Map<string, SftpFileEntry>();
  for (const tab of tabs.value) entries.set(tab.path, tab.entry);
  for (const [parent, node] of Object.entries(tree.value)) {
    for (const entry of node.entries) {
      if (!entry.is_dir && entry.name !== "..") entries.set(joinPath(parent, entry.name), entry);
    }
  }
  const query = quickOpenQuery.value.trim().toLowerCase();
  return [...entries]
    .map(([path, entry]) => ({
      entry,
      path,
      open: tabs.value.some((tab) => tab.path === path),
      score: quickOpenScore(path, query)
    }))
    .filter((item) => Number.isFinite(item.score))
    .sort(
      (left, right) =>
        left.score - right.score ||
        Number(right.open) - Number(left.open) ||
        left.entry.name.localeCompare(right.entry.name)
    )
    .slice(0, 100)
    .map(({ entry, path, open }) => ({ entry, path, open }));
});

async function loadDirectory(path: string, force = false) {
  const existing = tree.value[path];
  if (existing?.loading || (existing && !force)) return;
  tree.value = { ...tree.value, [path]: { entries: existing?.entries || [], loading: true, error: "" } };
  try {
    const entries = await manager.operations.listDirectory(path, { background: true });
    tree.value = { ...tree.value, [path]: { entries: sortSftpEntries(entries), loading: false, error: "" } };
  } catch (cause) {
    tree.value = {
      ...tree.value,
      [path]: {
        entries: existing?.entries || [],
        loading: false,
        error: formatError(cause)
      }
    };
  }
}

function toggleDirectory(path: string) {
  const next = new Set(expanded.value);
  if (next.has(path)) {
    next.delete(path);
  } else {
    next.add(path);
    void loadDirectory(path);
  }
  expanded.value = next;
}

function collapseAll() {
  expanded.value = new Set();
}

function toggleSearch() {
  searchVisible.value = !searchVisible.value;
  if (!searchVisible.value) search.value = "";
}

function nameExists(parent: string, name: string) {
  return tree.value[parent]?.entries.some((entry) => entry.name === name) || false;
}

function beginCreate(kind: "file" | "directory") {
  const parent = selectedDirectory.value || rootPath.value;
  pendingCreate.value = { parent, kind };
  pendingName.value = "";
  pendingError.value = "";
  if (parent !== rootPath.value) {
    const next = new Set(expanded.value);
    next.add(parent);
    expanded.value = next;
    void loadDirectory(parent);
  }
  nextTick(() => pendingInput.value?.focus());
}

function cancelCreate() {
  if (pendingSubmitting.value) return;
  pendingCreate.value = null;
  pendingName.value = "";
  pendingError.value = "";
}

async function commitCreate() {
  if (!pendingCreate.value || pendingSubmitting.value) return;
  const { parent, kind } = pendingCreate.value;
  const name = pendingName.value.trim();
  pendingError.value = "";
  if (!name) {
    pendingError.value = t("koko.sftpEditor.nameRequired");
    return;
  }
  if (name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
    pendingError.value = t("koko.sftpEditor.nameCannotContainPathSeparator");
    return;
  }
  if (nameExists(parent, name)) {
    pendingError.value = t("koko.sftpEditor.nameAlreadyExists");
    return;
  }
  const path = joinPath(parent, name);
  pendingSubmitting.value = true;
  try {
    if (kind === "file") await manager.operations.createFileAt(path);
    else await manager.operations.createDirectoryAt(path);
    await loadDirectory(parent, true);
    if (kind === "file") {
      const entry =
        tree.value[parent]?.entries.find((item) => item.name === name) ||
        ({ name, size: "0", perm: "", mod_time: "", type: "", is_dir: false } satisfies SftpFileEntry);
      const tab = createEditorTab(entry, path);
      tab.kind = "text";
      tab.loading = false;
      tabs.value.push(tab);
      activePath.value = path;
    }
    pendingCreate.value = null;
    pendingName.value = "";
  } catch (cause) {
    pendingError.value = formatError(cause);
    nextTick(() => pendingInput.value?.focus());
  } finally {
    pendingSubmitting.value = false;
  }
}

async function refreshTree() {
  const paths = [rootPath.value, ...expanded.value].filter(Boolean);
  await Promise.all(paths.map((path) => loadDirectory(path, true)));
}

function openContextMenu(entry: SftpFileEntry, path: string, event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  contextTarget.value = { entry, path };
  contextMenuPosition.value = { x: event.clientX, y: event.clientY };
  contextMenuVisible.value = true;
  if (entry.is_dir) selectedDirectory.value = path;
}

function hideContextMenu() {
  contextMenuVisible.value = false;
  contextTarget.value = null;
}

function createFromContext(kind: "file" | "directory") {
  const target = contextTarget.value;
  if (!target?.entry.is_dir) return;
  selectedDirectory.value = target.path;
  hideContextMenu();
  beginCreate(kind);
}

function openRenameDialog() {
  const target = contextTarget.value;
  if (!target || target.path === rootPath.value) return;
  renameTarget.value = target;
  renameValue.value = target.entry.name;
  renameError.value = "";
  hideContextMenu();
  renameDialogOpen.value = true;
}

async function submitRename() {
  const target = renameTarget.value;
  if (!target || renameSubmitting.value) return;
  const name = renameValue.value.trim();
  renameError.value = "";
  if (!name) {
    renameError.value = t("koko.sftpEditor.nameRequired");
    return;
  }
  if (name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
    renameError.value = t("koko.sftpEditor.nameCannotContainPathSeparator");
    return;
  }

  const parent = parentPath(target.path);
  if (nameExists(parent, name)) {
    renameError.value = t("koko.sftpEditor.nameAlreadyExists");
    return;
  }

  const nextPath = joinPath(parent, name);
  const renamedDraftPaths = tabs.value
    .filter((tab) => tab.path === target.path || tab.path.startsWith(`${target.path}/`))
    .map((tab) => tab.path);
  renameSubmitting.value = true;
  try {
    await manager.operations.renamePath(target.path, name);

    tabs.value.forEach((tab) => {
      if (tab.path === target.path || tab.path.startsWith(`${target.path}/`)) {
        tab.path = `${nextPath}${tab.path.slice(target.path.length)}`;
        if (tab.path === nextPath) {
          tab.entry.name = name;
          updateDetectedLanguage(tab, tab.content);
        }
      }
    });

    for (const pane of ["left", "right"] satisfies EditorPane[]) {
      const panePath = paneActivePaths[pane];
      if (panePath === target.path || panePath.startsWith(`${target.path}/`)) {
        paneActivePaths[pane] = `${nextPath}${panePath.slice(target.path.length)}`;
      }
    }
    if (selectedDirectory.value === target.path || selectedDirectory.value.startsWith(`${target.path}/`))
      selectedDirectory.value = `${nextPath}${selectedDirectory.value.slice(target.path.length)}`;
    expanded.value = new Set(
      [...expanded.value].map((path) =>
        path === target.path || path.startsWith(`${target.path}/`)
          ? `${nextPath}${path.slice(target.path.length)}`
          : path
      )
    );
    tree.value = Object.fromEntries(
      Object.entries(tree.value).map(([path, node]) => [
        path === target.path || path.startsWith(`${target.path}/`)
          ? `${nextPath}${path.slice(target.path.length)}`
          : path,
        node
      ])
    );
    await Promise.all(renamedDraftPaths.map((path) => drafts.remove(path)));
    void persistDirtyDrafts();
    await loadDirectory(parent, true);
    renameDialogOpen.value = false;
  } catch (cause) {
    renameError.value = formatError(cause);
  } finally {
    renameSubmitting.value = false;
  }
}

function openDeleteDialog() {
  const target = contextTarget.value;
  if (!target || target.path === rootPath.value) return;
  hideContextMenu();
  alertTarget.value = { kind: "delete", target };
  alertDialogOpen.value = true;
}

function closeTabsNow(targets: EditorTab[]) {
  const paths = new Set(targets.map((tab) => tab.path));
  if (!paths.size) return;
  const previousTabs = tabs.value;
  for (const tab of previousTabs) {
    if (!paths.has(tab.path)) continue;
    void drafts.remove(tab.path);
    revokePreview(tab);
  }
  tabs.value = previousTabs.filter((tab) => !paths.has(tab.path));
  for (const pane of ["left", "right"] satisfies EditorPane[]) {
    const currentPath = paneActivePaths[pane];
    if (!paths.has(currentPath)) continue;
    const previousPaneTabs = previousTabs.filter((tab) => tab.pane === pane);
    const activeIndex = previousPaneTabs.findIndex((tab) => tab.path === currentPath);
    const nextTab = previousPaneTabs.slice(activeIndex + 1).find((tab) => !paths.has(tab.path));
    const previousTab = previousPaneTabs
      .slice(0, Math.max(0, activeIndex))
      .reverse()
      .find((tab) => !paths.has(tab.path));
    paneActivePaths[pane] = nextTab?.path || previousTab?.path || "";
  }
  if (!paneTabs("right").length) {
    splitOpen.value = false;
    paneActivePaths.right = "";
    if (activePane.value === "right") activePane.value = "left";
  } else if (!paneTabs(activePane.value).length) {
    activePane.value = activePane.value === "left" ? "right" : "left";
  }
}

function closeTabNow(tab: EditorTab) {
  closeTabsNow([tab]);
}

function reorderTabs(sourceId: string, targetId: string, placement: "before" | "after") {
  if (sourceId === targetId) return;
  const source = tabs.value.find((tab) => tab.path === sourceId);
  const target = tabs.value.find((tab) => tab.path === targetId);
  if (!source || !target) return;
  if (source.pane !== target.pane) moveTabToPane(source, target.pane);
  const orderedPaneTabs = paneTabs(source.pane);
  const sourceIndex = orderedPaneTabs.findIndex((tab) => tab.path === sourceId);
  const [moved] = orderedPaneTabs.splice(sourceIndex, 1);
  if (!moved) return;
  const targetIndex = orderedPaneTabs.findIndex((tab) => tab.path === targetId);
  orderedPaneTabs.splice(targetIndex + (placement === "after" ? 1 : 0), 0, moved);
  const otherPaneTabs = tabs.value.filter((tab) => tab.pane !== source.pane);
  tabs.value = source.pane === "left" ? [...orderedPaneTabs, ...otherPaneTabs] : [...otherPaneTabs, ...orderedPaneTabs];
}

function moveTabToPane(tab: EditorTab, pane: EditorPane) {
  if (tab.pane === pane) {
    focusPane(pane, tab.path);
    return;
  }
  const sourcePane = tab.pane;
  const sourcePaneTabs = paneTabs(sourcePane);
  const sourceIndex = sourcePaneTabs.findIndex((item) => item.path === tab.path);
  const replacement = sourcePaneTabs[sourceIndex + 1] || sourcePaneTabs[sourceIndex - 1] || null;
  tab.pane = pane;
  const remainingTabs = tabs.value.filter((item) => item.path !== tab.path);
  const leftTabs = remainingTabs.filter((item) => item.pane === "left");
  const rightTabs = remainingTabs.filter((item) => item.pane === "right");
  if (pane === "left") leftTabs.push(tab);
  else rightTabs.push(tab);
  tabs.value = [...leftTabs, ...rightTabs];
  paneActivePaths[sourcePane] = replacement?.path || "";
  paneActivePaths[pane] = tab.path;
  if (pane === "right") splitOpen.value = true;
  activePane.value = pane;
}

function focusPane(pane: EditorPane, path = paneActivePaths[pane]) {
  activePane.value = pane;
  paneActivePaths[pane] = path;
}

function beginTabDrag(path: string) {
  const tab = tabs.value.find((item) => item.path === path);
  if (!tab) return;
  draggedEditorItem.value = { entry: tab.entry, path, source: "tab" };
}

function beginTreeDrag(entry: SftpFileEntry, path: string, event: DragEvent) {
  if (entry.is_dir || !event.dataTransfer) {
    event.preventDefault();
    return;
  }
  draggedEditorItem.value = { entry, path, source: "tree" };
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData(editorDragMime, JSON.stringify({ path, source: "tree" }));
  event.dataTransfer.setData("text/plain", path);
}

function endEditorDrag() {
  draggedEditorItem.value = null;
  editorDropPane.value = null;
}

function entryForPath(path: string) {
  const tab = tabs.value.find((item) => item.path === path);
  if (tab) return tab.entry;
  const parent = parentPath(path);
  const name = path.slice(path.lastIndexOf("/") + 1);
  return tree.value[parent]?.entries.find((entry) => !entry.is_dir && entry.name === name) || null;
}

function draggedItemFromEvent(event: DragEvent) {
  if (draggedEditorItem.value) return draggedEditorItem.value;
  const payload = event.dataTransfer?.getData(editorDragMime);
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as { path?: string; source?: "tab" | "tree" };
    if (!parsed.path) return null;
    const entry = entryForPath(parsed.path);
    return entry ? { entry, path: parsed.path, source: parsed.source || "tree" } : null;
  } catch {
    return null;
  }
}

function paneAtPointer(event: DragEvent): EditorPane {
  if (!editorGroups.value) return activePane.value;
  const bounds = editorGroups.value.getBoundingClientRect();
  const offset = Math.min(bounds.width, Math.max(0, event.clientX - bounds.left));
  if (!splitOpen.value) return offset >= bounds.width * 0.68 ? "right" : "left";
  return offset < (bounds.width * splitRatio.value) / 100 ? "left" : "right";
}

function updateEditorDropTarget(event: DragEvent) {
  if (!draggedItemFromEvent(event)) return;
  event.preventDefault();
  editorDropPane.value = paneAtPointer(event);
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = draggedEditorItem.value?.source === "tab" ? "move" : "copy";
  }
}

function leaveEditorDropTarget(event: DragEvent) {
  const container = event.currentTarget as HTMLElement;
  const relatedTarget = event.relatedTarget as Node | null;
  if (relatedTarget && container.contains(relatedTarget)) return;
  editorDropPane.value = null;
}

function dropEditorItem(event: DragEvent) {
  const item = draggedItemFromEvent(event);
  if (!item) return;
  event.preventDefault();
  const pane = editorDropPane.value || paneAtPointer(event);
  endEditorDrag();
  const tab = tabs.value.find((candidate) => candidate.path === item.path);
  if (item.source === "tab" && tab) {
    moveTabToPane(tab, pane);
    return;
  }
  void openFileInPane(item.entry, item.path, pane, true);
}

function openQuickOpen() {
  quickOpenQuery.value = "";
  quickOpenIndex.value = 0;
  quickOpenVisible.value = true;
}

function moveQuickOpenSelection(offset: number) {
  const count = quickOpenItems.value.length;
  if (!count) return;
  quickOpenIndex.value = (quickOpenIndex.value + offset + count) % count;
  void nextTick(() => {
    quickOpenList.value
      ?.querySelector<HTMLElement>('[data-quick-open-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  });
}

function openQuickOpenItem(item: QuickOpenItem | undefined) {
  if (!item) return;
  quickOpenVisible.value = false;
  void openFileInPane(item.entry, item.path, activePane.value);
}

function splitEditor(tab: EditorTab) {
  splitOpen.value = true;
  if (tab.pane === "left" && paneTabs("left").length > 1) {
    moveTabToPane(tab, "right");
    return;
  }
  activePane.value = "right";
  paneActivePaths.right ||= paneTabs("right")[0]?.path || "";
}

function closeSplitEditor() {
  const rightTabs = paneTabs("right");
  const rightActivePath = paneActivePaths.right;
  for (const tab of rightTabs) tab.pane = "left";
  if (activePane.value === "right" && rightActivePath) paneActivePaths.left = rightActivePath;
  paneActivePaths.right = "";
  splitOpen.value = false;
  activePane.value = "left";
}

function moveTabToEdge(path: string, edge: "first" | "last") {
  const tab = tabs.value.find((item) => item.path === path);
  if (!tab) return;
  const orderedPaneTabs = paneTabs(tab.pane);
  const index = orderedPaneTabs.findIndex((item) => item.path === path);
  if (index < 0 || (edge === "first" && index === 0) || (edge === "last" && index === orderedPaneTabs.length - 1))
    return;
  const [source] = orderedPaneTabs.splice(index, 1);
  if (!source) return;
  if (edge === "first") orderedPaneTabs.unshift(source);
  else orderedPaneTabs.push(source);
  const otherPaneTabs = tabs.value.filter((item) => item.pane !== tab.pane);
  tabs.value = tab.pane === "left" ? [...orderedPaneTabs, ...otherPaneTabs] : [...otherPaneTabs, ...orderedPaneTabs];
}

function openTabContextMenu(path: string, event: MouseEvent) {
  const tab = tabs.value.find((item) => item.path === path);
  if (tab) focusPane(tab.pane, tab.path);
  tabContextPath.value = path;
  tabContextMenuPosition.value = { x: event.clientX, y: event.clientY };
  tabContextMenuVisible.value = true;
}

function hideTabContextMenu() {
  tabContextMenuVisible.value = false;
}

function requestCloseTabs(targets: EditorTab[]) {
  const existingPaths = new Set(tabs.value.map((tab) => tab.path));
  const uniqueTargets = [...new Map(targets.map((tab) => [tab.path, tab])).values()].filter((tab) =>
    existingPaths.has(tab.path)
  );
  if (!uniqueTargets.length) return;
  if (uniqueTargets.some((tab) => tab.saving)) {
    toast.add({
      title: t("koko.sftpEditor.saveInProgress"),
      color: "warning"
    });
    return;
  }
  if (!uniqueTargets.some((tab) => dirty(tab))) {
    closeTabsNow(uniqueTargets);
    return;
  }
  tabCloseTargets.value = uniqueTargets;
  tabCloseDialogOpen.value = true;
}

async function confirmAlert() {
  const target = alertTarget.value;
  if (!target || alertSubmitting.value) return;
  if (target.kind === "unsaved-close") {
    closeTabNow(target.tab);
    alertDialogOpen.value = false;
    return;
  }
  alertSubmitting.value = true;
  try {
    await manager.operations.removePath(target.target.path);
    for (const tab of tabs.value.filter(
      (tab) => tab.path === target.target.path || tab.path.startsWith(`${target.target.path}/`)
    )) {
      void drafts.remove(tab.path);
      revokePreview(tab);
    }
    tabs.value = tabs.value.filter(
      (tab) => tab.path !== target.target.path && !tab.path.startsWith(`${target.target.path}/`)
    );
    for (const pane of ["left", "right"] satisfies EditorPane[]) {
      const panePath = paneActivePaths[pane];
      if (panePath !== target.target.path && !panePath.startsWith(`${target.target.path}/`)) continue;
      paneActivePaths[pane] = paneTabs(pane).at(-1)?.path || "";
    }
    if (!paneTabs("right").length) {
      splitOpen.value = false;
      if (activePane.value === "right") activePane.value = "left";
    }
    if (selectedDirectory.value === target.target.path || selectedDirectory.value.startsWith(`${target.target.path}/`))
      selectedDirectory.value = rootPath.value;
    await loadDirectory(parentPath(target.target.path), true);
    alertDialogOpen.value = false;
  } catch (cause) {
    const message = formatError(cause);
    toast.add({
      title: t("koko.actions.delete"),
      description: message,
      color: "error",
      actions: [{ label: t("koko.actions.retry"), color: "error", variant: "soft", onClick: () => void confirmAlert() }]
    });
  } finally {
    alertSubmitting.value = false;
  }
}

function downloadContextTarget() {
  const target = contextTarget.value;
  if (!target) return;
  hideContextMenu();
  manager.operations.downloadPath(target.path, target.entry.is_dir);
}

function openContextTargetToSide() {
  const target = contextTarget.value;
  if (!target || target.entry.is_dir) return;
  const pane: EditorPane = activePane.value === "left" ? "right" : "left";
  hideContextMenu();
  void openFileInPane(target.entry, target.path, pane, true);
}

function chooseUpload() {
  if (!contextTarget.value?.entry.is_dir) return;
  uploadDirectory.value = contextTarget.value.path;
  uploadInput.value?.click();
}

async function uploadFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files || [])];
  const directory = uploadDirectory.value;
  hideContextMenu();
  uploadDirectory.value = "";
  input.value = "";
  if (!directory || files.length === 0) return;
  const results = await Promise.allSettled(
    files.map((file) => manager.operations.uploadFile(file, joinPath(directory, file.name)))
  );
  const succeeded = results.filter((result) => result.status === "fulfilled").length;
  if (succeeded) {
    toast.add({
      title:
        succeeded === files.length
          ? t("koko.fileManagement.uploadedFiles", { count: succeeded })
          : t("koko.fileManagement.uploadedFilesPartial", { success: succeeded, total: files.length }),
      color: succeeded === files.length ? "success" : "warning"
    });
  }
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") {
    toast.add({
      title: t("koko.fileManagement.operationFailed"),
      description: formatError(failure.reason),
      color: "error"
    });
  }
  await loadDirectory(directory, true);
}

const contextMenuItems = computed(() => {
  const target = contextTarget.value;
  if (!target) return [];
  const directoryActions = target.entry.is_dir
    ? [
        {
          label: t("koko.sftpEditor.newFile"),
          icon: "i-lucide-file-plus-2",
          onSelect: () => createFromContext("file")
        },
        {
          label: t("koko.sftpEditor.newDirectory"),
          icon: "i-lucide-folder-plus",
          onSelect: () => createFromContext("directory")
        },
        { label: t("koko.actions.upload"), icon: "i-lucide-upload", onSelect: chooseUpload },
        { type: "separator" as const }
      ]
    : [];
  const fileActions = target.entry.is_dir
    ? []
    : [
        {
          label: t("koko.sftpEditor.openToSide"),
          icon: "i-lucide-columns-2",
          onSelect: openContextTargetToSide
        },
        { type: "separator" as const }
      ];
  return [
    ...directoryActions,
    ...fileActions,
    { label: t("koko.actions.download"), icon: "i-lucide-download", onSelect: downloadContextTarget },
    {
      label: t("koko.actions.rename"),
      icon: "i-lucide-pencil",
      disabled: target.path === rootPath.value,
      onSelect: openRenameDialog
    },
    { type: "separator" as const },
    {
      label: t("koko.actions.delete"),
      icon: "i-lucide-trash-2",
      color: "error" as const,
      disabled: target.path === rootPath.value,
      onSelect: openDeleteDialog
    }
  ];
});

const tabContextMenuItems = computed(() => {
  const tab = tabs.value.find((item) => item.path === tabContextPath.value);
  if (!tab) return [];
  const currentPaneTabs = paneTabs(tab.pane);
  const index = currentPaneTabs.findIndex((item) => item.path === tab.path);
  const closeTargets = (targets: EditorTab[]) => {
    hideTabContextMenu();
    requestCloseTabs(targets);
  };
  return [
    {
      label: t("koko.sftpEditor.moveTabFirst"),
      icon: "i-lucide-chevrons-left",
      disabled: index === 0,
      onSelect: () => {
        hideTabContextMenu();
        moveTabToEdge(tab.path, "first");
      }
    },
    {
      label: t("koko.sftpEditor.moveTabLast"),
      icon: "i-lucide-chevrons-right",
      disabled: index === currentPaneTabs.length - 1,
      onSelect: () => {
        hideTabContextMenu();
        moveTabToEdge(tab.path, "last");
      }
    },
    {
      label: tab.pane === "left" ? t("koko.sftpEditor.moveToRightEditor") : t("koko.sftpEditor.moveToLeftEditor"),
      icon: tab.pane === "left" ? "i-lucide-panel-right-open" : "i-lucide-panel-left-open",
      onSelect: () => {
        hideTabContextMenu();
        moveTabToPane(tab, tab.pane === "left" ? "right" : "left");
      }
    },
    { type: "separator" as const },
    {
      label: t("koko.sftpEditor.closeTab"),
      icon: "i-lucide-x",
      onSelect: () => {
        hideTabContextMenu();
        closeTab(tab);
      }
    },
    {
      label: t("koko.sftpEditor.closeOtherTabs"),
      icon: "i-lucide-gallery-horizontal-end",
      disabled: currentPaneTabs.length < 2,
      onSelect: () => closeTargets(currentPaneTabs.filter((item) => item.path !== tab.path))
    },
    {
      label: t("koko.sftpEditor.closeTabsToLeft"),
      icon: "i-lucide-panel-left-close",
      disabled: index === 0,
      onSelect: () => closeTargets(currentPaneTabs.slice(0, index))
    },
    {
      label: t("koko.sftpEditor.closeTabsToRight"),
      icon: "i-lucide-panel-right-close",
      disabled: index === currentPaneTabs.length - 1,
      onSelect: () => closeTargets(currentPaneTabs.slice(index + 1))
    },
    {
      label: t("koko.sftpEditor.closeAllTabs"),
      icon: "i-lucide-copy-x",
      onSelect: () => closeTargets(currentPaneTabs)
    }
  ];
});

function revokePreview(tab: EditorTab) {
  if (tab.previewUrl) URL.revokeObjectURL(tab.previewUrl);
  tab.previewUrl = "";
}

function blockLargeFile(tab: EditorTab) {
  tab.kind = "unsupported";
  tab.largeBlocked = true;
  tab.error = t("koko.sftpEditor.fileTooLarge", { size: "10 MB" });
}

async function loadTab(tab: EditorTab, forceLarge = false, draft?: SftpEditorDraft) {
  revokePreview(tab);
  tab.loading = true;
  tab.error = "";
  tab.largeBlocked = false;
  try {
    const reportedSize = parseFileSize(tab.entry.size);
    if (!forceLarge && reportedSize > maxEditorBytes) {
      blockLargeFile(tab);
      return;
    }

    const blob = await manager.operations.readFile(tab.entry, tab.path);
    if (!forceLarge && blob.size > maxEditorBytes) {
      // ponytail: the legacy koko download command has no stat/range phase, so an
      // unknown-size file is already transferred here. Upgrade to ranged reads when
      // the server exposes metadata before content.
      blockLargeFile(tab);
      return;
    }

    const extension = tab.entry.name.split(".").pop()?.toLowerCase() || "";
    if (imageExtensions.has(extension)) {
      tab.kind = "image";
      tab.previewUrl = URL.createObjectURL(blob);
      return;
    }
    if (!textExtensions.has(extension) && blob.size >= 1024 * 1024) {
      tab.kind = "unsupported";
      return;
    }

    const buffer = await blob.arrayBuffer();
    const decoded = decodeText(buffer);
    if (decoded.content.includes("\0")) throw new Error("binary_file");
    tab.kind = "text";
    const currentVersion = (await contentVersion(buffer)) || fileVersion(tab.entry);
    tab.remoteMetadataVersion = metadataVersion(tab.entry);
    tab.externalChanged = false;
    if (draft) {
      tab.content = draft.content;
      tab.savedContent = draft.savedContent;
      tab.encoding = draft.encoding as TextEncoding;
      tab.savedEncoding = (draft.savedEncoding || decoded.encoding) as TextEncoding;
      tab.lineEnding = draft.lineEnding as LineEnding;
      tab.savedLineEnding = (draft.savedLineEnding || decoded.lineEnding) as LineEnding;
      tab.remoteVersion = draft.remoteVersion;
      tab.remoteMetadataVersion = draft.remoteMetadataVersion;
      tab.externalChanged = Boolean(draft.remoteVersion && draft.remoteVersion !== currentVersion);
      tab.draftRestored = true;
      updateDetectedLanguage(tab, draft.content);
    } else {
      tab.content = decoded.content;
      tab.savedContent = decoded.content;
      tab.encoding = decoded.encoding;
      tab.savedEncoding = decoded.encoding;
      tab.lineEnding = decoded.lineEnding;
      tab.savedLineEnding = decoded.lineEnding;
      tab.remoteVersion = currentVersion;
      tab.draftRestored = false;
      updateDetectedLanguage(tab, decoded.content);
    }
  } catch (cause) {
    if (draft) {
      tab.kind = "text";
      tab.content = draft.content;
      tab.savedContent = draft.savedContent;
      tab.encoding = draft.encoding as TextEncoding;
      tab.savedEncoding = (draft.savedEncoding || draft.encoding) as TextEncoding;
      tab.lineEnding = draft.lineEnding as LineEnding;
      tab.savedLineEnding = (draft.savedLineEnding || draft.lineEnding) as LineEnding;
      tab.remoteVersion = draft.remoteVersion;
      tab.remoteMetadataVersion = draft.remoteMetadataVersion;
      tab.externalChanged = true;
      tab.draftRestored = true;
      updateDetectedLanguage(tab, draft.content);
      tab.error = formatError(cause);
      return;
    }
    tab.kind = "unsupported";
    tab.error =
      cause instanceof Error && cause.message === "unsupported_text_encoding"
        ? t("koko.sftpEditor.unsupportedEncoding")
        : cause instanceof Error && cause.message === "binary_file"
          ? t("koko.sftpEditor.unsupportedPreview")
          : formatError(cause);
  } finally {
    tab.loading = false;
  }
}

async function openFileInPane(entry: SftpFileEntry, path: string, pane: EditorPane, moveExisting = false) {
  const existing = tabs.value.find((tab) => tab.path === path);
  if (existing) {
    if (existing.pane !== pane && moveExisting) moveTabToPane(existing, pane);
    else if (existing.pane !== pane) focusPane(existing.pane, path);
    else focusPane(pane, path);
    return;
  }
  if (pane === "right") splitOpen.value = true;
  const tab = createEditorTab(entry, path, pane);
  tabs.value.push(tab);
  focusPane(pane, path);
  await loadTab(tab);
}

async function openEntry(entry: SftpFileEntry, path: string) {
  if (entry.is_dir) {
    selectedDirectory.value = path;
    toggleDirectory(path);
    return;
  }
  await openFileInPane(entry, path, activePane.value);
}

function applyStoredDraft(tab: EditorTab, draft: SftpEditorDraft) {
  tab.kind = "text";
  tab.loading = false;
  tab.content = draft.content;
  tab.savedContent = draft.savedContent;
  tab.encoding = draft.encoding as TextEncoding;
  tab.savedEncoding = (draft.savedEncoding || draft.encoding) as TextEncoding;
  tab.lineEnding = draft.lineEnding as LineEnding;
  tab.savedLineEnding = (draft.savedLineEnding || draft.lineEnding) as LineEnding;
  tab.remoteVersion = draft.remoteVersion;
  tab.remoteMetadataVersion = draft.remoteMetadataVersion;
  tab.externalChanged = false;
  tab.draftRestored = true;
  updateDetectedLanguage(tab, draft.content);
}

async function verifyRestoredDrafts(restored: Array<{ tab: EditorTab; draft: SftpEditorDraft }>) {
  const directories = new Map<string, Array<{ tab: EditorTab; draft: SftpEditorDraft }>>();
  for (const item of restored) {
    const directory = parentPath(item.tab.path);
    directories.set(directory, [...(directories.get(directory) || []), item]);
  }
  await Promise.allSettled(
    [...directories].map(async ([directory, items]) => {
      const entries = sortSftpEntries(await manager.operations.listDirectory(directory, { background: true }));
      tree.value = { ...tree.value, [directory]: { entries, loading: false, error: "" } };
      for (const { tab, draft } of items) {
        if (!tabs.value.includes(tab)) continue;
        const remoteEntry = entries.find((entry) => entry.name === tab.entry.name) || null;
        if (remoteEntry) tab.entry = remoteEntry;
        tab.externalChanged =
          !remoteEntry ||
          Boolean(draft.remoteMetadataVersion && metadataVersion(remoteEntry) !== draft.remoteMetadataVersion);
      }
    })
  );
}

let restoredStoredDrafts = false;
async function restoreStoredDrafts() {
  if (restoredStoredDrafts || restoringDrafts.value || !rootPath.value) return;
  restoredStoredDrafts = true;
  restoringDrafts.value = true;
  try {
    const storedDrafts = (await drafts.list()).slice(0, 10);
    const restored: Array<{ tab: EditorTab; draft: SftpEditorDraft }> = [];
    for (const draft of storedDrafts) {
      if (tabs.value.some((tab) => tab.path === draft.path)) continue;
      const tab = createEditorTab(draft.entry, draft.path, "left");
      applyStoredDraft(tab, draft);
      tabs.value.push(tab);
      restored.push({ tab, draft });
    }
    if (restored.length) {
      activePath.value ||= restored[0]?.tab.path || "";
      toast.add({
        title: t("koko.sftpEditor.draftsRestored", { count: restored.length }),
        description: t("koko.sftpEditor.draftsRestoredDescription"),
        color: "info"
      });
      void verifyRestoredDrafts(restored);
    }
  } catch {
    // Draft storage can be unavailable in private or restricted browser modes.
  } finally {
    restoringDrafts.value = false;
  }
}

function closeTab(tab: EditorTab) {
  if (tab.saving) {
    toast.add({
      title: t("koko.sftpEditor.saveInProgress"),
      color: "warning"
    });
    return;
  }
  if (!dirty(tab)) {
    closeTabNow(tab);
    return;
  }
  alertTarget.value = { kind: "unsaved-close", tab };
  alertDialogOpen.value = true;
}

function updateCursor(tab: EditorTab | null, line: number, column: number) {
  if (!tab) return;
  tab.cursorLine = line;
  tab.cursorColumn = column;
}

async function fetchRemoteEntry(tab: EditorTab) {
  const directory = parentPath(tab.path);
  const entries = await manager.operations.listDirectory(directory, { background: true });
  tree.value = {
    ...tree.value,
    [directory]: { entries: sortSftpEntries(entries), loading: false, error: "" }
  };
  return entries.find((entry) => entry.name === tab.entry.name) || null;
}

async function showSaveConflict(tab: EditorTab, remoteEntry: SftpFileEntry | null) {
  const conflict = reactive<SaveConflict>({
    tab,
    remoteEntry,
    remoteContent: "",
    loading: Boolean(remoteEntry),
    error: ""
  });
  saveConflict.value = conflict;
  if (!remoteEntry) return;
  try {
    const blob = await manager.operations.readFile(remoteEntry, tab.path);
    conflict.remoteContent = decodeText(await blob.arrayBuffer()).content;
  } catch (cause) {
    conflict.error = formatError(cause);
  } finally {
    conflict.loading = false;
  }
}

async function save(tab = activeTab.value, overwrite = false): Promise<boolean> {
  if (!tab) return true;
  if (!dirty(tab) && !overwrite) return true;
  if (tab.saving) return false;
  const snapshot = {
    content: tab.content,
    encoding: tab.encoding,
    lineEnding: tab.lineEnding
  };
  tab.saving = true;
  tab.error = "";
  try {
    if (!overwrite && tab.remoteVersion && !tab.remoteVersion.startsWith("sha256:")) {
      const remoteEntry = await fetchRemoteEntry(tab);
      if (!remoteEntry || fileVersion(remoteEntry) !== tab.remoteVersion) {
        await showSaveConflict(tab, remoteEntry);
        return false;
      }
    }

    const bytes = encodeText(snapshot.content, snapshot.encoding, snapshot.lineEnding);
    const remoteEntry = await manager.operations.saveFile(tab.path, bytes, {
      expectedVersion: overwrite ? undefined : tab.remoteVersion,
      force: overwrite
    });
    tab.savedContent = snapshot.content;
    tab.savedEncoding = snapshot.encoding;
    tab.savedLineEnding = snapshot.lineEnding;
    tab.entry = remoteEntry;
    tab.remoteVersion = fileVersion(remoteEntry);
    tab.remoteMetadataVersion = metadataVersion(remoteEntry);
    tab.externalChanged = false;
    tab.draftRestored = false;
    if (dirty(tab)) void persistDirtyDrafts();
    else await drafts.remove(tab.path);
    return true;
  } catch (cause) {
    if (cause instanceof SftpFileConflictError) {
      const remoteEntry = await fetchRemoteEntry(tab).catch(() => null);
      await showSaveConflict(tab, remoteEntry);
      return false;
    }
    tab.error = formatError(cause);
    return false;
  } finally {
    tab.saving = false;
  }
}

async function saveAll() {
  if (saveAllRunning.value || savingTabs.value.length) return false;
  saveAllRunning.value = true;
  try {
    const pending = [...dirtyTabs.value];
    for (const tab of pending) {
      activePath.value = tab.path;
      if (!(await save(tab))) return false;
    }
    if (pending.length) {
      toast.add({
        title: t("koko.sftpEditor.savedAll", { count: pending.length }),
        color: "success"
      });
    }
    return true;
  } finally {
    saveAllRunning.value = false;
  }
}

function triggerSaveAll() {
  void saveAll();
}

async function saveAndCloseTab() {
  const target = alertTarget.value;
  if (target?.kind !== "unsaved-close" || alertSubmitting.value) return;
  alertSubmitting.value = true;
  try {
    if (!(await save(target.tab)) || dirty(target.tab)) return;
    closeTabNow(target.tab);
    alertDialogOpen.value = false;
  } finally {
    alertSubmitting.value = false;
  }
}

async function saveAndCloseTabs() {
  if (tabCloseSubmitting.value) return;
  tabCloseSubmitting.value = true;
  const targets = [...tabCloseTargets.value];
  try {
    for (const tab of targets) {
      if (!tabs.value.includes(tab) || !dirty(tab)) continue;
      activePath.value = tab.path;
      if (!(await save(tab)) || dirty(tab)) {
        tabCloseDialogOpen.value = false;
        tabCloseTargets.value = [];
        return;
      }
    }
    closeTabsNow(targets.filter((tab) => tabs.value.includes(tab)));
    tabCloseDialogOpen.value = false;
    tabCloseTargets.value = [];
  } finally {
    tabCloseSubmitting.value = false;
  }
}

function discardAndCloseTabs() {
  if (tabCloseSubmitting.value) return;
  closeTabsNow(tabCloseTargets.value);
  tabCloseTargets.value = [];
  tabCloseDialogOpen.value = false;
}

async function overwriteConflict() {
  const conflict = saveConflict.value;
  if (!conflict || conflictSubmitting.value) return;
  conflictSubmitting.value = true;
  saveConflict.value = null;
  try {
    await save(conflict.tab, true);
  } finally {
    conflictSubmitting.value = false;
  }
}

async function reloadConflict() {
  const conflict = saveConflict.value;
  if (!conflict || conflictSubmitting.value) return;
  conflictSubmitting.value = true;
  saveConflict.value = null;
  try {
    if (!conflict.remoteEntry) {
      conflict.tab.error = t("koko.sftpEditor.remoteFileDeleted");
      return;
    }
    await drafts.remove(conflict.tab.path);
    conflict.tab.entry = conflict.remoteEntry;
    conflict.tab.remoteVersion = fileVersion(conflict.remoteEntry);
    conflict.tab.remoteMetadataVersion = metadataVersion(conflict.remoteEntry);
    conflict.tab.externalChanged = false;
    await loadTab(conflict.tab);
  } finally {
    conflictSubmitting.value = false;
  }
}

async function compareRemote(tab = activeTab.value) {
  if (!tab) return;
  const remoteEntry = await fetchRemoteEntry(tab).catch(() => null);
  await showSaveConflict(tab, remoteEntry);
}

async function reloadRemote(tab = activeTab.value) {
  if (!tab) return;
  const remoteEntry = await fetchRemoteEntry(tab).catch(() => null);
  if (!remoteEntry || dirty(tab)) {
    await showSaveConflict(tab, remoteEntry);
    return;
  }
  tab.entry = remoteEntry;
  tab.remoteVersion = fileVersion(remoteEntry);
  tab.remoteMetadataVersion = metadataVersion(remoteEntry);
  tab.externalChanged = false;
  await drafts.remove(tab.path);
  await loadTab(tab);
}

async function checkActiveRemote() {
  const tab = activeTab.value;
  if (
    !tab ||
    tab.kind !== "text" ||
    tab.loading ||
    tab.saving ||
    remoteCheckInProgress.value ||
    document.visibilityState !== "visible"
  )
    return;
  remoteCheckInProgress.value = true;
  try {
    const remoteEntry = await fetchRemoteEntry(tab);
    if (!remoteEntry || metadataVersion(remoteEntry) !== tab.remoteMetadataVersion) {
      tab.externalChanged = true;
    }
  } catch {
    // Connection errors already surface through the manager. Polling stays quiet.
  } finally {
    remoteCheckInProgress.value = false;
  }
}

async function openLargeFile(tab: EditorTab) {
  await loadTab(tab, true);
}

let workspaceClosePromise: Promise<boolean> | null = null;
function requestClose() {
  if (savingTabs.value.length > 0) {
    toast.add({
      title: t("koko.sftpEditor.saveInProgress"),
      color: "warning"
    });
    return Promise.resolve(false);
  }
  if (dirtyTabs.value.length === 0) return Promise.resolve(true);
  if (workspaceClosePromise) return workspaceClosePromise;
  workspaceCloseDialogOpen.value = true;
  workspaceClosePromise = new Promise<boolean>((resolve) => {
    workspaceCloseResolver = resolve;
  });
  return workspaceClosePromise;
}

function resolveWorkspaceClose(confirmed: boolean) {
  const resolve = workspaceCloseResolver;
  workspaceCloseResolver = null;
  workspaceClosePromise = null;
  workspaceCloseDialogOpen.value = false;
  resolve?.(confirmed);
}

async function saveAllAndClose() {
  workspaceCloseDialogOpen.value = false;
  const saved = await saveAll();
  resolveWorkspaceClose(saved && dirtyTabs.value.length === 0);
}

async function discardAllAndClose() {
  await Promise.all(dirtyTabs.value.map((tab) => drafts.remove(tab.path)));
  resolveWorkspaceClose(true);
}

defineExpose({ requestClose });

useEventListener(window, "keydown", (event: KeyboardEvent) => {
  const modifier = event.metaKey || event.ctrlKey;
  if (modifier && !event.shiftKey && event.key.toLowerCase() === "p") {
    event.preventDefault();
    openQuickOpen();
    return;
  }
  if (modifier && !event.shiftKey && event.key === "\\" && activeTab.value) {
    event.preventDefault();
    splitEditor(activeTab.value);
    return;
  }
  if (modifier && !event.shiftKey && !event.altKey && (event.key === "1" || event.key === "2")) {
    event.preventDefault();
    const pane: EditorPane = event.key === "1" ? "left" : "right";
    if (pane === "right" && !splitOpen.value && activeTab.value) splitEditor(activeTab.value);
    else focusPane(pane);
    return;
  }
  if (modifier && event.key.toLowerCase() === "s" && activeTab.value) {
    event.preventDefault();
    if (event.shiftKey) void saveAll();
    else void save();
    return;
  }
  if (modifier && !event.shiftKey && event.key.toLowerCase() === "w" && activeTab.value) {
    event.preventDefault();
    closeTab(activeTab.value);
    return;
  }
  const activePaneTabs = paneTabs(activePane.value);
  if (event.ctrlKey && event.key === "Tab" && activePaneTabs.length > 1) {
    event.preventDefault();
    const index = activePaneTabs.findIndex((tab) => tab.path === activePath.value);
    const offset = event.shiftKey ? -1 : 1;
    paneActivePaths[activePane.value] =
      activePaneTabs[(index + offset + activePaneTabs.length) % activePaneTabs.length]?.path || activePath.value;
  }
});
useEventListener(window, "focus", () => void checkActiveRemote());
useEventListener(window, "pointermove", resizeExplorer);
useEventListener(window, "pointerup", endExplorerResize);
useEventListener(window, "pointermove", resizeSplit);
useEventListener(window, "pointerup", endSplitResize);
useEventListener(document, "visibilitychange", () => {
  if (document.visibilityState === "hidden") void persistDirtyDraftsNow();
});
useEventListener(window, "beforeunload", (event: BeforeUnloadEvent) => {
  if (dirtyTabs.value.length === 0) return;
  event.preventDefault();
  event.returnValue = "";
});
useIntervalFn(() => void checkActiveRemote(), 15_000);
watch(
  () =>
    tabs.value.map((tab) => [
      tab.path,
      tab.content,
      tab.savedContent,
      tab.encoding,
      tab.savedEncoding,
      tab.lineEnding,
      tab.savedLineEnding
    ]),
  () => void persistDirtyDrafts(),
  { deep: true }
);
watch(quickOpenQuery, () => {
  quickOpenIndex.value = 0;
});
watch(quickOpenItems, (items) => {
  quickOpenIndex.value = Math.min(quickOpenIndex.value, Math.max(0, items.length - 1));
});
watch(
  [manager.currentPath, manager.entries],
  ([path, entries]) => {
    if (!path) return;
    if (!rootPath.value) {
      rootPath.value = path as string;
      selectedDirectory.value = path as string;
      void restoreStoredDrafts();
    }
    if (path === rootPath.value) {
      tree.value = {
        ...tree.value,
        [path as string]: { entries: entries as SftpFileEntry[], loading: false, error: "" }
      };
    }
  },
  { immediate: true, deep: true }
);
onUnmounted(() => {
  tabs.value.forEach(revokePreview);
  workspaceCloseResolver?.(false);
});
</script>

<template>
  <div
    ref="editorLayout"
    class="grid h-full min-h-0 bg-(--app-main-bg) text-(--app-fg)"
    :class="resizingExplorer || resizingSplit ? 'cursor-col-resize select-none' : ''"
    :style="{ gridTemplateColumns: `${explorerWidth}px minmax(0, 1fr)` }"
  >
    <aside
      class="relative flex min-h-0 flex-col border-r border-(--workspace-surface-sub-border) bg-(--workspace-surface-sub-sidebar)"
    >
      <div
        class="flex h-10 min-w-0 shrink-0 items-center gap-1 border-b border-(--workspace-surface-sub-border) bg-(--workspace-surface-sub-header) px-2"
      >
        <button
          class="min-w-0 flex-1 truncate px-1 text-left font-ui-mono text-[10px]"
          :class="selectedDirectory === rootPath ? 'text-primary' : 'text-muted'"
          :title="rootPath"
          @click="selectedDirectory = rootPath"
          @contextmenu="
            openContextMenu(
              { name: rootPath, size: '', perm: '', mod_time: '', type: '', is_dir: true },
              rootPath,
              $event
            )
          "
        >
          {{ rootPath || "/" }}
        </button>
        <UButton
          icon="i-lucide-chevrons-up"
          size="xs"
          color="neutral"
          variant="ghost"
          :title="t('koko.sftpEditor.collapseAll')"
          @click="collapseAll"
        />
        <UButton
          icon="i-lucide-file-plus-2"
          size="xs"
          color="neutral"
          variant="ghost"
          :title="t('koko.sftpEditor.newFile')"
          @click="beginCreate('file')"
        />
        <UButton
          icon="i-lucide-folder-plus"
          size="xs"
          color="neutral"
          variant="ghost"
          :title="t('koko.sftpEditor.newDirectory')"
          @click="beginCreate('directory')"
        />
        <UButton
          icon="i-lucide-search"
          size="xs"
          color="neutral"
          :variant="searchVisible ? 'soft' : 'ghost'"
          :title="t('koko.actions.search')"
          @click="toggleSearch"
        />
        <UButton
          icon="i-lucide-file-search-2"
          size="xs"
          color="neutral"
          variant="ghost"
          :title="t('koko.sftpEditor.quickOpenShortcut')"
          @click="openQuickOpen"
        />
        <UButton
          icon="i-lucide-refresh-cw"
          size="xs"
          color="neutral"
          variant="ghost"
          :title="t('koko.sftpEditor.refreshTree')"
          @click="refreshTree"
        />
      </div>
      <div
        v-if="searchVisible"
        class="shrink-0 border-b border-(--workspace-surface-sub-border) bg-(--workspace-surface-sub-tree) p-2"
      >
        <UInput
          v-model="search"
          icon="i-lucide-search"
          size="xs"
          :placeholder="t('koko.sftpEditor.filterFiles')"
          class="w-full"
        />
      </div>
      <div
        v-if="manager.currentUploadName.value"
        class="shrink-0 border-b border-(--workspace-surface-sub-border) bg-(--workspace-surface-sub-tree) px-2 py-2"
      >
        <div class="mb-1 flex items-center justify-between gap-2 text-[11px] text-(--app-muted)">
          <span class="truncate">{{ manager.currentUploadName.value }}</span>
          <span>{{ manager.uploadProgress.value }}%</span>
        </div>
        <div class="flex items-center gap-2">
          <UProgress :value="manager.uploadProgress.value" size="xs" class="flex-1" />
          <span v-if="manager.queuedUploadCount.value" class="shrink-0 text-[11px] text-(--app-muted)">
            +{{ manager.queuedUploadCount.value }}
          </span>
        </div>
      </div>
      <div class="min-h-0 flex-1 overflow-auto bg-(--workspace-surface-sub-tree) py-1">
        <div v-if="manager.loading.value && !rootPath" class="space-y-2 px-3 py-2">
          <div class="flex h-6 items-center gap-2 text-xs text-(--app-muted)">
            <UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin" />
            {{ t("koko.sftpEditor.connectingAndLoading") }}
          </div>
          <USkeleton v-for="index in 4" :key="index" class="h-7 w-full rounded-md" />
        </div>
        <template v-for="row in treeRows" :key="row.path">
          <button
            v-if="row.kind === 'entry'"
            class="group flex h-8 w-full items-center gap-1.5 pr-2 text-left text-xs text-(--app-fg) transition-colors hover:bg-(--app-hover-soft)"
            :class="[
              row.entry.is_dir
                ? selectedDirectory === row.path
                  ? 'bg-(--app-selected-soft) text-primary'
                  : ''
                : activePath === row.path
                  ? 'bg-(--app-selected-soft) text-primary'
                  : '',
              !row.entry.is_dir ? 'cursor-grab active:cursor-grabbing' : ''
            ]"
            :style="{ paddingLeft: `${8 + row.depth * 14}px` }"
            :title="entryTitle(row.entry, row.path)"
            :draggable="!row.entry.is_dir"
            @click="openEntry(row.entry, row.path)"
            @contextmenu="openContextMenu(row.entry, row.path, $event)"
            @dragstart="beginTreeDrag(row.entry, row.path, $event)"
            @dragend="endEditorDrag"
          >
            <UIcon
              v-if="row.entry.is_dir"
              :name="row.expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
              class="size-3 shrink-0 text-(--app-muted)"
            />
            <span v-else class="w-3 shrink-0" />
            <UIcon
              :name="entryIcon(row.entry, row.expanded)"
              class="size-3.5 shrink-0"
              :class="entryIconClass(row.entry)"
            />
            <span class="min-w-0 flex-1 truncate">{{ row.entry.name }}</span>
            <span v-if="!row.entry.is_dir" class="shrink-0 font-ui-mono text-[9px] tabular-nums text-(--app-muted)">
              {{ formatFileSize(row.entry.size) }}
            </span>
          </button>
          <div v-else-if="row.kind === 'pending'" class="py-1 pr-2" :style="{ paddingLeft: `${8 + row.depth * 14}px` }">
            <div class="flex items-center gap-1">
              <UIcon
                :name="row.createKind === 'directory' ? 'i-lucide-folder' : 'i-lucide-file-code-2'"
                class="size-3.5 shrink-0 text-(--app-muted)"
              />
              <input
                ref="pendingInput"
                v-model="pendingName"
                class="h-6 min-w-0 flex-1 rounded border border-primary bg-(--workspace-surface-sub-panel) px-1.5 text-xs text-(--app-fg) outline-none"
                :placeholder="
                  row.createKind === 'directory' ? t('koko.sftpEditor.directoryName') : t('koko.sftpEditor.fileName')
                "
                :disabled="pendingSubmitting"
                @keydown.enter.prevent="commitCreate"
                @keydown.esc.prevent="cancelCreate"
              />
              <UButton
                icon="i-lucide-check"
                size="xs"
                color="primary"
                variant="ghost"
                :loading="pendingSubmitting"
                :title="t('koko.actions.confirm')"
                @click="commitCreate"
              />
              <UButton
                icon="i-lucide-x"
                size="xs"
                color="neutral"
                variant="ghost"
                :disabled="pendingSubmitting"
                :title="t('koko.actions.cancel')"
                @click="cancelCreate"
              />
            </div>
            <div v-if="pendingError" class="pl-5 pt-1 text-[10px] text-error">
              {{ pendingError }}
            </div>
          </div>
          <div
            v-else
            class="flex min-h-7 items-center gap-1.5 pr-2 text-[11px] text-(--app-muted)"
            :class="row.kind === 'error' ? 'text-error' : ''"
            :style="{ paddingLeft: `${22 + row.depth * 14}px` }"
          >
            <UIcon
              :name="row.kind === 'loading' ? 'i-lucide-loader-circle' : 'i-lucide-circle-alert'"
              class="size-3 shrink-0"
              :class="row.kind === 'loading' ? 'animate-spin' : ''"
            />
            <span class="min-w-0 flex-1 truncate">
              {{ row.kind === "loading" ? t("koko.sftpEditor.loading") : row.error }}
            </span>
            <UButton
              v-if="row.kind === 'error'"
              icon="i-lucide-refresh-cw"
              size="xs"
              color="error"
              variant="ghost"
              :title="t('koko.actions.retry')"
              @click="loadDirectory(row.parent, true)"
            />
          </div>
        </template>
        <div v-if="tree[rootPath]?.loading" class="flex h-8 items-center gap-2 px-3 text-xs text-(--app-muted)">
          <UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin" />
          {{ t("koko.sftpEditor.loading") }}
        </div>
        <div v-else-if="tree[rootPath]?.error" class="px-3 py-2 text-xs text-error">
          {{ tree[rootPath]?.error }}
        </div>
      </div>
      <div
        class="absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize"
        :title="t('koko.sftpEditor.resizeExplorer')"
        @pointerdown="beginExplorerResize"
        @dblclick="explorerWidth = 280"
      >
        <div
          class="mx-auto h-full w-px transition-colors"
          :class="resizingExplorer ? 'bg-primary' : 'bg-transparent hover:bg-primary/60'"
        />
      </div>
      <input ref="uploadInput" type="file" multiple class="hidden" @change="uploadFiles" />
      <UDropdownMenu
        :open="contextMenuVisible"
        :items="contextMenuItems"
        size="sm"
        :content="{ align: 'start', side: 'bottom' }"
        @update:open="
          (open) => {
            if (!open) hideContextMenu();
            else contextMenuVisible = open;
          }
        "
      >
        <div
          class="pointer-events-none fixed size-px"
          :style="{ left: `${contextMenuPosition.x}px`, top: `${contextMenuPosition.y}px` }"
        />
      </UDropdownMenu>
    </aside>

    <section class="flex min-h-0 min-w-0 flex-col">
      <div
        v-if="manager.error.value"
        class="flex min-h-9 shrink-0 items-center gap-2 border-b border-warning/30 bg-warning/10 px-3 text-xs"
      >
        <UIcon name="i-lucide-wifi-off" class="size-4 shrink-0 text-warning" />
        <span class="min-w-0 flex-1 truncate">{{ manager.error.value }}</span>
        <UButton size="xs" color="warning" variant="soft" icon="i-lucide-refresh-cw" @click="manager.retry.reconnect()">
          {{ t("koko.fileManagement.reconnect") }}
        </UButton>
      </div>
      <UDropdownMenu
        :open="tabContextMenuVisible"
        :items="tabContextMenuItems"
        size="sm"
        :content="{ align: 'start', side: 'bottom' }"
        @update:open="
          (open) => {
            if (!open) hideTabContextMenu();
            else tabContextMenuVisible = open;
          }
        "
      >
        <div
          class="pointer-events-none fixed size-px"
          :style="{ left: `${tabContextMenuPosition.x}px`, top: `${tabContextMenuPosition.y}px` }"
        />
      </UDropdownMenu>
      <div
        ref="editorGroups"
        class="relative grid min-h-0 flex-1 overflow-hidden bg-(--app-main-bg)"
        :style="{
          gridTemplateColumns: splitOpen ? `${splitRatio}fr ${100 - splitRatio}fr` : 'minmax(0, 1fr)'
        }"
        @dragover="updateEditorDropTarget"
        @dragleave="leaveEditorDropTarget"
        @drop="dropEditorItem"
      >
        <template v-for="tab in tabs" :key="tab.path">
          <section
            v-show="paneActivePaths[tab.pane] === tab.path && (tab.pane === 'left' || splitOpen)"
            class="flex min-h-0 min-w-0 flex-col overflow-hidden bg-(--app-main-bg)"
            :class="[
              tab.pane === 'right' ? 'border-l border-(--workspace-surface-sub-border)' : '',
              splitOpen && activePane === tab.pane ? 'shadow-[inset_0_2px_0_var(--ui-primary)]' : ''
            ]"
            :style="{ gridColumn: tab.pane === 'left' ? 1 : 2, gridRow: 1 }"
            @pointerdown.capture="focusPane(tab.pane, tab.path)"
          >
            <WorkspaceSubTabStrip
              class="border-b border-(--workspace-surface-sub-border) bg-(--workspace-surface-sub-header)"
              :tabs="subTabsForPane(tab.pane)"
              :active-id="paneActivePaths[tab.pane]"
              :dragged-id="draggedEditorItem?.source === 'tab' ? draggedEditorItem.path : ''"
              reorderable
              context-menu
              @select="focusPane(tab.pane, $event)"
              @reorder="reorderTabs"
              @contextmenu="openTabContextMenu"
              @dragstart="beginTabDrag"
              @dragend="endEditorDrag"
              @close="
                (id) => {
                  const target = tabs.find((item) => item.path === id);
                  if (target) closeTab(target);
                }
              "
            >
              <template #trailing>
                <template v-if="tab.kind === 'text'">
                  <UTooltip v-if="dirty(tab)" :text="t('koko.sftpEditor.viewChanges')" :delay-duration="150">
                    <UButton
                      icon="i-lucide-git-compare-arrows"
                      size="xs"
                      color="warning"
                      variant="soft"
                      @click="openLocalChanges(tab)"
                    >
                      <span class="font-ui-mono tabular-nums">
                        +{{ tabChangeStats(tab).added }} −{{ tabChangeStats(tab).removed }}
                      </span>
                    </UButton>
                  </UTooltip>
                  <UTooltip
                    :text="
                      tab.lineWrapping ? t('koko.sftpEditor.disableWordWrap') : t('koko.sftpEditor.enableWordWrap')
                    "
                    :delay-duration="150"
                  >
                    <UButton
                      icon="i-lucide-wrap-text"
                      size="xs"
                      :color="tab.lineWrapping ? 'primary' : 'neutral'"
                      :variant="tab.lineWrapping ? 'soft' : 'ghost'"
                      :aria-pressed="tab.lineWrapping"
                      @click="tab.lineWrapping = !tab.lineWrapping"
                    />
                  </UTooltip>
                  <UTooltip v-if="dirty(tab) || tab.saving" :text="t('koko.actions.save')" :delay-duration="150">
                    <UButton
                      icon="i-lucide-save"
                      size="xs"
                      color="primary"
                      variant="soft"
                      :loading="tab.saving"
                      @click="save(tab)"
                    />
                  </UTooltip>
                  <UTooltip
                    v-if="dirtyTabs.length > 1"
                    :text="t('koko.sftpEditor.saveAllShortcut')"
                    :delay-duration="150"
                  >
                    <UButton
                      icon="i-lucide-layers-2"
                      size="xs"
                      color="neutral"
                      variant="soft"
                      :loading="saveAllRunning"
                      @click="triggerSaveAll"
                    />
                  </UTooltip>
                </template>
                <UTooltip
                  :text="
                    tab.pane === 'left' ? t('koko.sftpEditor.splitEditorRight') : t('koko.sftpEditor.closeRightEditor')
                  "
                  :delay-duration="150"
                >
                  <UButton
                    :icon="tab.pane === 'left' ? 'i-lucide-columns-2' : 'i-lucide-panel-right-close'"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    @click="tab.pane === 'left' ? splitEditor(tab) : closeSplitEditor()"
                  />
                </UTooltip>
              </template>
            </WorkspaceSubTabStrip>
            <div class="relative flex min-h-0 flex-1">
              <div v-if="tab.loading" class="absolute inset-0 z-10 grid place-items-center bg-(--app-main-bg)">
                <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
              </div>
              <div v-if="tab.kind === 'text'" class="flex min-h-0 min-w-0 flex-1 flex-col bg-(--app-main-bg)">
                <div
                  v-if="tab.externalChanged"
                  class="flex min-h-9 shrink-0 items-center gap-2 border-b border-warning/30 bg-warning/10 px-3 text-xs"
                >
                  <UIcon name="i-lucide-file-warning" class="size-4 shrink-0 text-warning" />
                  <span class="min-w-0 flex-1">
                    {{ t("koko.sftpEditor.remoteChangedWhileEditing") }}
                  </span>
                  <UButton size="xs" color="neutral" variant="ghost" @click="compareRemote(tab)">
                    {{ t("koko.sftpEditor.compareChanges") }}
                  </UButton>
                  <UButton
                    v-if="!dirty(tab)"
                    size="xs"
                    color="warning"
                    variant="soft"
                    icon="i-lucide-refresh-cw"
                    @click="reloadRemote(tab)"
                  >
                    {{ t("koko.sftpEditor.reloadRemote") }}
                  </UButton>
                </div>
                <div
                  v-if="tab.draftRestored"
                  class="flex min-h-8 shrink-0 items-center gap-2 border-b border-info/30 bg-info/10 px-3 text-xs"
                >
                  <UIcon name="i-lucide-history" class="size-3.5 shrink-0 text-info" />
                  <span class="min-w-0 flex-1">{{ t("koko.sftpEditor.draftRestored") }}</span>
                  <UButton
                    icon="i-lucide-x"
                    size="xs"
                    color="info"
                    variant="ghost"
                    :title="t('koko.actions.close')"
                    @click="tab.draftRestored = false"
                  />
                </div>
                <div
                  v-if="tab.contentLanguageMismatch"
                  class="flex min-h-8 shrink-0 items-center gap-2 border-b border-info/30 bg-info/10 px-3 text-xs"
                >
                  <UIcon name="i-lucide-scan-search" class="size-3.5 shrink-0 text-info" />
                  <span class="min-w-0 flex-1">
                    {{
                      t("koko.sftpEditor.contentTypeMismatch", {
                        extension: fileExtension(tab.entry.name).toUpperCase(),
                        detected: languageLabel(tab.language)
                      })
                    }}
                  </span>
                  <UButton
                    size="xs"
                    color="info"
                    variant="ghost"
                    @click="
                      tab.language = tab.expectedLanguage;
                      tab.contentLanguageMismatch = false;
                    "
                  >
                    {{ t("koko.sftpEditor.useExtensionLanguage") }}
                  </UButton>
                </div>
                <div
                  v-if="tab.error"
                  class="flex min-h-8 shrink-0 items-center gap-2 border-b border-error/30 bg-error/10 px-3 text-xs text-error"
                >
                  <UIcon name="i-lucide-circle-alert" class="size-3.5 shrink-0" />
                  <span class="min-w-0 flex-1 truncate">{{ tab.error }}</span>
                  <UButton
                    icon="i-lucide-x"
                    size="xs"
                    color="error"
                    variant="ghost"
                    :title="t('koko.actions.close')"
                    @click="tab.error = ''"
                  />
                </div>
                <div class="min-h-0 flex-1">
                  <CodeMirrorEditor
                    v-model="tab.content"
                    :active="activePane === tab.pane && paneActivePaths[tab.pane] === tab.path"
                    :baseline="tab.savedContent"
                    :language="editorLanguage(tab)"
                    :line-wrapping="tab.lineWrapping"
                    :path="tab.path"
                    @cursor="(line, column) => updateCursor(tab, line, column)"
                    @save="save(tab)"
                  />
                </div>
              </div>
              <div
                v-else-if="!tab.loading && tab.kind === 'image'"
                class="grid min-h-0 flex-1 place-items-center overflow-auto bg-checkered p-6"
              >
                <img :src="tab.previewUrl" :alt="tab.entry.name" class="max-h-full max-w-full object-contain" />
              </div>
              <div
                v-else-if="!tab.loading"
                class="grid min-h-0 flex-1 place-items-center bg-(--app-main-bg) p-6 text-center text-sm text-(--app-muted)"
              >
                <div class="flex flex-col items-center gap-3">
                  <UIcon :name="tab.error ? 'i-lucide-circle-alert' : 'i-lucide-file-warning'" class="size-10" />
                  <span>{{ tab.error || t("koko.sftpEditor.unsupportedPreview") }}</span>
                  <UButton
                    v-if="tab.largeBlocked"
                    size="xs"
                    color="neutral"
                    variant="soft"
                    icon="i-lucide-file-warning"
                    @click="openLargeFile(tab)"
                  >
                    {{ t("koko.sftpEditor.openAnyway") }}
                  </UButton>
                </div>
              </div>
            </div>
            <footer
              class="flex h-7 shrink-0 items-center justify-between gap-2 overflow-hidden border-t border-(--workspace-surface-sub-border) bg-(--workspace-surface-sub-header) px-2 text-[10px] text-(--app-muted)"
            >
              <span class="min-w-0 flex-1 truncate">{{ tab.path }}</span>
              <div v-if="tab.kind === 'text'" class="flex min-w-0 shrink items-center gap-1 overflow-x-auto">
                <button
                  v-if="dirty(tab)"
                  type="button"
                  class="flex shrink-0 items-center gap-1 font-ui-mono text-warning hover:underline"
                  @click="openLocalChanges(tab)"
                >
                  <UIcon name="i-lucide-git-compare-arrows" class="size-3" />
                  +{{ tabChangeStats(tab).added }} −{{ tabChangeStats(tab).removed }}
                </button>
                <span class="shrink-0">
                  {{
                    t("koko.sftpEditor.cursorPosition", {
                      line: tab.cursorLine,
                      column: tab.cursorColumn
                    })
                  }}
                </span>
                <USelect
                  v-model="tab.language"
                  :items="languageItems"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  value-key="value"
                  class="w-28 shrink-0"
                  :aria-label="t('koko.sftpEditor.languageMode')"
                  @update:model-value="tab.contentLanguageMismatch = false"
                />
                <USelect
                  v-model="tab.lineEnding"
                  :items="lineEndingItems"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  value-key="value"
                  class="w-18 shrink-0"
                  :aria-label="t('koko.sftpEditor.lineEnding')"
                />
                <USelect
                  v-model="tab.encoding"
                  :items="encodingItems"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  value-key="value"
                  class="w-36 shrink-0"
                  :aria-label="t('koko.sftpEditor.encoding')"
                />
              </div>
              <span v-else class="shrink-0">SFTP</span>
            </footer>
          </section>
        </template>
        <div
          v-if="!paneActiveTab('left')"
          class="grid min-h-0 place-items-center bg-(--app-main-bg) p-6 text-sm text-(--app-muted)"
          :style="{ gridColumn: 1, gridRow: 1 }"
          @click="focusPane('left')"
        >
          <span class="flex flex-col items-center gap-3">
            <UIcon :name="tabs.length ? 'i-lucide-panel-left' : 'i-lucide-file-code-2'" class="size-10" />
            <span>{{ tabs.length ? t("koko.sftpEditor.selectFileForPane") : t("koko.sftpEditor.editorEmpty") }}</span>
            <span class="text-center text-[10px] text-(--app-muted)">
              {{ t("koko.sftpEditor.editorEmptyHint") }}
            </span>
          </span>
        </div>
        <div
          v-if="splitOpen && !paneActiveTab('right')"
          class="relative grid min-h-0 place-items-center border-l border-(--workspace-surface-sub-border) bg-(--app-main-bg) p-6 text-sm text-(--app-muted)"
          :class="activePane === 'right' ? 'shadow-[inset_0_2px_0_var(--ui-primary)]' : ''"
          :style="{ gridColumn: 2, gridRow: 1 }"
          @click="focusPane('right')"
        >
          <UButton
            icon="i-lucide-panel-right-close"
            size="xs"
            color="neutral"
            variant="ghost"
            class="absolute right-2 top-2"
            :title="t('koko.sftpEditor.closeRightEditor')"
            @click.stop="closeSplitEditor"
          />
          <span class="flex flex-col items-center gap-3">
            <UIcon name="i-lucide-panel-right" class="size-10" />
            {{ t("koko.sftpEditor.selectFileForPane") }}
          </span>
        </div>
        <div
          v-if="draggedEditorItem && editorDropPane"
          class="pointer-events-none absolute inset-y-2 z-40 grid place-items-center rounded-lg border-2 border-dashed border-primary bg-primary/10 text-primary shadow-lg backdrop-blur-[1px] transition-[left,right]"
          :style="
            editorDropPane === 'left'
              ? {
                  left: '8px',
                  right: splitOpen ? `calc(${100 - splitRatio}% + 4px)` : '32%'
                }
              : {
                  left: splitOpen ? `calc(${splitRatio}% + 4px)` : '68%',
                  right: '8px'
                }
          "
        >
          <span
            class="flex flex-col items-center gap-2 rounded-md bg-(--workspace-surface-sub-panel) px-4 py-3 text-xs shadow-sm"
          >
            <UIcon
              :name="editorDropPane === 'right' && !splitOpen ? 'i-lucide-columns-2' : 'i-lucide-file-input'"
              class="size-6"
            />
            {{
              editorDropPane === "left"
                ? t("koko.sftpEditor.dropToLeftEditor")
                : splitOpen
                  ? t("koko.sftpEditor.dropToRightEditor")
                  : t("koko.sftpEditor.dropToSplitRight")
            }}
          </span>
        </div>
        <div
          v-if="splitOpen"
          class="absolute inset-y-0 z-30 w-2 -translate-x-1/2 cursor-col-resize"
          :style="{ left: `${splitRatio}%` }"
          :title="t('koko.sftpEditor.resizeEditorGroups')"
          @pointerdown="beginSplitResize"
          @dblclick="splitRatio = 50"
        >
          <div
            class="mx-auto h-full w-px transition-colors"
            :class="resizingSplit ? 'bg-primary' : 'bg-transparent hover:bg-primary/70'"
          />
        </div>
      </div>
    </section>
  </div>
  <UModal
    v-model:open="quickOpenVisible"
    :title="t('koko.sftpEditor.quickOpen')"
    :ui="{ content: 'max-w-2xl', body: 'p-2 sm:p-2' }"
  >
    <template #body>
      <div class="space-y-2">
        <UInput
          v-model="quickOpenQuery"
          autofocus
          icon="i-lucide-search"
          size="lg"
          :placeholder="t('koko.sftpEditor.quickOpenPlaceholder')"
          class="w-full"
          @keydown.down.prevent="moveQuickOpenSelection(1)"
          @keydown.up.prevent="moveQuickOpenSelection(-1)"
          @keydown.enter.prevent="openQuickOpenItem(quickOpenItems[quickOpenIndex])"
        >
          <template #trailing>
            <kbd
              class="rounded border border-(--workspace-surface-sub-border) bg-(--workspace-surface-sub-panel) px-1.5 py-0.5 font-ui-mono text-[10px] text-(--app-muted)"
            >
              ESC
            </kbd>
          </template>
        </UInput>
        <div ref="quickOpenList" role="listbox" class="max-h-[min(55vh,28rem)] overflow-auto rounded-md py-1">
          <button
            v-for="(item, index) in quickOpenItems"
            :key="item.path"
            type="button"
            tabindex="-1"
            class="flex h-10 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors"
            :class="
              quickOpenIndex === index
                ? 'bg-(--app-selected-soft) text-primary'
                : 'text-(--app-fg) hover:bg-(--app-hover-soft)'
            "
            :title="item.path"
            role="option"
            :aria-selected="quickOpenIndex === index"
            :data-quick-open-active="quickOpenIndex === index"
            @mouseenter="quickOpenIndex = index"
            @click="openQuickOpenItem(item)"
          >
            <UIcon :name="entryIcon(item.entry)" class="size-4 shrink-0" :class="entryIconClass(item.entry)" />
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium">{{ item.entry.name }}</span>
              <span class="block truncate font-ui-mono text-[10px] text-(--app-muted)">
                {{ parentPath(item.path) }}
              </span>
            </span>
            <UBadge v-if="item.open" color="neutral" variant="subtle" size="sm" :label="t('koko.sftpEditor.opened')" />
          </button>
          <div
            v-if="!quickOpenItems.length"
            class="grid min-h-24 place-items-center px-4 text-center text-xs text-(--app-muted)"
          >
            {{ t("koko.sftpEditor.quickOpenNoResults") }}
          </div>
        </div>
        <div class="flex items-center justify-between gap-3 px-1 text-[10px] text-(--app-muted)">
          <span>{{ t("koko.sftpEditor.quickOpenLoadedHint") }}</span>
          <span class="shrink-0 font-ui-mono">↑↓ · Enter</span>
        </div>
      </div>
    </template>
  </UModal>
  <ModalPromptDialog
    v-model:open="renameDialogOpen"
    v-model="renameValue"
    :title="t('koko.sftpEditor.renamePrompt')"
    :confirm-label="t('koko.actions.rename')"
    :error="renameError"
    :loading="renameSubmitting"
    :disabled="renameDisabled"
    @confirm="submitRename"
  />
  <ModalAlertDialog
    v-if="alertTarget?.kind === 'delete'"
    v-model:open="alertDialogOpen"
    :title="alertTitle"
    :description="alertDescription"
    :confirm-label="alertTitle"
    :confirm-color="alertTarget?.kind === 'delete' ? 'error' : 'primary'"
    :loading="alertSubmitting"
    @confirm="confirmAlert"
  />
  <UModal
    v-else
    v-model:open="alertDialogOpen"
    :title="alertTitle"
    :description="alertDescription"
    :dismissible="false"
    :close="false"
    :ui="{ content: 'max-w-md', footer: 'justify-end gap-2' }"
  >
    <template #footer>
      <UButton color="neutral" variant="ghost" :disabled="alertSubmitting" @click="alertDialogOpen = false">
        {{ t("Common.Cancel") }}
      </UButton>
      <UButton color="primary" variant="soft" icon="i-lucide-save" :loading="alertSubmitting" @click="saveAndCloseTab">
        {{ t("koko.sftpEditor.saveAndClose") }}
      </UButton>
      <UButton color="error" variant="soft" :disabled="alertSubmitting" @click="confirmAlert">
        {{ t("koko.sftpEditor.discardAndClose") }}
      </UButton>
    </template>
  </UModal>
  <UModal
    v-model:open="tabCloseDialogOpen"
    :title="t('koko.sftpEditor.closeTabsTitle', { count: tabCloseTargets.length })"
    :dismissible="false"
    :close="false"
    :ui="{ content: 'max-w-md', footer: 'justify-end gap-2' }"
  >
    <template #body>
      <p class="text-sm text-(--app-muted)">
        {{
          t("koko.sftpEditor.closeTabsConfirm", {
            count: tabCloseTargets.length,
            dirty: tabCloseDirtyCount
          })
        }}
      </p>
    </template>
    <template #footer>
      <UButton
        color="neutral"
        variant="ghost"
        :disabled="tabCloseSubmitting"
        @click="
          tabCloseDialogOpen = false;
          tabCloseTargets = [];
        "
      >
        {{ t("Common.Cancel") }}
      </UButton>
      <UButton
        color="primary"
        variant="soft"
        icon="i-lucide-save"
        :loading="tabCloseSubmitting"
        @click="saveAndCloseTabs"
      >
        {{ t("koko.sftpEditor.saveAllAndClose") }}
      </UButton>
      <UButton color="error" variant="soft" :disabled="tabCloseSubmitting" @click="discardAndCloseTabs">
        {{ t("koko.sftpEditor.discardAndClose") }}
      </UButton>
    </template>
  </UModal>
  <UModal
    v-model:open="localChangesOpen"
    :title="t('koko.sftpEditor.localChangesTitle', { name: localChangeTab?.entry.name || '' })"
    :ui="{ content: 'max-w-6xl', body: 'min-h-0', footer: 'justify-end gap-2' }"
  >
    <template #body>
      <div v-if="localChangeTab && localChangeComparison" class="space-y-3">
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <UBadge
            color="success"
            variant="subtle"
            :label="t('koko.sftpEditor.addedLines', { count: localChangeStats.added })"
          />
          <UBadge
            color="error"
            variant="subtle"
            :label="t('koko.sftpEditor.removedLines', { count: localChangeStats.removed })"
          />
          <UBadge
            v-if="localChangeTab.encoding !== localChangeTab.savedEncoding"
            color="warning"
            variant="subtle"
            :label="
              t('koko.sftpEditor.encodingChanged', {
                before: localChangeTab.savedEncoding,
                after: localChangeTab.encoding
              })
            "
          />
          <UBadge
            v-if="localChangeTab.lineEnding !== localChangeTab.savedLineEnding"
            color="warning"
            variant="subtle"
            :label="
              t('koko.sftpEditor.lineEndingChanged', {
                before: localChangeTab.savedLineEnding,
                after: localChangeTab.lineEnding
              })
            "
          />
        </div>
        <div v-if="localChangeStats.added || localChangeStats.removed" class="grid min-h-0 gap-3 md:grid-cols-2">
          <section class="min-w-0 overflow-hidden rounded-md border border-error/25">
            <header class="flex h-8 items-center gap-2 border-b border-error/25 bg-error/10 px-3 text-xs font-medium">
              <UIcon name="i-lucide-history" class="size-3.5 text-error" />
              {{ t("koko.sftpEditor.savedVersion") }}
            </header>
            <div class="max-h-[58vh] overflow-auto bg-(--app-main-bg) font-ui-mono text-[11px] leading-5">
              <div
                v-for="line in localChangeComparison.local"
                :key="line.number"
                class="grid min-w-max grid-cols-[3.5rem_minmax(24rem,1fr)]"
                :class="line.changed ? 'bg-error/10' : ''"
              >
                <span
                  class="select-none border-r border-(--workspace-surface-sub-border) px-2 text-right text-(--app-muted)"
                >
                  {{ line.number }}
                </span>
                <span class="whitespace-pre px-2">{{ line.text || " " }}</span>
              </div>
            </div>
          </section>
          <section class="min-w-0 overflow-hidden rounded-md border border-success/25">
            <header
              class="flex h-8 items-center gap-2 border-b border-success/25 bg-success/10 px-3 text-xs font-medium"
            >
              <UIcon name="i-lucide-pencil-line" class="size-3.5 text-success" />
              {{ t("koko.sftpEditor.currentVersion") }}
            </header>
            <div class="max-h-[58vh] overflow-auto bg-(--app-main-bg) font-ui-mono text-[11px] leading-5">
              <div
                v-for="line in localChangeComparison.remote"
                :key="line.number"
                class="grid min-w-max grid-cols-[3.5rem_minmax(24rem,1fr)]"
                :class="line.changed ? 'bg-success/10' : ''"
              >
                <span
                  class="select-none border-r border-(--workspace-surface-sub-border) px-2 text-right text-(--app-muted)"
                >
                  {{ line.number }}
                </span>
                <span class="whitespace-pre px-2">{{ line.text || " " }}</span>
              </div>
            </div>
          </section>
        </div>
        <div v-else class="grid h-32 place-items-center text-sm text-(--app-muted)">
          {{ t("koko.sftpEditor.onlyFilePropertiesChanged") }}
        </div>
        <p v-if="localChangeComparison.truncated" class="text-xs text-(--app-muted)">
          {{ t("koko.sftpEditor.diffTruncated") }}
        </p>
      </div>
    </template>
    <template #footer>
      <UButton color="neutral" variant="ghost" @click="localChangesOpen = false">
        {{ t("Common.Close") }}
      </UButton>
      <UButton
        color="primary"
        icon="i-lucide-save"
        :loading="localChangeTab?.saving"
        @click="
          async () => {
            if (localChangeTab && (await save(localChangeTab))) localChangesOpen = false;
          }
        "
      >
        {{ t("koko.actions.save") }}
      </UButton>
    </template>
  </UModal>
  <UModal
    :open="Boolean(saveConflict)"
    :title="t('koko.sftpEditor.saveConflictTitle')"
    :dismissible="false"
    :close="false"
    :ui="{ content: 'max-w-6xl', body: 'min-h-0', footer: 'justify-end gap-2' }"
  >
    <template #body>
      <div class="space-y-3">
        <p class="text-sm text-(--app-muted)">
          {{
            saveConflict?.remoteEntry
              ? t("koko.sftpEditor.saveConflictChanged", { name: saveConflict.tab.entry.name })
              : t("koko.sftpEditor.saveConflictDeleted", { name: saveConflict?.tab.entry.name || "" })
          }}
        </p>
        <div v-if="saveConflict?.loading" class="grid h-48 place-items-center">
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
        </div>
        <div v-else-if="saveConflict?.remoteEntry && conflictComparison" class="grid min-h-0 gap-3 md:grid-cols-2">
          <section class="min-w-0 overflow-hidden rounded-md border border-error/25">
            <header class="flex h-8 items-center gap-2 border-b border-error/25 bg-error/10 px-3 text-xs font-medium">
              <UIcon name="i-lucide-laptop" class="size-3.5 text-error" />
              {{ t("koko.sftpEditor.yourChanges") }}
            </header>
            <div class="max-h-[55vh] overflow-auto bg-(--app-main-bg) font-ui-mono text-[11px] leading-5">
              <div
                v-for="line in conflictComparison.local"
                :key="line.number"
                class="grid min-w-max grid-cols-[3.5rem_minmax(24rem,1fr)]"
                :class="line.changed ? 'bg-error/10' : ''"
              >
                <span
                  class="select-none border-r border-(--workspace-surface-sub-border) px-2 text-right text-(--app-muted)"
                >
                  {{ line.number }}
                </span>
                <span class="whitespace-pre px-2">{{ line.text || " " }}</span>
              </div>
            </div>
          </section>
          <section class="min-w-0 overflow-hidden rounded-md border border-success/25">
            <header
              class="flex h-8 items-center gap-2 border-b border-success/25 bg-success/10 px-3 text-xs font-medium"
            >
              <UIcon name="i-lucide-server" class="size-3.5 text-success" />
              {{ t("koko.sftpEditor.remoteChanges") }}
            </header>
            <div class="max-h-[55vh] overflow-auto bg-(--app-main-bg) font-ui-mono text-[11px] leading-5">
              <div
                v-for="line in conflictComparison.remote"
                :key="line.number"
                class="grid min-w-max grid-cols-[3.5rem_minmax(24rem,1fr)]"
                :class="line.changed ? 'bg-success/10' : ''"
              >
                <span
                  class="select-none border-r border-(--workspace-surface-sub-border) px-2 text-right text-(--app-muted)"
                >
                  {{ line.number }}
                </span>
                <span class="whitespace-pre px-2">{{ line.text || " " }}</span>
              </div>
            </div>
          </section>
        </div>
        <p v-if="conflictComparison?.truncated" class="text-xs text-(--app-muted)">
          {{ t("koko.sftpEditor.diffTruncated") }}
        </p>
        <p v-if="saveConflict?.error" class="text-xs text-error">{{ saveConflict.error }}</p>
      </div>
    </template>
    <template #footer>
      <UButton color="neutral" variant="ghost" :disabled="conflictSubmitting" @click="saveConflict = null">
        {{ t("Common.Cancel") }}
      </UButton>
      <UButton
        v-if="saveConflict?.remoteEntry"
        color="neutral"
        variant="soft"
        :loading="conflictSubmitting"
        @click="reloadConflict"
      >
        {{ t("koko.sftpEditor.reloadRemote") }}
      </UButton>
      <UButton color="error" variant="soft" :loading="conflictSubmitting" @click="overwriteConflict">
        {{ saveConflict?.remoteEntry ? t("koko.sftpEditor.keepMine") : t("koko.sftpEditor.recreateRemote") }}
      </UButton>
    </template>
  </UModal>
  <UModal
    v-model:open="workspaceCloseDialogOpen"
    :title="t('koko.sftpEditor.unsavedWorkspaceTitle')"
    :dismissible="false"
    :close="false"
    :ui="{ content: 'max-w-md', footer: 'justify-end gap-2' }"
  >
    <template #body>
      <p class="text-sm text-(--app-muted)">
        {{ t("koko.sftpEditor.unsavedWorkspaceCloseConfirm", { count: dirtyTabs.length }) }}
      </p>
    </template>
    <template #footer>
      <UButton color="neutral" variant="ghost" @click="resolveWorkspaceClose(false)">
        {{ t("Common.Cancel") }}
      </UButton>
      <UButton
        color="primary"
        variant="soft"
        icon="i-lucide-layers-2"
        :loading="saveAllRunning"
        @click="saveAllAndClose"
      >
        {{ t("koko.sftpEditor.saveAllAndClose") }}
      </UButton>
      <UButton color="error" variant="soft" @click="discardAllAndClose">
        {{ t("koko.sftpEditor.discardAndClose") }}
      </UButton>
    </template>
  </UModal>
</template>
