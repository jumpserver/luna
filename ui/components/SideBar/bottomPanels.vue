<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { FavoriteFolder } from "~/composables/useFavoriteFolders";
import type { Snippet } from "~/composables/useSnippets";
import type { AssetItem } from "~/types";
import type { SnippetVariableField } from "~/utils/snippetVariables";
import { isTerminalSnippetModule, renderSnippetCommand } from "~/utils/snippetVariables";

const props = defineProps<{
  mainPanelOpen: boolean;
  visiblePanels: {
    favorites: boolean;
    snippets: boolean;
  };
}>();

const emit = defineEmits<{
  select: [asset: AssetItem];
  contextmenu: [asset: AssetItem, event: MouseEvent];
}>();

type PanelKind = "favorites" | "snippets";

const { t } = useI18n();
const toast = useToast();
const { addErrorToast } = useErrorToast();
const openPanels = ref<Set<PanelKind>>(new Set());
const {
  folders: favoriteFolders,
  rootAssets: favoriteRootAssets,
  loading: favoriteLoading,
  load: loadFavorites,
  createFolder,
  renameFolder,
  removeFolder
} = useFavoriteFolders();
const { snippets, loading: snippetLoading, load: loadSnippets, loadVariableForm } = useSnippets();
const { openScriptEditor } = useWorkspaceTabs();
const { fillCommand: fillBatchCommand } = useBatchCommandPanel();
const createModalOpen = ref(false);
const createParentId = ref<string | null>(null);
const folderName = ref("");
const creating = ref(false);
const folderMenuVisible = ref(false);
const folderMenuPosition = ref({ x: 0, y: 0 });
const folderMenuTarget = ref<FavoriteFolder | null>(null);
const renameModalOpen = ref(false);
const renameTarget = ref<FavoriteFolder | null>(null);
const renameValue = ref("");
const deleteModalOpen = ref(false);
const deleteTarget = ref<FavoriteFolder | null>(null);
const deleting = ref(false);
const snippetSearch = ref("");
const variableModalOpen = ref(false);
const variableLoadingSnippetId = ref("");
const variableSnippet = ref<Snippet | null>(null);
const variableFields = ref<SnippetVariableField[]>([]);
const variableValues = ref<Record<string, string>>({});
const variableCommand = ref("");

const variableFormDisabled = computed(
  () =>
    !variableCommand.value.trim() ||
    variableFields.value.some((field) => field.required && !variableValues.value[field.key])
);

const snippetCreateItems = computed<DropdownMenuItem[]>(() =>
  [
    ["Shell", "shell", "i-lucide-terminal"],
    ["PowerShell", "win_shell", "i-lucide-monitor"],
    ["Python", "python", "i-lucide-file-code-2"],
    ["Raw", "raw", "i-lucide-file-text"]
  ].map(([label, module, icon]) => ({
    label,
    icon,
    onSelect: () => openScriptEditor({ name: t("Snippets.Untitled"), module: module! })
  }))
);

const folderHasClosedBranch = (folder: FavoriteFolder): boolean => {
  if (!folder.open) return true;
  return folder.children.some((child) => folderHasClosedBranch(child));
};

const folderHasOpenBranch = (folder: FavoriteFolder): boolean => {
  if (folder.open) return true;
  return folder.children.some((child) => folderHasOpenBranch(child));
};

const expandFolderRecursive = (folder: FavoriteFolder) => {
  folder.open = true;
  for (const child of folder.children) {
    expandFolderRecursive(child);
  }
};

const collapseFolderRecursive = (folder: FavoriteFolder) => {
  folder.open = false;
  for (const child of folder.children) {
    collapseFolderRecursive(child);
  }
};

const toggleFolder = (folder: FavoriteFolder) => {
  folder.open = !folder.open;
};

const openCreateFolder = (parentId: string | null = null) => {
  createParentId.value = parentId;
  folderName.value = "";
  createModalOpen.value = true;
};

