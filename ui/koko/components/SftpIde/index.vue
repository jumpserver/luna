<script setup lang="ts">
import type { SftpFileEntry } from "~/koko/composables/useSftpFileManager";
import type { ConnectorSessionContext } from "~/shared/connectors/types/session";
import { useSftpFileManager } from "~/koko/composables/useSftpFileManager";
import { connectorSessionKey } from "~/koko/composables/wsUrl";

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
interface TreeRow {
  entry: SftpFileEntry
  path: string
  depth: number
  expanded: boolean
}

const props = defineProps<{ sftpToken: string }>();
const providedContext = inject(connectorSessionKey, ref(null));
const context = computed<ConnectorSessionContext | null>(() => {
  const value = unref(providedContext);
  return value ? { ...value, tokenId: props.sftpToken } : null;
});
const manager = useSftpFileManager(context);
const tabs = ref<EditorTab[]>([]);
const activePath = ref("");
const search = ref("");
const rootPath = ref("");
const tree = ref<Record<string, TreeNode>>({});
const expanded = ref(new Set<string>());
const activeTab = computed(() => tabs.value.find((tab) => tab.path === activePath.value) || null);
const rootName = computed(() => rootPath.value.split("/").filter(Boolean).pop() || "/");
const imageExtensions = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"]);
const textExtensions = new Set(["txt", "md", "json", "yaml", "yml", "toml", "ini", "conf", "env", "js", "ts", "tsx", "jsx", "vue", "html", "css", "scss", "less", "py", "go", "rs", "java", "c", "h", "cpp", "hpp", "sh", "zsh", "bash", "sql", "xml", "log"]);
const languageMap: Record<string, string> = { bash: "shell", c: "c", conf: "ini", cpp: "cpp", css: "css", env: "ini", go: "go", h: "c", hpp: "cpp", html: "html", ini: "ini", java: "java", js: "javascript", json: "json", jsx: "javascript", less: "less", log: "plaintext", md: "markdown", py: "python", rs: "rust", scss: "scss", sh: "shell", sql: "sql", toml: "ini", ts: "typescript", tsx: "typescript", txt: "plaintext", vue: "html", xml: "xml", yaml: "yaml", yml: "yaml", zsh: "shell" };
const editorLanguage = computed(() => languageMap[activeTab.value?.entry.name.split(".").pop()?.toLowerCase() || ""] || "plaintext");
const dirty = (tab: EditorTab) => tab.kind === "text" && tab.content !== tab.savedContent;

function joinPath(parent: string, name: string) {
  return `${parent.replace(/\/$/, "")}/${name}` || `/${name}`;
}

