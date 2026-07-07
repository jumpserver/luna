<script setup lang="ts">
import type { SftpFileEntry } from "~/koko/composables/useSftpFileManager";
import type { ConnectorSessionContext } from "~/shared/connectors/types/session";
import { useSftpFileManager } from "~/koko/composables/useSftpFileManager";
import { connectorSessionKey } from "~/koko/composables/wsUrl";
import CodeMirrorEditor from "./CodeMirrorEditor.client.vue";

type PreviewKind = "text" | "image" | "unsupported" | "empty";
interface EditorTab {
  path: string
  entry: SftpFileEntry
  content: string
  savedContent: string
  kind: PreviewKind
  previewUrl: string
  loading: boolean
  saving: boolean
  error: string
}
interface TreeNode {
  entries: SftpFileEntry[]
  loading: boolean
  error: string
}
interface EntryTreeRow {
  kind: "entry"
  entry: SftpFileEntry
  path: string
  depth: number
  expanded: boolean
}
interface PendingTreeRow {
  kind: "pending"
  path: string
  depth: number
  createKind: "file" | "directory"
}
type TreeRow = EntryTreeRow | PendingTreeRow;

const props = defineProps<{ sftpToken: string }>();
const providedContext = inject(connectorSessionKey, ref(null));
const context = computed<ConnectorSessionContext | null>(() => {
  const value = unref(providedContext);
  if (!value || !props.sftpToken) return null;
  if (value.tokenId === props.sftpToken) return value;
  return { ...value, tokenId: props.sftpToken };
});
const manager = useSftpFileManager(context);
const tabs = ref<EditorTab[]>([]);
const activePath = ref("");
const search = ref("");
const searchVisible = ref(false);
const rootPath = ref("");
const selectedDirectory = ref("");
const pendingCreate = ref<{ parent: string, kind: "file" | "directory" } | null>(null);
const pendingName = ref("");
const pendingError = ref("");
const pendingSubmitting = ref(false);
const pendingInput = ref<HTMLInputElement | null>(null);
const uploadInput = ref<HTMLInputElement | null>(null);
const uploadDirectory = ref("");
const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const contextTarget = ref<{ entry: SftpFileEntry, path: string } | null>(null);
const tree = ref<Record<string, TreeNode>>({});
const expanded = ref(new Set<string>());
const activeTab = computed(() => tabs.value.find((tab) => tab.path === activePath.value) || null);
const imageExtensions = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"]);
const textExtensions = new Set(["txt", "md", "json", "yaml", "yml", "toml", "ini", "conf", "env", "js", "ts", "tsx", "jsx", "vue", "html", "css", "scss", "less", "py", "go", "rs", "java", "c", "h", "cpp", "hpp", "sh", "zsh", "bash", "sql", "xml", "log"]);
const languageMap: Record<string, string> = { bash: "shell", c: "c", conf: "ini", cpp: "cpp", css: "css", env: "ini", go: "go", h: "c", hpp: "cpp", html: "html", ini: "ini", java: "java", js: "javascript", json: "json", jsx: "javascript", less: "less", log: "plaintext", md: "markdown", py: "python", rs: "rust", scss: "scss", sh: "shell", sql: "sql", toml: "ini", ts: "typescript", tsx: "typescript", txt: "plaintext", vue: "html", xml: "xml", yaml: "yaml", yml: "yaml", zsh: "shell" };
const editorLanguage = computed(() => languageMap[activeTab.value?.entry.name.split(".").pop()?.toLowerCase() || ""] || "plaintext");
const dirty = (tab: EditorTab) => tab.kind === "text" && tab.content !== tab.savedContent;
const tabIconMap: Record<string, string> = {
  css: "i-lucide-palette",
  html: "i-lucide-globe",
  js: "i-lucide-braces",
  json: "i-lucide-braces",
  jsx: "i-lucide-braces",
  md: "i-lucide-file-text",
  py: "i-lucide-file-code",
  sh: "i-lucide-terminal",
  sql: "i-lucide-database",
  ts: "i-lucide-braces",
  tsx: "i-lucide-braces",
  vue: "i-lucide-component",
  yaml: "i-lucide-file-text",
  yml: "i-lucide-file-text"
};

function tabIcon(tab: EditorTab) {
  if (tab.kind === "image") return "i-lucide-image";
  if (tab.kind === "unsupported" || tab.error) return "i-lucide-file-warning";
  const ext = tab.entry.name.split(".").pop()?.toLowerCase() || "";
  return tabIconMap[ext] || "i-lucide-file-code-2";
}