const submitCreateFolder = async () => {
  const name = folderName.value.trim();
  if (!name || creating.value) return;

  creating.value = true;
  try {
    await createFolder(name, createParentId.value);
    createModalOpen.value = false;
  } catch (error) {
    addErrorToast({
      title: t("Favorite.CreateFailed"),
      error,
      icon: "i-lucide-circle-alert"
    });
  } finally {
    creating.value = false;
  }
};

const openFolderMenu = (event: MouseEvent, folder: FavoriteFolder | null = null) => {
  event.preventDefault();
  event.stopPropagation();
  folderMenuTarget.value = folder;
  folderMenuPosition.value = { x: event.clientX, y: event.clientY };
  folderMenuVisible.value = true;
};

const openRenameFolder = (folder: FavoriteFolder) => {
  folderMenuVisible.value = false;
  renameTarget.value = folder;
  renameValue.value = folder.name;
  renameModalOpen.value = true;
};

const renameDisabled = computed(() => {
  const name = renameValue.value.trim();
  return !name || name === renameTarget.value?.name;
});

const submitRenameFolder = async () => {
  const folder = renameTarget.value;
  const name = renameValue.value.trim();
  if (!folder || !name || name === folder.name) return;

  try {
    await renameFolder(folder.id, name);
    renameModalOpen.value = false;
    renameTarget.value = null;
  } catch (error) {
    addErrorToast({
      title: t("Favorite.RenameFailed"),
      error,
      icon: "i-lucide-circle-alert"
    });
  }
};

const updateRenameModal = (open: boolean) => {
  renameModalOpen.value = open;
  if (!open) renameTarget.value = null;
};

const openDeleteFolder = (folder: FavoriteFolder) => {
  folderMenuVisible.value = false;
  deleteTarget.value = folder;
  deleteModalOpen.value = true;
};

const submitDeleteFolder = async () => {
  const folder = deleteTarget.value;
  if (!folder || deleting.value) return;

  deleting.value = true;
  try {
    await removeFolder(folder.id);
    deleteModalOpen.value = false;
    deleteTarget.value = null;
  } catch (error) {
    addErrorToast({
      title: t("Favorite.DeleteFailed"),
      error,
      icon: "i-lucide-circle-alert"
    });
  } finally {
    deleting.value = false;
  }
};

const updateDeleteModal = (open: boolean) => {
  deleteModalOpen.value = open;
  if (!open) deleteTarget.value = null;
};

const panelConfig = {
  favorites: { exclusiveGroup: "asset-shelves", preferredHeight: 280, minHeight: 128, maxHeight: "50%" },
  snippets: { exclusiveGroup: "asset-shelves", preferredHeight: 280, minHeight: 128, maxHeight: "50%" }
} as const;

const panelMaxHeight = (kind: PanelKind) => (props.mainPanelOpen ? panelConfig[kind].maxHeight : "100%");

const isOpen = (kind: PanelKind) => openPanels.value.has(kind);

const togglePanel = (kind: PanelKind) => {
  const next = new Set(openPanels.value);
  const nextOpen = !next.has(kind);
  if (nextOpen) {
    const group = panelConfig[kind].exclusiveGroup;
    for (const openKind of next) {
      if (panelConfig[openKind].exclusiveGroup === group) next.delete(openKind);
    }
    next.add(kind);
  } else {
    next.delete(kind);
  }
  openPanels.value = next;
  if (nextOpen && kind === "favorites") loadFavorites();
  if (nextOpen && kind === "snippets") loadSnippets();
};

const refreshPanel = (kind: PanelKind) => {
  if (kind === "favorites") return loadFavorites();
  return loadSnippets();
};

const normalizedSnippetSearch = computed(() => snippetSearch.value.trim().toLocaleLowerCase());

