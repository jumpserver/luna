<script setup lang="ts">
import type { AssetItem } from "~/types";

const props = defineProps<{
  mainPanelOpen: boolean
  visiblePanels: {
    favorites: boolean
    recent: boolean
    snippets: boolean
  }
}>();

const emit = defineEmits<{
  select: [asset: AssetItem]
  contextmenu: [asset: AssetItem, event: MouseEvent]
}>();

type PanelKind = "favorites" | "recent" | "snippets";

const { t } = useI18n();
const openPanels = ref<Set<PanelKind>>(new Set());
const { folders: favoriteFolders, loading: favoriteLoading, load: loadFavorites, createFolder } = useFavoriteFolders();
const { snippets, loading: snippetLoading, load: loadSnippets, applySnippet } = useSnippets();
const createModalOpen = ref(false);
const createParentId = ref<string | null>(null);
const folderName = ref("");
const creating = ref(false);

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
    useToast().add({
      title: t("Favorite.CreateFailed"),
      description: error instanceof Error ? error.message : String(error),
      color: "error",
      icon: "i-lucide-circle-alert"
    });
  } finally {
    creating.value = false;
  }
};

const panelConfig = {
  favorites: { exclusiveGroup: "asset-shelves", preferredHeight: 280, minHeight: 128, maxHeight: "50%" },
  recent: { exclusiveGroup: "asset-shelves", preferredHeight: 220, minHeight: 112, maxHeight: "50%" },
  snippets: { exclusiveGroup: "asset-shelves", preferredHeight: 180, minHeight: 96, maxHeight: "30%" }
} as const;

const panelMaxHeight = (kind: PanelKind) => props.mainPanelOpen
  ? panelConfig[kind].maxHeight
  : "100%";

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
          class="size-6 justify-center rounded-sm p-0"
          :ui="{ leadingIcon: 'm-0 sidebar-icon' }"
          :aria-label="t('Favorite.CreateFolder')"
          @click.stop="openCreateFolder()"
        />
      </template>
      <div v-if="favoriteLoading && favoriteFolders.length === 0" class="grid h-20 place-items-center">
        <UIcon name="i-lucide-loader-circle" class="sidebar-icon animate-spin" />
      </div>
      <UEmpty v-else-if="favoriteFolders.length === 0" icon="i-lucide-star" size="sm" variant="naked" :title="t('Common.NoData')" />
      <SideBarFavoriteTreeNode
        v-for="folder in favoriteFolders"
        v-else
        :key="folder.id"
        :folder="folder"
        @select="emit('select', $event)"
        @contextmenu="(asset, event) => emit('contextmenu', asset, event)"
        @create="openCreateFolder"
      />
    </SideBarCollapsiblePanel>

    <SideBarCollapsiblePanel
      v-if="visiblePanels.recent"
      :open="isOpen('recent')"
      :title="t('Menu.RecentConnections')"
      v-bind="panelConfig.recent"
      :max-height="panelMaxHeight('recent')"
      @toggle="togglePanel('recent')"
    >
      <UEmpty icon="i-lucide-history" size="sm" variant="naked" :title="t('RecentConnections.Empty')" />
    </SideBarCollapsiblePanel>

    <SideBarCollapsiblePanel
      v-if="visiblePanels.snippets"
      :open="isOpen('snippets')"
      :title="t('Menu.Snippets')"
      v-bind="panelConfig.snippets"
      :max-height="panelMaxHeight('snippets')"
      @toggle="togglePanel('snippets')"
    >
      <div v-if="snippetLoading && snippets.length === 0" class="grid h-20 place-items-center">
        <UIcon name="i-lucide-loader-circle" class="sidebar-icon animate-spin" />
      </div>
      <UEmpty v-else-if="snippets.length === 0" icon="i-lucide-braces" size="sm" variant="naked" :title="t('Snippets.Empty')" />
      <button
        v-for="snippet in snippets"
        v-else
        :key="snippet.id"
        type="button"
        class="flex w-full items-start gap-1.5 px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10"
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
    <UInput v-model="folderName" autofocus class="w-full" :placeholder="t('Favorite.FolderName')" @keydown.enter="submitCreateFolder" />
  </Modal>
</template>