const subTabs = computed(() => tabs.value.map((tab) => ({
  id: tab.path,
  label: tab.entry.name,
  icon: tabIcon(tab),
  title: tab.path,
  dirty: dirty(tab)
})));

function joinPath(parent: string, name: string) {
  return `${parent.replace(/\/$/, "")}/${name}` || `/${name}`;
}

function parentPath(path: string) {
  const index = path.lastIndexOf("/");
  return index <= 0 ? "/" : path.slice(0, index);
}

const treeRows = computed<TreeRow[]>(() => {
  const rows: TreeRow[] = [];
  const query = search.value.trim().toLowerCase();
  const walk = (parent: string, depth: number) => {
    if (pendingCreate.value?.parent === parent) {
      rows.push({ kind: "pending", path: `pending:${parent}`, depth, createKind: pendingCreate.value.kind });
    }
    for (const entry of tree.value[parent]?.entries || []) {
      if (entry.name === "..") continue;
      const path = joinPath(parent, entry.name);
      if (!query || entry.name.toLowerCase().includes(query) || entry.is_dir) {
        rows.push({ kind: "entry", entry, path, depth, expanded: expanded.value.has(path) });
      }
      if (entry.is_dir && expanded.value.has(path)) walk(path, depth + 1);
    }
  };
  if (rootPath.value) walk(rootPath.value, 0);
  return rows;
});