const filteredSnippets = computed(() => {
  const query = normalizedSnippetSearch.value;
  if (!query) return snippets.value;

  return snippets.value.filter((snippet) =>
    [snippet.name, snippet.args, snippet.comment, snippet.module.label, snippet.module.value, snippet.createdBy].some(
      (value) =>
        String(value || "")
          .toLocaleLowerCase()
          .includes(query)
    )
  );
});

function getSnippetIcon(snippet: Snippet) {
  switch (snippet.module.value) {
    case "shell":
      return "i-lucide-terminal";
    case "win_shell":
      return "i-lucide-monitor";
    case "python":
      return "i-lucide-file-code-2";
    case "mysql":
    case "mariadb":
    case "postgresql":
    case "sqlserver":
    case "oracle":
      return "i-lucide-database";
    case "raw":
      return "i-lucide-file-text";
    default:
      if (snippet.variable.length > 0) {
        return "i-lucide-braces";
      }

      return "i-lucide-file-code-2";
  }
}

function getSnippetTitle(snippet: Snippet) {
  return [snippet.name, snippet.module.label || snippet.module.value, snippet.comment, snippet.args]
    .filter(Boolean)
    .join("\n");
}

function handleSnippetDoubleClick(snippet: Snippet) {
  openScriptEditor({
    id: snippet.id,
    name: snippet.name,
    args: snippet.args,
    module: snippet.module.value,
    comment: snippet.comment
  });
}

function updateVariableCommand() {
  if (!variableSnippet.value) return;
  variableCommand.value = renderSnippetCommand(variableSnippet.value.args, variableValues.value);
}

function updateVariableValue(key: string, value: unknown) {
  variableValues.value = { ...variableValues.value, [key]: String(value ?? "") };
  updateVariableCommand();
}

function updateVariableModal(open: boolean) {
  variableModalOpen.value = open;
  if (open) return;

  variableSnippet.value = null;
  variableFields.value = [];
  variableValues.value = {};
  variableCommand.value = "";
}

async function openVariableForm(snippet: Snippet) {
  if (variableLoadingSnippetId.value) return;

  variableLoadingSnippetId.value = snippet.id;
  try {
    const fields = await loadVariableForm(snippet.id);
    if (fields.length === 0) throw new Error(t("Snippets.VariableFormEmpty"));

    variableSnippet.value = snippet;
    variableFields.value = fields;
    variableValues.value = Object.fromEntries(fields.map((field) => [field.key, field.defaultValue]));
    updateVariableCommand();
    variableModalOpen.value = true;
  } catch (error) {
    addErrorToast({
      title: t("Snippets.VariableFormLoadFailed"),
      error,
      icon: "i-lucide-circle-alert"
    });
  } finally {
    variableLoadingSnippetId.value = "";
  }
}

function confirmVariableCommand() {
  if (variableFormDisabled.value) return;
  fillBatchCommand(variableCommand.value);
  updateVariableModal(false);
}

async function fillSnippetIntoBatchCommand(snippet: Snippet) {
  if (!isTerminalSnippetModule(snippet.module.value)) {
    toast.add({
      title: t("Snippets.BatchCommandUnsupported"),
      description: t("Snippets.BatchCommandUnsupportedHint", {
        module: snippet.module.label || snippet.module.value
      }),
      color: "warning",
      icon: "i-lucide-circle-alert"
    });
    return;
  }

  if (snippet.variable.length > 0) {
    await openVariableForm(snippet);
    return;
  }

  fillBatchCommand(snippet.args);
}

useEventBus().on("favoriteChanged", () => {
  void loadFavorites();
});

