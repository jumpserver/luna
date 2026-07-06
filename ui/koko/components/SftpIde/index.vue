<script setup lang="ts">
import type { SftpFileEntry } from "~/koko/composables/useSftpFileManager";
import type { ConnectorSessionContext } from "~/shared/connectors/types/session";
import { useSftpFileManager } from "~/koko/composables/useSftpFileManager";
import { connectorSessionKey } from "~/koko/composables/wsUrl";

const props = defineProps<{ sftpToken: string }>();
const providedContext = inject(connectorSessionKey, ref(null));
const context = computed<ConnectorSessionContext | null>(() => {
  const value = unref(providedContext);
  return value ? { ...value, tokenId: props.sftpToken } : null;
});
const manager = useSftpFileManager(context);
const activeFile = ref<SftpFileEntry | null>(null);
const content = ref("");
const savedContent = ref("");
const opening = ref(false);
const saving = ref(false);
const editorError = ref("");
const previewUrl = ref("");
const previewKind = ref<"text" | "image" | "unsupported" | "empty">("empty");
const search = ref("");
const dirty = computed(() => previewKind.value === "text" && content.value !== savedContent.value);
const visibleEntries = computed(() => manager.entries.value.filter((entry) => entry.name.toLowerCase().includes(search.value.toLowerCase())));
const imageExtensions = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"]);
const textExtensions = new Set(["txt", "md", "json", "yaml", "yml", "toml", "ini", "conf", "env", "js", "ts", "tsx", "jsx", "vue", "html", "css", "scss", "less", "py", "go", "rs", "java", "c", "h", "cpp", "hpp", "sh", "zsh", "bash", "sql", "xml", "log"]);
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
const editorLanguage = computed(() => languageMap[activeFile.value?.name.split(".").pop()?.toLowerCase() || ""] || "plaintext");
const editorPath = computed(() => `${manager.currentPath.value.replace(/\/$/, "")}/${activeFile.value?.name || "remote.txt"}`);

function clearPreviewUrl() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = "";
}

async function openEntry(entry: SftpFileEntry) {
  if (entry.is_dir) {
    // eslint-disable-next-line no-alert -- prevent accidental loss of unsaved remote edits
    if (dirty.value && !window.confirm("当前文件尚未保存，确定离开吗？")) return;
    activeFile.value = null;
    previewKind.value = "empty";
    clearPreviewUrl();
    manager.changeDirectory(entry);
    return;
  }
  // eslint-disable-next-line no-alert -- prevent accidental loss of unsaved remote edits
  if (dirty.value && !window.confirm("当前文件尚未保存，确定打开其他文件吗？")) return;
  activeFile.value = entry;
  opening.value = true;
  editorError.value = "";
  previewKind.value = "empty";
  clearPreviewUrl();
  try {
    const blob = await manager.readFile(entry);
    const extension = entry.name.split(".").pop()?.toLowerCase() || "";
    if (imageExtensions.has(extension)) {
      previewKind.value = "image";
      previewUrl.value = URL.createObjectURL(blob);
    } else if (textExtensions.has(extension) || blob.size < 1024 * 1024) {
      const text = await blob.text();
      if (text.includes("\0")) {
        previewKind.value = "unsupported";
      } else {
        previewKind.value = "text";
        content.value = text;
        savedContent.value = text;
      }
    } else {
      previewKind.value = "unsupported";
    }
  } catch (cause) {
    editorError.value = String(cause);
    previewKind.value = "empty";
  } finally {
    opening.value = false;
  }
}

async function save() {
  if (!activeFile.value || !dirty.value || saving.value) return;
  saving.value = true;
  editorError.value = "";
  try {
    await manager.uploadFile(new File([content.value], activeFile.value.name, { type: "text/plain;charset=utf-8" }));
    savedContent.value = content.value;
  } catch (cause) {
    editorError.value = String(cause);
  } finally {
    saving.value = false;
  }
}

useEventListener(window, "keydown", (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s" && activeFile.value) {
    event.preventDefault();
    void save();
  }
});
onUnmounted(clearPreviewUrl);
</script>

