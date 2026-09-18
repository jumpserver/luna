<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { SftpFileEntry } from "#koko/composables/sftp/useSftpFileManager";
import type { EntryTreeRow, QuickOpenItem, TreeNode, TreeRow } from "./sftpIdeShared";
import { entryIcon, entryIconClass, entryTitle, formatFileSize, parentPath } from "./sftpIdeShared";

defineProps<{
  manager: {
    currentUploadName: { value: string };
    uploadProgress: { value: number };
    queuedUploadCount: { value: number };
    loading: { value: boolean };
  };
  isNarrowScreen: boolean;
  responsiveExplorerWidth: string;
  resizingExplorer: boolean;
  rootPath: string;
  explorerRootPath: string;
  selectedDirectory: string;
  activePath: string;
  tree: Record<string, TreeNode>;
  treeRows: TreeRow[];
  expanded: Set<string>;
  pendingError: string;
  pendingSubmitting: boolean;
  contextMenuItems: DropdownMenuItem[];
  contextMenuPosition: { x: number; y: number };
  quickOpenItems: QuickOpenItem[];
}>();

const emit = defineEmits<{
  refreshTree: [];
  openEntry: [entry: SftpFileEntry, path: string];
  pinTab: [path: string];
  treeKeydown: [row: EntryTreeRow, event: KeyboardEvent];
  openContextMenu: [entry: SftpFileEntry, path: string, event: MouseEvent];
  treeDragStart: [entry: SftpFileEntry, path: string, event: DragEvent];
  treeDragEnd: [];
  confirmCreate: [event: KeyboardEvent];
  cancelCreate: [];
  commitCreate: [];
  retryDirectory: [path: string];
  beginResize: [event: PointerEvent];
  uploadChange: [event: Event];
  moveQuickOpen: [offset: number];
  openQuickOpenItem: [item: QuickOpenItem | undefined];
  hideContextMenu: [];
}>();

const explorerOpen = defineModel<boolean>("explorerOpen", { required: true });
const explorerWidth = defineModel<number>("explorerWidth", { required: true });
const pendingName = defineModel<string>("pendingName", { required: true });
const treeFocusedPath = defineModel<string>("treeFocusedPath", { required: true });
const contextMenuVisible = defineModel<boolean>("contextMenuVisible", { required: true });
const quickOpenVisible = defineModel<boolean>("quickOpenVisible", { required: true });
const quickOpenQuery = defineModel<string>("quickOpenQuery", { required: true });
const quickOpenIndex = defineModel<number>("quickOpenIndex", { required: true });

const { t } = useI18n();
const treeScroller = useTemplateRef<HTMLElement>("treeScroller");
const uploadInput = useTemplateRef<HTMLInputElement>("uploadInput");
const quickOpenListEl = useTemplateRef<HTMLElement>("quickOpenList");