const folderMenuItems = computed<DropdownMenuItem[]>(() => {
  const folder = folderMenuTarget.value;
  const canExpand = !!folder && !folder.open;
  const canCollapse = !!folder?.open;
  const canExpandAll = !!folder && folderHasClosedBranch(folder);
  const canCollapseAll = !!folder && folderHasOpenBranch(folder);

  return [
    ...(canExpand
      ? [
          {
            label: t("Tree.Expand"),
            icon: "i-lucide-chevron-right",
            onSelect: () => {
              folderMenuVisible.value = false;
              if (folder) folder.open = true;
            }
          } satisfies DropdownMenuItem
        ]
      : []),
    ...(canCollapse
      ? [
          {
            label: t("Tree.Collapse"),
            icon: "i-lucide-chevron-down",
            onSelect: () => {
              folderMenuVisible.value = false;
              if (folder) folder.open = false;
            }
          } satisfies DropdownMenuItem
        ]
      : []),
    ...(canExpandAll
      ? [
          {
            label: t("Tree.ExpandAll"),
            icon: "i-lucide-chevrons-down",
            onSelect: () => {
              folderMenuVisible.value = false;
              if (folder) expandFolderRecursive(folder);
            }
          } satisfies DropdownMenuItem
        ]
      : []),
    ...(canCollapseAll
      ? [
          {
            label: t("Tree.CollapseAll"),
            icon: "i-lucide-chevrons-up",
            onSelect: () => {
              folderMenuVisible.value = false;
              if (folder) collapseFolderRecursive(folder);
            }
          } satisfies DropdownMenuItem
        ]
      : []),
    {
      label: folder ? t("Favorite.CreateSubfolder") : t("Favorite.CreateFolder"),
      icon: "i-lucide-folder-plus",
      onSelect: () => {
        folderMenuVisible.value = false;
        openCreateFolder(folder?.id ?? null);
      }
    },
    ...(folder
      ? [
          {
            label: t("ContextMenu.Rename"),
            icon: "i-lucide-pencil",
            onSelect: () => openRenameFolder(folder)
          },
          {
            label: t("Favorite.DeleteFolder"),
            icon: "i-lucide-trash-2",
            color: "error" as const,
            onSelect: () => openDeleteFolder(folder)
          }
        ]
      : [])
  ];
});
</script>

