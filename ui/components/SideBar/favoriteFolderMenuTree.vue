<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { ComponentPublicInstance } from "vue";
import type { FavoriteFolder } from "~/composables/useFavoriteFolders";
import {
  FAVORITE_FOLDER_NAME_MAX_LENGTH,
  flattenVisibleFavoriteFolderTree,
  isFavoriteFolderNameTooLong
} from "~/composables/useFavoriteFolders";

const props = defineProps<{
  folders: FavoriteFolder[];
  rootAssetCount: number;
  currentFolderId?: string | null;
}>();

const emit = defineEmits<{
  select: [folderId: string | null];
}>();

const { t } = useI18n();
const { addErrorToast } = useErrorToast();
const { createFolder, renameFolder, removeFolder } = useFavoriteFolders();
const expandedFolderIds = ref<Set<string>>(new Set());
const folderMenuVisible = ref(false);
const folderMenuPosition = ref({ x: 0, y: 0 });
const folderMenuTarget = ref<FavoriteFolder | null>(null);
const creating = ref(false);
const editingFolderId = ref<string | null>(null);
const editingSource = ref("");
const editingValue = ref("");
const renameInputRef = ref<ComponentPublicInstance | null>(null);
const renaming = ref(false);
const deleteModalOpen = ref(false);
const deleteTarget = ref<FavoriteFolder | null>(null);
const deleting = ref(false);
const visibleFolders = computed(() => flattenVisibleFavoriteFolderTree(props.folders, expandedFolderIds.value));

const toggleFolder = (folder: FavoriteFolder) => {
  const expanded = new Set(expandedFolderIds.value);
  if (expanded.has(folder.id)) expanded.delete(folder.id);
  else expanded.add(folder.id);
  expandedFolderIds.value = expanded;
};

const openFolderMenu = (event: MouseEvent, folder: FavoriteFolder | null) => {
  folderMenuTarget.value = folder;
  folderMenuPosition.value = { x: event.clientX, y: event.clientY };
  folderMenuVisible.value = true;
};

const focusRenameInput = async () => {
  await nextTick();
  const root = renameInputRef.value?.$el as HTMLElement | undefined;
  const input = root instanceof HTMLInputElement ? root : root?.querySelector("input");
  input?.focus();
  input?.select();
};

const startRenameFolder = (folder: FavoriteFolder) => {
  folderMenuVisible.value = false;
  editingFolderId.value = folder.id;
  editingSource.value = folder.name;
  editingValue.value = folder.name;
  void focusRenameInput();
};

