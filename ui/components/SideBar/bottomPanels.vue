<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { FavoriteFolder } from "~/composables/useFavoriteFolders";
import type { AssetItem } from "~/types";

const props = defineProps<{
  mainPanelOpen: boolean
  visiblePanels: {
    favorites: boolean
    snippets: boolean
  }
}>();

const emit = defineEmits<{
  select: [asset: AssetItem]
  contextmenu: [asset: AssetItem, event: MouseEvent]
}>();

type PanelKind = "favorites" | "snippets";

const { t } = useI18n();
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
const { snippets, loading: snippetLoading, load: loadSnippets, applySnippet } = useSnippets();
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
  snippets: { exclusiveGroup: "asset-shelves", preferredHeight: 180, minHeight: 96, maxHeight: "30%" }
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
      @toggle="togglePanel('snippets')"
    >
      <template #actions>
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
      <div v-if="snippetLoading && snippets.length === 0" class="grid h-20 place-items-center">
        <UIcon name="i-lucide-loader-circle" class="sidebar-icon animate-spin" />
      </div>
      <UEmpty
        v-else-if="snippets.length === 0"
        icon="i-lucide-braces"
        size="sm"
        variant="naked"
        :title="t('Snippets.Empty')"
      />
      <button
        v-for="snippet in snippets"
        v-else
        :key="snippet.id"
        type="button"
        class="sidebar-row flex w-full items-start gap-1.5 px-2.5 py-1.5 text-left"
        :title="snippet.args"
        @click="applySnippet(snippet)"
      >
        <UIcon
          :name="snippet.variable.length > 0 ? 'i-lucide-braces' : 'i-lucide-terminal'"
          class="mt-0.5 sidebar-icon"
        />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[11px] font-medium">{{ snippet.name }}</span>
          <span class="block truncate font-ui-mono text-[10px] text-gray-400">{{ snippet.args }}</span>
        </span>
      </button>
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

  <UDropdownMenu
    :open="folderMenuVisible"
    :items="folderMenuItems"
    size="sm"
    :content="{ align: 'start', side: 'bottom' }"
    :ui="{ content: 'w-44 p-1' }"
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