const treeRows = computed<TreeRow[]>(() => {
  const rows: TreeRow[] = [];
  const query = search.value.trim().toLowerCase();
  const walk = (parent: string, depth: number) => {
    for (const entry of tree.value[parent]?.entries || []) {
      if (entry.name === "..") continue;
      const path = joinPath(parent, entry.name);
      if (!query || entry.name.toLowerCase().includes(query) || entry.is_dir) {
        rows.push({ entry, path, depth, expanded: expanded.value.has(path) });
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
  if (next.has(path)) next.delete(path);
  else {
    next.add(path);
    void loadDirectory(path);
  }
  expanded.value = next;
}

function collapseAll() {
  expanded.value = new Set();
}

async function refreshTree() {
  const paths = [rootPath.value, ...expanded.value].filter(Boolean);
  await Promise.all(paths.map((path) => loadDirectory(path, true)));
}

function revokePreview(tab: EditorTab) {
  if (tab.previewUrl) URL.revokeObjectURL(tab.previewUrl);
  tab.previewUrl = "";
}

async function openEntry(entry: SftpFileEntry, path: string) {
  if (entry.is_dir) {
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
  if (!rootPath.value) rootPath.value = path as string;
  if (path === rootPath.value) {
    tree.value = { ...tree.value, [path as string]: { entries: entries as SftpFileEntry[], loading: false, error: "" } };
  }
}, { immediate: true, deep: true });
onUnmounted(() => tabs.value.forEach(revokePreview));
</script>

<template>
  <div class="grid h-full min-h-0 grid-cols-[260px_minmax(0,1fr)] bg-default">
    <aside class="flex min-h-0 flex-col border-r border-default bg-elevated/30">
      <div class="flex h-10 shrink-0 items-center gap-1 border-b border-default px-2">
        <span class="min-w-0 flex-1 truncate px-1 text-xs font-semibold uppercase tracking-wide" :title="rootPath">{{ rootName }}</span>
        <UButton icon="i-lucide-chevrons-up" size="xs" color="neutral" variant="ghost" title="全部折叠" @click="collapseAll" />
        <UButton icon="i-lucide-refresh-cw" size="xs" color="neutral" variant="ghost" title="刷新目录树" @click="refreshTree" />
      </div>
      <div class="shrink-0 border-b border-default p-2">
        <UInput v-model="search" icon="i-lucide-search" size="xs" placeholder="筛选文件" class="w-full" />
      </div>
      <div class="min-h-0 flex-1 overflow-auto py-1">
        <button v-for="row in treeRows" :key="row.path" class="flex h-7 w-full items-center gap-1 pr-2 text-left text-xs hover:bg-accented" :class="!row.entry.is_dir && activePath === row.path ? 'bg-accented text-primary' : ''" :style="{ paddingLeft: `${8 + row.depth * 14}px` }" :title="row.path" @click="openEntry(row.entry, row.path)">
          <UIcon v-if="row.entry.is_dir" :name="row.expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3 shrink-0 text-muted" />
          <span v-else class="w-3 shrink-0" />
          <UIcon :name="row.entry.is_dir ? (row.expanded ? 'i-lucide-folder-open' : 'i-lucide-folder') : 'i-lucide-file-code-2'" class="size-3.5 shrink-0" />
          <span class="min-w-0 flex-1 truncate">{{ row.entry.name }}</span><span v-if="!row.entry.is_dir" class="text-[9px] text-muted">{{ row.entry.size }}</span>
        </button>
        <div v-if="tree[rootPath]?.loading" class="flex h-8 items-center gap-2 px-3 text-xs text-muted"><UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin" />加载中</div>
        <div v-else-if="tree[rootPath]?.error" class="px-3 py-2 text-xs text-error">{{ tree[rootPath]?.error }}</div>
      </div>
    </aside>

    <section class="flex min-h-0 min-w-0 flex-col">
      <div v-if="tabs.length" class="flex h-9 shrink-0 overflow-x-auto border-b border-default bg-elevated/20">
        <button v-for="tab in tabs" :key="tab.path" class="group flex min-w-28 max-w-52 shrink-0 items-center gap-2 border-r border-default px-3 text-xs" :class="activePath === tab.path ? 'bg-default text-highlighted' : 'text-muted hover:bg-elevated/50'" :title="tab.path" @click="activePath = tab.path">
          <UIcon name="i-lucide-file-code-2" class="size-3.5 shrink-0" /><span class="min-w-0 flex-1 truncate text-left">{{ tab.entry.name }}</span>
          <span v-if="dirty(tab)" class="size-1.5 shrink-0 rounded-full bg-primary" />
          <UIcon name="i-lucide-x" class="size-3.5 shrink-0 opacity-0 group-hover:opacity-100" @click.stop="closeTab(tab)" />
        </button>
      </div>
      <template v-if="activeTab">
        <header class="flex h-9 shrink-0 items-center justify-between border-b border-default px-3">
          <span class="truncate font-ui-mono text-[10px] text-muted">{{ activeTab.path }}</span>
          <UButton v-if="activeTab.kind === 'text'" icon="i-lucide-save" size="xs" color="primary" variant="soft" :disabled="!dirty(activeTab)" :loading="activeTab.saving" @click="save()">
            保存
          </UButton>
        </header>
        <div v-if="activeTab.loading" class="grid min-h-0 flex-1 place-items-center">
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
        </div>
        <div v-else-if="activeTab.kind === 'text'" class="min-h-0 flex-1">
          <KokoSftpIdeMonacoEditor v-model="activeTab.content" :language="editorLanguage" :path="activeTab.path" @save="save()" />
        </div>
        <div v-else-if="activeTab.kind === 'image'" class="grid min-h-0 flex-1 place-items-center overflow-auto bg-checkered p-6">
          <img :src="activeTab.previewUrl" :alt="activeTab.entry.name" class="max-h-full max-w-full object-contain">
        </div>
        <div v-else class="grid min-h-0 flex-1 place-items-center p-6 text-center text-sm text-muted">
          <div class="flex flex-col items-center gap-3">
            <UIcon :name="activeTab.error ? 'i-lucide-circle-alert' : 'i-lucide-file-warning'" class="size-10" /><span>{{ activeTab.error || "该文件暂不支持在线预览或编辑" }}</span>
          </div>
        </div>
        <footer class="flex h-6 shrink-0 items-center justify-between border-t border-default px-3 text-[10px] text-muted">
          <span>{{ activeTab.path }}</span><span>{{ activeTab.kind === "text" ? `${activeTab.content.length} chars · Ctrl/Cmd+S 保存` : "SFTP" }}</span>
        </footer>
      </template>
      <div v-else class="grid min-h-0 flex-1 place-items-center p-6 text-sm text-muted">
        <div class="flex flex-col items-center gap-3">
          <UIcon name="i-lucide-file-code-2" class="size-10" /><span>{{ manager.error.value || "从左侧选择文件开始编辑" }}</span>
        </div>
      </div>
    </section>
  </div>
</template>