<template>
  <div class="contents">
    <SideBarCollapsiblePanel
      v-if="visiblePanels.favorites"
      :open="isOpen('favorites')"
      :title="t('Menu.Favorite')"
      v-bind="panelConfig.favorites"
      :max-height="panelMaxHeight('favorites')"
      :fill-available="!mainPanelOpen"
      @toggle="togglePanel('favorites')"
    >
      <template #actions>
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-folder-plus"
          class="sidebar-icon-button size-6 justify-center p-0"
          :ui="{ leadingIcon: 'm-0 sidebar-icon' }"
          :aria-label="t('Favorite.CreateFolder')"
          @click.stop="openCreateFolder()"
        />
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-refresh-cw"
          :loading="favoriteLoading"
          class="sidebar-icon-button size-6 justify-center p-0"
          :ui="{ leadingIcon: 'm-0 sidebar-icon' }"
          :aria-label="t('ToolTips.Refresh')"
          @click.stop="refreshPanel('favorites')"
        />
      </template>
      <div v-if="favoriteLoading && favoriteFolders.length === 0" class="grid h-20 place-items-center">
        <UIcon name="i-lucide-loader-circle" class="sidebar-icon animate-spin" />
      </div>
      <div v-else class="pb-1">
        <UEmpty
          v-if="favoriteFolders.length === 0 && favoriteRootAssets.length === 0"
          icon="i-lucide-star"
          size="sm"
          variant="naked"
          :title="t('Common.NoData')"
          class="py-3"
        />
        <button
          v-for="asset in favoriteRootAssets"
          :key="`root-${asset.id}`"
          type="button"
          class="sidebar-row flex h-7 w-full items-center gap-1 rounded-lg pr-1 text-left text-[11px]"
          :style="{ paddingLeft: '10px' }"
          @dblclick="emit('select', asset)"
          @contextmenu.prevent="emit('contextmenu', asset, $event)"
        >
          <UIcon name="i-lucide-terminal" class="sidebar-icon" />
          <span class="truncate font-ui-mono">{{ asset.name }}</span>
        </button>
        <SideBarFavoriteTreeNode
          v-for="folder in favoriteFolders"
          :key="folder.id"
          :folder="folder"
          :level="0"
          @select="emit('select', $event)"
          @contextmenu="(asset, event) => emit('contextmenu', asset, event)"
          @folder-contextmenu="(folder, event) => openFolderMenu(event, folder)"
          @toggle-folder="toggleFolder"
        />
      </div>
    </SideBarCollapsiblePanel>

    <SideBarCollapsiblePanel
      v-if="visiblePanels.snippets"
      :open="isOpen('snippets')"
      :title="t('Menu.Snippets')"
      v-bind="panelConfig.snippets"
      :max-height="panelMaxHeight('snippets')"
      :fill-available="!mainPanelOpen"
      @toggle="togglePanel('snippets')"
    >
      <template #actions>
        <UDropdownMenu :items="snippetCreateItems" :content="{ align: 'end', side: 'right' }">
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-plus"
            class="sidebar-icon-button size-6 justify-center p-0"
            :ui="{ leadingIcon: 'm-0 sidebar-icon' }"
            :aria-label="t('Snippets.Create')"
            @click.stop
          />
        </UDropdownMenu>
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-refresh-cw"
          :loading="snippetLoading"
          class="sidebar-icon-button size-6 justify-center p-0"
          :ui="{ leadingIcon: 'm-0 sidebar-icon' }"
          :aria-label="t('ToolTips.Refresh')"
          @click.stop="refreshPanel('snippets')"
        />
      </template>
      <div class="flex min-h-0 flex-1 flex-col">
        <div class="px-2 py-1.5">
          <UInput
            v-model="snippetSearch"
            size="sm"
            clearable
            autocapitalize="none"
            autocorrect="off"
            icon="i-lucide-search"
            variant="none"
            :placeholder="t('Operation.Search')"
            class="search-input w-full rounded-xl"
            :ui="{
              base: 'h-7 rounded-xl bg-[var(--app-surface-panel-strong)] px-1 text-[12px] text-[var(--app-fg)] ring-1 ring-inset ring-[var(--app-border)] focus-visible:ring-[var(--app-focus-ring)] placeholder:text-[var(--app-muted)]',
              leadingIcon: 'sidebar-icon',
              trailingIcon: 'sidebar-icon'
            }"
          >
            <template v-if="snippetSearch?.length" #trailing>
              <UButton
                color="neutral"
                variant="link"
                size="xs"
                icon="i-lucide-circle-x"
                aria-label="Clear input"
                :ui="{ leadingIcon: 'm-0 sidebar-icon' }"
                @click="
                  () => {
                    snippetSearch = '';
                  }
                "
              />
            </template>
          </UInput>
        </div>

        <div v-if="snippetLoading && snippets.length === 0" class="grid h-20 place-items-center">
          <UIcon name="i-lucide-loader-circle" class="sidebar-icon animate-spin" />
        </div>
        <UEmpty
          v-else-if="filteredSnippets.length === 0"
          icon="i-lucide-braces"
          size="sm"
          variant="naked"
          :title="normalizedSnippetSearch ? t('Common.NoData') : t('Snippets.Empty')"
        />
        <div
          v-for="snippet in filteredSnippets"
          v-else
          :key="snippet.id"
          class="sidebar-row group flex w-full items-start gap-1.5 px-2.5 py-1.5"
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 cursor-default items-start gap-1.5 text-left"
            :title="getSnippetTitle(snippet)"
            @dblclick="handleSnippetDoubleClick(snippet)"
          >
            <UIcon :name="getSnippetIcon(snippet)" class="mt-0.5 sidebar-icon shrink-0" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[11px] font-medium">{{ snippet.name }}</span>
              <span class="block truncate font-ui-mono text-[10px] text-gray-400">{{ snippet.args }}</span>
            </span>
          </button>
          <UTooltip :text="t('Snippets.FillBatchCommand')" :delay-duration="120">
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-square-terminal"
              class="mt-0.5 size-6 shrink-0 justify-center p-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
              :ui="{ leadingIcon: 'm-0 sidebar-icon' }"
              :aria-label="t('Snippets.FillBatchCommand')"
              :loading="variableLoadingSnippetId === snippet.id"
              :disabled="Boolean(variableLoadingSnippetId)"
              @click.stop="fillSnippetIntoBatchCommand(snippet)"
            />
          </UTooltip>
        </div>
      </div>
    </SideBarCollapsiblePanel>
  </div>

  <Modal
    :open="createModalOpen"
    :title="createParentId ? t('Favorite.CreateSubfolder') : t('Favorite.CreateFolder')"
    :disabled="!folderName.trim() || creating"
    @confirm="submitCreateFolder"
    @update:open="createModalOpen = $event"
  >
    <UInput
      v-model="folderName"
      autofocus
      class="w-full"
      :placeholder="t('Favorite.FolderName')"
      @keydown.enter="submitCreateFolder"
    />
  </Modal>

  <Modal
    :open="renameModalOpen"
    :title="t('ContextMenu.Rename')"
    :description="renameTarget?.name || ''"
    :disabled="renameDisabled"
    @confirm="submitRenameFolder"
    @update:open="updateRenameModal"
  >
    <UInput
      v-model="renameValue"
      autofocus
      class="w-full"
      :placeholder="t('Favorite.FolderName')"
      @keydown.enter="submitRenameFolder"
    />
  </Modal>

  <Modal
    :open="deleteModalOpen"
    :title="t('Favorite.DeleteFolder')"
    :description="t('Favorite.DeleteFolderConfirm', { name: deleteTarget?.name || '' })"
    :disabled="deleting"
    @confirm="submitDeleteFolder"
    @update:open="updateDeleteModal"
  />

  <UModal
    :open="variableModalOpen"
    :title="t('Snippets.VariableFormTitle')"
    :description="variableSnippet?.name || ''"
    :ui="{ content: 'w-[calc(100vw-2rem)] max-w-lg', footer: 'justify-end gap-2' }"
    @update:open="updateVariableModal"
  >
    <template #body>
      <div class="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        <UFormField
          v-for="(field, index) in variableFields"
          :key="field.key"
          :label="field.label"
          :help="field.helpText"
          :required="field.required"
          size="sm"
        >
          <UInput
            v-if="field.type === 'string'"
            :model-value="variableValues[field.key]"
            :autofocus="index === 0"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            class="w-full"
            @update:model-value="updateVariableValue(field.key, $event)"
          />
          <USelect
            v-else
            :model-value="variableValues[field.key]"
            :items="field.choices"
            value-key="value"
            label-key="label"
            :placeholder="t('Snippets.VariableSelectPlaceholder')"
            class="w-full"
            @update:model-value="updateVariableValue(field.key, $event)"
          />
        </UFormField>

        <UFormField :label="t('Snippets.GeneratedCommand')" :help="t('Snippets.GeneratedCommandHint')" size="sm">
          <UTextarea
            v-model="variableCommand"
            :rows="5"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            class="w-full font-ui-mono"
          />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <UButton color="neutral" variant="outline" @click="updateVariableModal(false)">
        {{ t("Common.Cancel") }}
      </UButton>
      <UButton
        :label="t('Snippets.FillBatchCommand')"
        :disabled="variableFormDisabled"
        @click="confirmVariableCommand"
      />
    </template>
  </UModal>

  <UDropdownMenu
    :open="folderMenuVisible"
    :items="folderMenuItems"
    size="sm"
    :content="{ align: 'start', side: 'bottom' }"
    @update:open="folderMenuVisible = $event"
  >
    <div
      class="fixed pointer-events-none"
      :style="{
        left: `${folderMenuPosition.x}px`,
        top: `${folderMenuPosition.y}px`,
        width: '1px',
        height: '1px'
      }"
    />
  </UDropdownMenu>
</template>