defineExpose({
  scrollActiveRow() {
    treeScroller.value?.querySelector<HTMLElement>('[data-tree-active="true"]')?.scrollIntoView({ block: "nearest" });
  },
  focusFocusedRow() {
    const row = treeScroller.value?.querySelector<HTMLElement>('[data-tree-focused="true"]');
    row?.focus({ preventScroll: true });
    row?.scrollIntoView({ block: "nearest" });
  },
  focusPendingInput() {
    treeScroller.value?.querySelector<HTMLInputElement>("[data-pending-create-input]")?.focus();
  },
  openUploadPicker() {
    uploadInput.value?.click();
  },
  scrollQuickOpenActive() {
    quickOpenListEl.value
      ?.querySelector<HTMLElement>('[data-quick-open-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }
});
</script>

<template>
  <aside
    v-show="!isNarrowScreen || explorerOpen"
    class="relative z-40 flex min-h-0 flex-col border-r border-default bg-[var(--workspace-surface-sidebar)] max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:shadow-xl"
    :style="{ width: isNarrowScreen ? responsiveExplorerWidth : undefined }"
  >
    <div
      class="flex h-[var(--workspace-toolbar-height)] min-w-0 shrink-0 items-center gap-1 border-b border-default px-2.5"
    >
      <p class="min-w-0 flex-1 truncate text-left text-xs font-medium text-muted">
        {{ t("koko.sftpEditor.explorerTitle") }}
      </p>
      <div class="flex h-7 items-center gap-1">
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          class="md:hidden"
          :aria-label="t('koko.actions.close')"
          @click="void (explorerOpen = false)"
        />
        <UPopover
          v-model:open="quickOpenVisible"
          :content="{ align: 'start', side: 'bottom', sideOffset: 8 }"
          :ui="{ content: 'p-0' }"
        >
          <button
            type="button"
            class="grid size-6 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-[var(--app-hover-strong)] hover:text-highlighted"
            :aria-label="t('koko.sftpEditor.quickOpenShortcut')"
            :title="t('koko.sftpEditor.quickOpenShortcut')"
          >
            <UIcon name="i-lucide-search" class="size-3.5" />
          </button>

          <template #content>
            <div
              class="w-[360px] overflow-hidden rounded-xl bg-default shadow-xl ring-1 ring-black/10 dark:ring-white/12"
            >
              <div class="border-b border-default p-2">
                <UInput
                  v-model="quickOpenQuery"
                  autofocus
                  icon="i-lucide-search"
                  size="sm"
                  variant="none"
                  :placeholder="t('koko.sftpEditor.quickOpenPlaceholder')"
                  class="w-full"
                  :ui="{ base: 'h-8 rounded-lg bg-elevated/70 ring-1 ring-inset ring-default' }"
                  @keydown.down.prevent="emit('moveQuickOpen', 1)"
                  @keydown.up.prevent="emit('moveQuickOpen', -1)"
                  @keydown.enter.prevent="emit('openQuickOpenItem', quickOpenItems[quickOpenIndex])"
                />
              </div>
              <div ref="quickOpenList" role="listbox" class="max-h-80 min-h-32 overflow-y-auto p-1.5">
                <button
                  v-for="(item, index) in quickOpenItems"
                  :key="item.path"
                  type="button"
                  tabindex="-1"
                  class="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-elevated"
                  :class="quickOpenIndex === index ? 'bg-elevated' : ''"
                  :title="item.path"
                  role="option"
                  :aria-selected="quickOpenIndex === index"
                  :data-quick-open-active="quickOpenIndex === index"
                  @mouseenter="quickOpenIndex = index"
                  @click="emit('openQuickOpenItem', item)"
                >
                  <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-elevated">
                    <UIcon :name="entryIcon(item.entry)" class="size-4" :class="entryIconClass(item.entry)" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm text-highlighted">{{ item.entry.name }}</span>
                    <span class="block truncate font-ui-mono text-[11px] text-muted">
                      {{ parentPath(item.path) }}
                    </span>
                  </span>
                  <UBadge
                    v-if="item.open"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                    :label="t('koko.sftpEditor.opened')"
                  />
                </button>
                <div
                  v-if="!quickOpenItems.length"
                  class="grid h-24 place-items-center px-4 text-center text-xs text-muted"
                >
                  {{ t("koko.sftpEditor.quickOpenNoResults") }}
                </div>
              </div>
              <div
                class="flex items-center justify-between gap-3 border-t border-default px-3 py-2 text-[10px] text-muted"
              >
                <span>{{ t("koko.sftpEditor.quickOpenLoadedHint") }}</span>
                <span class="shrink-0 font-ui-mono">↑↓ · {{ t("koko.terminal.enter") }}</span>
              </div>
            </div>
          </template>
        </UPopover>
        <UTooltip :text="t('koko.sftpEditor.refreshTree')" :delay-duration="150">
          <button
            type="button"
            class="grid size-6 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-[var(--app-hover-strong)] hover:text-highlighted"
            :aria-label="t('koko.sftpEditor.refreshTree')"
            @click="emit('refreshTree')"
          >
            <UIcon name="i-lucide-refresh-cw" class="size-3.5" />
          </button>
        </UTooltip>
      </div>
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
    <div
      ref="treeScroller"
      class="app-tree min-h-0 flex-1 overflow-auto px-2 py-2"
      role="tree"
      :aria-label="t('koko.sftpEditor.fileTree')"
    >
      <div v-if="manager.loading.value && !rootPath" class="space-y-2 px-3 py-2">
        <div class="app-tree-row flex items-center gap-2 text-(--app-muted)">
          <UIcon name="i-lucide-loader-circle" class="app-tree-icon animate-spin" />
          {{ t("koko.sftpEditor.connectingAndLoading") }}
        </div>
        <USkeleton v-for="index in 4" :key="index" class="h-[var(--app-tree-row-height)] w-full rounded-md" />
      </div>
      <template v-for="row in treeRows" :key="row.path">
        <button
          v-if="row.kind === 'entry'"
          class="app-tree-row sidebar-row group flex w-full items-center gap-1 rounded-md pr-1 text-left"
          :class="[
            row.entry.is_dir
              ? selectedDirectory === row.path
                ? 'bg-[var(--app-hover-soft)] text-[var(--app-fg)]'
                : ''
              : activePath === row.path
                ? 'bg-[var(--app-hover-soft)] text-[var(--app-fg)]'
                : '',
            !row.entry.is_dir ? 'cursor-grab active:cursor-grabbing' : ''
          ]"
          :style="{ paddingLeft: `${6 + row.depth * 12}px` }"
          :title="entryTitle(row.entry, row.path)"
          :draggable="!row.entry.is_dir"
          role="treeitem"
          :aria-level="row.depth + 1"
          :aria-expanded="row.entry.is_dir ? row.expanded : undefined"
          :aria-selected="row.entry.is_dir ? selectedDirectory === row.path : activePath === row.path"
          :tabindex="treeFocusedPath === row.path ? 0 : -1"
          :data-active="(row.entry.is_dir ? selectedDirectory === row.path : activePath === row.path) ? '' : undefined"
          :data-tree-active="activePath === row.path"
          :data-tree-focused="treeFocusedPath === row.path"
          @click="emit('openEntry', row.entry, row.path)"
          @dblclick="!row.entry.is_dir && emit('pinTab', row.path)"
          @focus="treeFocusedPath = row.path"
          @keydown="emit('treeKeydown', row, $event)"
          @contextmenu="emit('openContextMenu', row.entry, row.path, $event)"
          @dragstart="emit('treeDragStart', row.entry, row.path, $event)"
          @dragend="emit('treeDragEnd')"
        >
          <span
            v-if="row.entry.is_dir"
            class="app-tree-icon-slot grid shrink-0 place-items-center rounded-sm text-muted"
          >
            <UIcon
              name="i-lucide-chevron-right"
              class="app-tree-toggle-icon sidebar-icon-sm transition-transform"
              :class="row.expanded ? 'rotate-90' : ''"
            />
          </span>
          <span v-else class="app-tree-icon-slot shrink-0" />
          <UIcon
            :name="entryIcon(row.entry, row.expanded)"
            class="app-tree-icon sidebar-icon"
            :class="entryIconClass(row.entry)"
          />
          <span class="min-w-0 flex-1 truncate">{{ row.entry.name }}</span>
          <span v-if="!row.entry.is_dir" class="shrink-0 font-ui-mono text-[9px] tabular-nums text-(--app-muted)">
            {{ formatFileSize(row.entry.size) }}
          </span>
        </button>
        <div v-else-if="row.kind === 'pending'" class="py-0.5 pr-1" :style="{ paddingLeft: `${6 + row.depth * 12}px` }">
          <div class="flex items-center gap-1">
            <UIcon
              :name="row.createKind === 'directory' ? 'i-lucide-folder' : 'i-lucide-file-code-2'"
              class="app-tree-icon sidebar-icon"
              :class="row.createKind === 'directory' ? 'tree-folder-icon' : ''"
            />
            <input
              v-model="pendingName"
              data-pending-create-input
              class="h-6 min-w-0 flex-1 rounded border border-primary bg-(--workspace-surface-sub-panel) px-1.5 text-[length:var(--app-tree-font-size)] text-(--app-fg) outline-none"
              :placeholder="
                row.createKind === 'directory' ? t('koko.sftpEditor.directoryName') : t('koko.sftpEditor.fileName')
              "
              :disabled="pendingSubmitting"
              @keydown.enter.exact="emit('confirmCreate', $event)"
              @keydown.esc.prevent="emit('cancelCreate')"
            />
            <UButton
              icon="i-lucide-check"
              size="xs"
              color="primary"
              variant="ghost"
              :loading="pendingSubmitting"
              :title="t('koko.actions.confirm')"
              @click="emit('commitCreate')"
            />
            <UButton
              icon="i-lucide-x"
              size="xs"
              color="neutral"
              variant="ghost"
              :disabled="pendingSubmitting"
              :title="t('koko.actions.cancel')"
              @click="emit('cancelCreate')"
            />
          </div>
          <div v-if="pendingError" class="pl-5 pt-1 text-[10px] text-error">
            {{ pendingError }}
          </div>
        </div>
        <div
          v-else
          class="app-tree-row flex items-center gap-1 pr-1 text-muted"
          :class="row.kind === 'error' ? 'text-error' : ''"
          :style="{ paddingLeft: `${20 + row.depth * 12}px` }"
        >
          <UIcon
            :name="row.kind === 'loading' ? 'i-lucide-loader-circle' : 'i-lucide-circle-alert'"
            class="app-tree-toggle-icon shrink-0"
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
            @click="emit('retryDirectory', row.parent)"
          />
        </div>
      </template>
      <div
        v-if="expanded.has(explorerRootPath) && tree[explorerRootPath]?.loading"
        class="app-tree-row flex items-center gap-1.5 px-1.5 text-muted"
      >
        <UIcon name="i-lucide-loader-circle" class="app-tree-icon animate-spin" />
        {{ t("koko.sftpEditor.loading") }}
      </div>
      <div v-else-if="expanded.has(explorerRootPath) && tree[explorerRootPath]?.error" class="px-1.5 py-1 text-error">
        {{ tree[explorerRootPath]?.error }}
      </div>
    </div>
    <div
      class="absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize max-md:hidden"
      :title="t('koko.sftpEditor.resizeExplorer')"
      @pointerdown="emit('beginResize', $event)"
      @dblclick="explorerWidth = 280"
    >
      <div
        class="mx-auto h-full w-px transition-colors"
        :class="resizingExplorer ? 'bg-primary' : 'bg-transparent hover:bg-primary/60'"
      />
    </div>
    <input ref="uploadInput" type="file" multiple class="hidden" @change="emit('uploadChange', $event)" />
    <UDropdownMenu
      :open="contextMenuVisible"
      :items="contextMenuItems"
      size="sm"
      :content="{ align: 'start', side: 'bottom' }"
      @update:open="
        (open) => {
          contextMenuVisible = open;
          if (!open) emit('hideContextMenu');
        }
      "
    >
      <div
        class="pointer-events-none fixed size-px"
        :style="{ left: `${contextMenuPosition.x}px`, top: `${contextMenuPosition.y}px` }"
      />
    </UDropdownMenu>
  </aside>
</template>