const createAndRenameFolder = async (parentId: string | null) => {
  folderMenuVisible.value = false;
  if (creating.value) return;
  creating.value = true;
  try {
    const folder = await createFolder(t("Favorite.DefaultFolderName"), parentId);
    if (!folder) return;
    if (parentId) {
      expandedFolderIds.value = new Set(expandedFolderIds.value).add(parentId);
    }
    startRenameFolder(folder);
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

const cancelRenameFolder = () => {
  editingFolderId.value = null;
  editingSource.value = "";
  editingValue.value = "";
};

const finishRenameFolder = async (folder: FavoriteFolder) => {
  if (editingFolderId.value !== folder.id || renaming.value) return;

  const name = editingValue.value.trim();
  if (!name || name === editingSource.value) {
    cancelRenameFolder();
    return;
  }
  if (isFavoriteFolderNameTooLong(name)) return;

  renaming.value = true;
  try {
    await renameFolder(folder.id, name);
    cancelRenameFolder();
  } catch (error) {
    addErrorToast({
      title: t("Favorite.RenameFailed"),
      error,
      icon: "i-lucide-circle-alert"
    });
    void focusRenameInput();
  } finally {
    renaming.value = false;
  }
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
    const expanded = new Set(expandedFolderIds.value);
    expanded.delete(folder.id);
    expandedFolderIds.value = expanded;
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

const folderMenuItems = computed<DropdownMenuItem[]>(() => {
  const folder = folderMenuTarget.value;
  return [
    {
      label: folder ? t("Favorite.CreateSubfolder") : t("Favorite.CreateFolder"),
      icon: "i-lucide-folder-plus",
      onSelect: () => void createAndRenameFolder(folder?.id ?? null)
    },
    ...(folder
      ? [
          {
            label: t("ContextMenu.Rename"),
            icon: "i-lucide-pencil",
            onSelect: () => startRenameFolder(folder)
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
  <div class="app-tree w-max min-w-full py-1 leading-[18px] text-default" role="tree">
    <button
      type="button"
      class="app-tree-row sidebar-row flex w-max min-w-full cursor-pointer items-center gap-1 pr-1 text-left font-medium"
      :class="currentFolderId === null ? 'bg-[var(--app-selected-soft)] text-[var(--app-fg)]' : ''"
      :style="{ paddingLeft: '10px' }"
      role="treeitem"
      aria-expanded="true"
      @click.stop="emit('select', null)"
      @contextmenu.prevent.stop="openFolderMenu($event, null)"
      @pointerdown.stop
    >
      <span class="app-tree-icon-slot grid shrink-0 place-items-center">
        <UIcon
          v-if="folders.length > 0"
          name="i-lucide-chevron-right"
          class="app-tree-toggle-icon sidebar-icon-sm rotate-90"
        />
      </span>
      <AppTreeFolderIcon :open="true" class="app-tree-icon sidebar-icon tree-folder-icon shrink-0" />
      <span class="whitespace-nowrap">{{ t("Favorite.All") }}</span>
      <span class="ml-1 shrink-0">({{ rootAssetCount }})</span>
    </button>

    <div
      v-for="{ folder, depth } in visibleFolders"
      :key="folder.id"
      class="app-tree-row sidebar-row flex w-max min-w-full items-center gap-1 pr-1"
      :class="currentFolderId === folder.id ? 'bg-[var(--app-selected-soft)] text-[var(--app-fg)]' : ''"
      :style="{ paddingLeft: `${10 + depth * 14}px` }"
      role="treeitem"
      :aria-expanded="folder.children.length > 0 ? expandedFolderIds.has(folder.id) : undefined"
      @contextmenu.prevent.stop="openFolderMenu($event, folder)"
    >
      <button
        v-if="folder.children.length > 0"
        type="button"
        class="app-tree-icon-slot grid shrink-0 cursor-pointer place-items-center"
        :aria-label="folder.name"
        @click.stop.prevent="toggleFolder(folder)"
        @pointerdown.stop
      >
        <UIcon
          name="i-lucide-chevron-right"
          class="app-tree-toggle-icon sidebar-icon-sm transition-transform duration-150"
          :class="expandedFolderIds.has(folder.id) ? 'rotate-90' : ''"
        />
      </button>
      <span v-else class="app-tree-icon-slot shrink-0" />

      <button
        type="button"
        class="flex min-w-max flex-1 cursor-pointer items-center gap-1 text-left"
        :class="editingFolderId === folder.id ? 'hidden' : ''"
        @click.stop="emit('select', folder.id)"
        @pointerdown.stop
      >
        <AppTreeFolderIcon
          :open="expandedFolderIds.has(folder.id)"
          class="app-tree-icon sidebar-icon tree-folder-icon shrink-0"
        />
        <span class="inline-flex min-w-max flex-1 items-center font-medium">
          <span class="whitespace-nowrap">{{ folder.name }}</span>
          <span class="ml-1 shrink-0">({{ folder.assetCount || 0 }})</span>
        </span>
      </button>
      <div
        v-if="editingFolderId === folder.id"
        class="flex min-w-max flex-1 items-center gap-1"
        @click.stop
        @pointerdown.stop
      >
        <AppTreeFolderIcon
          :open="expandedFolderIds.has(folder.id)"
          class="app-tree-icon sidebar-icon tree-folder-icon shrink-0"
        />
        <UInput
          ref="renameInputRef"
          v-model="editingValue"
          size="xs"
          class="w-36"
          :maxlength="FAVORITE_FOLDER_NAME_MAX_LENGTH"
          :ui="{ base: 'h-5 py-0 px-1 text-xs' }"
          @click.stop
          @pointerdown.stop
          @keydown.enter.prevent="finishRenameFolder(folder)"
          @keydown.esc.prevent="cancelRenameFolder"
          @blur="finishRenameFolder(folder)"
        />
      </div>
    </div>

    <UDropdownMenu
      :open="folderMenuVisible"
      :items="folderMenuItems"
      size="sm"
      :content="{ align: 'start', side: 'bottom' }"
      @update:open="folderMenuVisible = $event"
    >
      <span
        class="fixed pointer-events-none"
        :style="{
          left: `${folderMenuPosition.x}px`,
          top: `${folderMenuPosition.y}px`,
          width: '1px',
          height: '1px'
        }"
      />
    </UDropdownMenu>
  </div>

  <ModalAlertDialog
    :open="deleteModalOpen"
    :title="t('Favorite.DeleteFolder')"
    :description="t('Favorite.DeleteFolderConfirm', { name: deleteTarget?.name || '' })"
    confirm-color="error"
    :loading="deleting"
    @confirm="submitDeleteFolder"
    @update:open="updateDeleteModal"
  />
</template>