async function loadDirectory(path: string, force = false) {
  const existing = tree.value[path];
  if (existing?.loading || (existing && !force)) return;
  tree.value = { ...tree.value, [path]: { entries: existing?.entries || [], loading: true, error: "" } };
  try {
    const entries = await manager.listDirectory(path);
    tree.value = { ...tree.value, [path]: { entries, loading: false, error: "" } };
  } catch (cause) {
    tree.value = { ...tree.value, [path]: { entries: existing?.entries || [], loading: false, error: cause instanceof Error ? cause.message : String(cause) } };
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
    pendingError.value = "请输入名称";
    return;
  }
  if (name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
    pendingError.value = "名称不能包含路径分隔符";
    return;
  }
  if (nameExists(parent, name)) {
    pendingError.value = "同名文件或目录已经存在";
    return;
  }
  const path = joinPath(parent, name);
  pendingSubmitting.value = true;
  try {
    if (kind === "file") await manager.createFileAt(path);
    else await manager.createDirectoryAt(path);
    await loadDirectory(parent, true);
    if (kind === "file") {
      const entry: SftpFileEntry = { name, size: "0", perm: "", mod_time: "", type: "", is_dir: false };
      const tab = reactive<EditorTab>({ path, entry, content: "", savedContent: "", kind: "text", previewUrl: "", loading: false, saving: false, error: "" });
      tabs.value.push(tab);
      activePath.value = path;
    }
    pendingCreate.value = null;
    pendingName.value = "";
  } catch (cause) {
    pendingError.value = cause instanceof Error ? cause.message : String(cause);
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

async function renameContextTarget() {
  const target = contextTarget.value;
  if (!target || target.path === rootPath.value) return;
  // eslint-disable-next-line no-alert -- rename requires the replacement name
  const name = window.prompt("重命名", target.entry.name)?.trim() || "";
  if (!name || name === target.entry.name) return;
  if (name === "." || name === ".." || name.includes("/") || name.includes("\\")) return;
  const parent = parentPath(target.path);
  if (nameExists(parent, name)) return;
  const nextPath = joinPath(parent, name);
  hideContextMenu();
  await manager.renamePath(target.path, name);
  tabs.value.forEach((tab) => {
    if (tab.path === target.path || tab.path.startsWith(`${target.path}/`)) {
      tab.path = `${nextPath}${tab.path.slice(target.path.length)}`;
      if (tab.path === nextPath) tab.entry.name = name;
    }
  });
  if (activePath.value === target.path || activePath.value.startsWith(`${target.path}/`)) activePath.value = `${nextPath}${activePath.value.slice(target.path.length)}`;
  if (selectedDirectory.value === target.path || selectedDirectory.value.startsWith(`${target.path}/`)) selectedDirectory.value = `${nextPath}${selectedDirectory.value.slice(target.path.length)}`;
  expanded.value = new Set([...expanded.value].map((path) => path === target.path || path.startsWith(`${target.path}/`) ? `${nextPath}${path.slice(target.path.length)}` : path));
  await loadDirectory(parent, true);
}

async function deleteContextTarget() {
  const target = contextTarget.value;
  if (!target || target.path === rootPath.value) return;
  // eslint-disable-next-line no-alert -- remote deletion must be confirmed
  if (!window.confirm(`确定删除 ${target.entry.name}？`)) return;
  hideContextMenu();
  await manager.removePath(target.path);
  for (const tab of tabs.value.filter((tab) => tab.path === target.path || tab.path.startsWith(`${target.path}/`))) revokePreview(tab);
  tabs.value = tabs.value.filter((tab) => tab.path !== target.path && !tab.path.startsWith(`${target.path}/`));
  if (activePath.value === target.path || activePath.value.startsWith(`${target.path}/`)) activePath.value = tabs.value.at(-1)?.path || "";
  if (selectedDirectory.value === target.path || selectedDirectory.value.startsWith(`${target.path}/`)) selectedDirectory.value = rootPath.value;
  await loadDirectory(parentPath(target.path), true);
}

function downloadContextTarget() {
  const target = contextTarget.value;
  if (!target) return;
  hideContextMenu();
  manager.downloadPath(target.path, target.entry.is_dir);
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
  for (const file of files) await manager.uploadFile(file, joinPath(directory, file.name));
  await loadDirectory(directory, true);
}

const contextMenuItems = computed(() => {
  const target = contextTarget.value;
  if (!target) return [];
  const directoryActions = target.entry.is_dir
    ? [
        { label: "新建文件", icon: "i-lucide-file-plus-2", onSelect: () => createFromContext("file") },
        { label: "新建目录", icon: "i-lucide-folder-plus", onSelect: () => createFromContext("directory") },
        { label: "上传文件", icon: "i-lucide-upload", onSelect: chooseUpload },
        { type: "separator" as const }
      ]
    : [];
  return [
    ...directoryActions,
    { label: "下载", icon: "i-lucide-download", onSelect: downloadContextTarget },
    { label: "重命名", icon: "i-lucide-pencil", disabled: target.path === rootPath.value, onSelect: () => void renameContextTarget() },
    { type: "separator" as const },
    { label: "删除", icon: "i-lucide-trash-2", color: "error" as const, disabled: target.path === rootPath.value, onSelect: () => void deleteContextTarget() }
  ];
});

function revokePreview(tab: EditorTab) {
  if (tab.previewUrl) URL.revokeObjectURL(tab.previewUrl);
  tab.previewUrl = "";
}

async function openEntry(entry: SftpFileEntry, path: string) {
  if (entry.is_dir) {
    selectedDirectory.value = path;
    toggleDirectory(path);
    return;
  }
  const existing = tabs.value.find((tab) => tab.path === path);
  if (existing) {
    activePath.value = path;
    return;
  }
  const tab = reactive<EditorTab>({ path, entry, content: "", savedContent: "", kind: "empty", previewUrl: "", loading: true, saving: false, error: "" });
  tabs.value.push(tab);
  activePath.value = path;
  try {
    const blob = await manager.readFile(entry, path);
    const extension = entry.name.split(".").pop()?.toLowerCase() || "";
    if (imageExtensions.has(extension)) {
      tab.kind = "image";
      tab.previewUrl = URL.createObjectURL(blob);
    } else if (textExtensions.has(extension) || blob.size < 1024 * 1024) {
      const text = await blob.text();
      if (text.includes("\0")) {
        tab.kind = "unsupported";
      } else {
        tab.kind = "text";
        tab.content = text;
        tab.savedContent = text;
      }
    } else {
      tab.kind = "unsupported";
    }
  } catch (cause) {
    tab.error = cause instanceof Error ? cause.message : String(cause);
  } finally {
    tab.loading = false;
  }
}

function closeTab(tab: EditorTab) {
  // eslint-disable-next-line no-alert -- closing a dirty remote file must require confirmation
  if (dirty(tab) && !window.confirm(`${tab.entry.name} 尚未保存，确定关闭吗？`)) return;
  const index = tabs.value.findIndex((item) => item.path === tab.path);
  revokePreview(tab);
  tabs.value.splice(index, 1);
  if (activePath.value === tab.path) activePath.value = tabs.value[Math.min(index, tabs.value.length - 1)]?.path || "";
}

async function save(tab = activeTab.value) {
  if (!tab || !dirty(tab) || tab.saving) return;
  tab.saving = true;
  tab.error = "";
  try {
    await manager.uploadFile(new File([tab.content], tab.entry.name, { type: "text/plain;charset=utf-8" }), tab.path);
    tab.savedContent = tab.content;
  } catch (cause) {
    tab.error = cause instanceof Error ? cause.message : String(cause);
  } finally {
    tab.saving = false;
  }
}

useEventListener(window, "keydown", (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s" && activeTab.value) {
    event.preventDefault();
    void save();
  }
});
watch([manager.currentPath, manager.entries], ([path, entries]) => {
  if (!path) return;
  if (!rootPath.value) {
    rootPath.value = path as string;
    selectedDirectory.value = path as string;
  }
  if (path === rootPath.value) {
    tree.value = { ...tree.value, [path as string]: { entries: entries as SftpFileEntry[], loading: false, error: "" } };
  }
}, { immediate: true, deep: true });
onUnmounted(() => tabs.value.forEach(revokePreview));
</script>

<template>
  <div class="grid h-full min-h-0 grid-cols-[260px_minmax(0,1fr)] bg-[var(--app-main-bg)] text-[var(--app-fg)]">
    <aside class="flex min-h-0 flex-col border-r border-[var(--workspace-surface-sub-border)] bg-[var(--workspace-surface-sub-sidebar)]">
      <div class="flex h-10 min-w-0 shrink-0 items-center gap-1 border-b border-[var(--workspace-surface-sub-border)] bg-[var(--workspace-surface-sub-header)] px-2">
        <button class="min-w-0 flex-1 truncate px-1 text-left font-ui-mono text-[10px]" :class="selectedDirectory === rootPath ? 'text-primary' : 'text-muted'" :title="rootPath" @click="selectedDirectory = rootPath" @contextmenu="openContextMenu({ name: rootPath, size: '', perm: '', mod_time: '', type: '', is_dir: true }, rootPath, $event)">
          {{ rootPath || "/" }}
        </button>
        <UButton icon="i-lucide-chevrons-up" size="xs" color="neutral" variant="ghost" title="全部折叠" @click="collapseAll" />
        <UButton icon="i-lucide-file-plus-2" size="xs" color="neutral" variant="ghost" title="新建文件" @click="beginCreate('file')" />
        <UButton icon="i-lucide-folder-plus" size="xs" color="neutral" variant="ghost" title="新建目录" @click="beginCreate('directory')" />
        <UButton icon="i-lucide-search" size="xs" color="neutral" :variant="searchVisible ? 'soft' : 'ghost'" title="搜索" @click="toggleSearch" />
        <UButton icon="i-lucide-refresh-cw" size="xs" color="neutral" variant="ghost" title="刷新目录树" @click="refreshTree" />
      </div>
      <div v-if="searchVisible" class="shrink-0 border-b border-[var(--workspace-surface-sub-border)] bg-[var(--workspace-surface-sub-tree)] p-2">
        <UInput v-model="search" icon="i-lucide-search" size="xs" placeholder="筛选文件" class="w-full" />
      </div>
      <div class="min-h-0 flex-1 overflow-auto bg-[var(--workspace-surface-sub-tree)] py-1">
        <template v-for="row in treeRows" :key="row.path">
          <button v-if="row.kind === 'entry'" class="flex h-7 w-full items-center gap-1 pr-2 text-left text-xs text-[var(--app-fg)] hover:bg-[var(--app-hover-soft)]" :class="row.entry.is_dir ? (selectedDirectory === row.path ? 'bg-[var(--app-selected-soft)] text-primary' : '') : (activePath === row.path ? 'bg-[var(--app-selected-soft)] text-primary' : '')" :style="{ paddingLeft: `${8 + row.depth * 14}px` }" :title="row.path" @click="openEntry(row.entry, row.path)" @contextmenu="openContextMenu(row.entry, row.path, $event)">
            <UIcon v-if="row.entry.is_dir" :name="row.expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3 shrink-0 text-[var(--app-muted)]" />
            <span v-else class="w-3 shrink-0" />
            <UIcon :name="row.entry.is_dir ? (row.expanded ? 'i-lucide-folder-open' : 'i-lucide-folder') : 'i-lucide-file-code-2'" class="size-3.5 shrink-0" />
            <span class="min-w-0 flex-1 truncate">{{ row.entry.name }}</span><span v-if="!row.entry.is_dir" class="text-[9px] text-[var(--app-muted)]">{{ row.entry.size }}</span>
          </button>
          <div v-else class="py-1 pr-2" :style="{ paddingLeft: `${8 + row.depth * 14}px` }">
            <div class="flex items-center gap-1">
              <UIcon :name="row.createKind === 'directory' ? 'i-lucide-folder' : 'i-lucide-file-code-2'" class="size-3.5 shrink-0 text-[var(--app-muted)]" />
              <input ref="pendingInput" v-model="pendingName" class="h-6 min-w-0 flex-1 rounded border border-primary bg-[var(--workspace-surface-sub-panel)] px-1.5 text-xs text-[var(--app-fg)] outline-none" :placeholder="row.createKind === 'directory' ? '目录名称' : '文件名称'" :disabled="pendingSubmitting" @keydown.enter.prevent="commitCreate" @keydown.esc.prevent="cancelCreate">
              <UButton icon="i-lucide-check" size="xs" color="primary" variant="ghost" :loading="pendingSubmitting" title="确认" @click="commitCreate" />
              <UButton icon="i-lucide-x" size="xs" color="neutral" variant="ghost" :disabled="pendingSubmitting" title="取消" @click="cancelCreate" />
            </div>
            <div v-if="pendingError" class="pl-5 pt-1 text-[10px] text-error">
              {{ pendingError }}
            </div>
          </div>
        </template>
        <div v-if="tree[rootPath]?.loading" class="flex h-8 items-center gap-2 px-3 text-xs text-[var(--app-muted)]">
          <UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin" />加载中
        </div>
        <div v-else-if="tree[rootPath]?.error" class="px-3 py-2 text-xs text-error">
          {{ tree[rootPath]?.error }}
        </div>
      </div>
      <input ref="uploadInput" type="file" multiple class="hidden" @change="uploadFiles">
      <UDropdownMenu :open="contextMenuVisible" :items="contextMenuItems" size="sm" :content="{ align: 'start', side: 'bottom' }" @update:open="(open) => { if (!open) hideContextMenu(); else contextMenuVisible = open; }">
        <div class="pointer-events-none fixed size-px" :style="{ left: `${contextMenuPosition.x}px`, top: `${contextMenuPosition.y}px` }" />
      </UDropdownMenu>
    </aside>

    <section class="flex min-h-0 min-w-0 flex-col">
      <WorkspaceSubTabStrip
        :tabs="subTabs"
        :active-id="activePath"
        @select="activePath = $event"
        @close="(id) => { const tab = tabs.find((item) => item.path === id); if (tab) closeTab(tab); }"
      />
      <template v-if="activeTab">
        <header class="flex h-9 shrink-0 items-center justify-between border-b border-[var(--workspace-surface-sub-border)] bg-[var(--workspace-surface-sub-header)] px-3">
          <span class="truncate font-ui-mono text-[10px] text-[var(--app-muted)]">{{ activeTab.path }}</span>
          <UButton v-if="activeTab.kind === 'text'" icon="i-lucide-save" size="xs" color="primary" variant="soft" :disabled="!dirty(activeTab)" :loading="activeTab.saving" @click="save()">
            保存
          </UButton>
        </header>
        <div v-if="activeTab.loading" class="grid min-h-0 flex-1 place-items-center">
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
        </div>
        <div v-else-if="activeTab.kind === 'text'" class="min-h-0 flex-1 bg-[var(--app-main-bg)]">
          <CodeMirrorEditor v-model="activeTab.content" :language="editorLanguage" :path="activeTab.path" @save="save()" />
        </div>
        <div v-else-if="activeTab.kind === 'image'" class="grid min-h-0 flex-1 place-items-center overflow-auto bg-checkered p-6">
          <img :src="activeTab.previewUrl" :alt="activeTab.entry.name" class="max-h-full max-w-full object-contain">
        </div>
        <div v-else class="grid min-h-0 flex-1 place-items-center bg-[var(--app-main-bg)] p-6 text-center text-sm text-[var(--app-muted)]">
          <div class="flex flex-col items-center gap-3">
            <UIcon :name="activeTab.error ? 'i-lucide-circle-alert' : 'i-lucide-file-warning'" class="size-10" /><span>{{ activeTab.error || "该文件暂不支持在线预览或编辑" }}</span>
          </div>
        </div>
        <footer class="flex h-6 shrink-0 items-center justify-between border-t border-[var(--workspace-surface-sub-border)] bg-[var(--workspace-surface-sub-header)] px-3 text-[10px] text-[var(--app-muted)]">
          <span>{{ activeTab.path }}</span><span>{{ activeTab.kind === "text" ? `${activeTab.content.length} chars · Ctrl/Cmd+S 保存` : "SFTP" }}</span>
        </footer>
      </template>
      <div v-else class="grid min-h-0 flex-1 place-items-center bg-[var(--app-main-bg)] p-6 text-sm text-[var(--app-muted)]">
        <div class="flex flex-col items-center gap-3">
          <UIcon name="i-lucide-file-code-2" class="size-10" /><span>{{ manager.error.value || "从左侧选择文件开始编辑" }}</span>
        </div>
      </div>
    </section>
  </div>
</template>