<template>
  <div class="grid h-full min-h-0 grid-cols-[260px_minmax(0,1fr)] bg-default">
    <aside class="flex min-h-0 flex-col border-r border-default bg-elevated/30">
      <div class="flex h-10 shrink-0 items-center gap-1 border-b border-default px-2">
        <UButton icon="i-lucide-arrow-left" size="xs" color="neutral" variant="ghost" :disabled="manager.currentPath.value === '/'" @click="manager.changeDirectory({ name: '..', is_dir: true } as SftpFileEntry)" />
        <UButton icon="i-lucide-refresh-cw" size="xs" color="neutral" variant="ghost" @click="manager.list()" />
        <UInput v-model="search" icon="i-lucide-search" size="xs" class="min-w-0 flex-1" />
      </div>
      <div class="shrink-0 truncate border-b border-default px-3 py-1.5 font-ui-mono text-[10px] text-muted">
        {{ manager.currentPath.value || "/" }}
      </div>
      <div class="min-h-0 flex-1 overflow-auto py-1">
        <button v-for="entry in visibleEntries" :key="entry.name" class="flex h-7 w-full items-center gap-2 px-3 text-left text-xs hover:bg-accented" :class="activeFile?.name === entry.name ? 'bg-accented text-primary' : ''" @click="openEntry(entry)">
          <UIcon :name="entry.is_dir ? 'i-lucide-folder' : 'i-lucide-file-code-2'" class="size-3.5 shrink-0" />
          <span class="min-w-0 flex-1 truncate">{{ entry.name }}</span>
          <span v-if="!entry.is_dir" class="text-[9px] text-muted">{{ entry.size }}</span>
        </button>
      </div>
    </aside>

    <section class="flex min-h-0 min-w-0 flex-col">
      <header class="flex h-10 shrink-0 items-center justify-between border-b border-default px-3">
        <div class="flex min-w-0 items-center gap-2 text-xs">
          <UIcon name="i-lucide-file-code-2" class="size-3.5" /><span class="truncate">{{ activeFile?.name || "SFTP Editor" }}</span><span v-if="dirty" class="size-1.5 rounded-full bg-primary" title="未保存" />
        </div>
        <UButton v-if="previewKind === 'text'" icon="i-lucide-save" size="xs" color="primary" variant="soft" :disabled="!dirty" :loading="saving" @click="save">
          保存
        </UButton>
      </header>
      <div v-if="opening" class="grid min-h-0 flex-1 place-items-center">
        <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
      </div>
      <div v-else-if="previewKind === 'text'" class="min-h-0 flex-1">
        <KokoSftpIdeMonacoEditor v-model="content" :language="editorLanguage" :path="editorPath" @save="save" />
      </div>
      <div v-else-if="previewKind === 'image'" class="grid min-h-0 flex-1 place-items-center overflow-auto bg-checkered p-6">
        <img :src="previewUrl" :alt="activeFile?.name" class="max-h-full max-w-full object-contain">
      </div>
      <div v-else class="grid min-h-0 flex-1 place-items-center p-6 text-center text-sm text-muted">
        <div class="flex flex-col items-center gap-3">
          <UIcon :name="editorError ? 'i-lucide-circle-alert' : previewKind === 'unsupported' ? 'i-lucide-file-warning' : 'i-lucide-file-code-2'" class="size-10" /><span>{{ editorError || manager.error.value || (previewKind === "unsupported" ? "该文件暂不支持在线预览或编辑" : "从左侧选择文件开始编辑") }}</span>
        </div>
      </div>
      <footer class="flex h-6 shrink-0 items-center justify-between border-t border-default px-3 text-[10px] text-muted">
        <span>{{ activeFile ? `${manager.currentPath.value}/${activeFile.name}` : manager.currentPath.value }}</span><span>{{ previewKind === "text" ? `${content.length} chars · Ctrl/Cmd+S 保存` : "SFTP" }}</span>
      </footer>
    </section>
  </div>
</template>
