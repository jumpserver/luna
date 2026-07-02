<script setup lang="ts">
import type { AssetItem } from "~/types";

const props = defineProps<{
  mainPanelOpen: boolean
}>();

const emit = defineEmits<{
  select: [asset: AssetItem]
  contextmenu: [asset: AssetItem, event: MouseEvent]
}>();

type PanelKind = "favorites" | "recent" | "snippets";

const { t } = useI18n();
const openPanels = ref<Set<PanelKind>>(new Set());
const { assets: favoriteAssets, loading: favoriteLoading, load: loadFavorites } = useFavoriteAssets();

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
};
</script>

<template>
  <div class="contents">
    <SideBarCollapsiblePanel
      :open="isOpen('favorites')"
      :title="t('Menu.Favorite')"
      v-bind="panelConfig.favorites"
      :max-height="panelMaxHeight('favorites')"
      @toggle="togglePanel('favorites')"
    >
      <div v-if="favoriteLoading && favoriteAssets.length === 0" class="grid h-20 place-items-center">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-gray-400" />
      </div>
      <UEmpty v-else-if="favoriteAssets.length === 0" icon="i-lucide-star" size="sm" variant="naked" :title="t('Common.NoData')" />
      <button
        v-for="asset in favoriteAssets"
        v-else
        :key="asset.id"
        type="button"
        class="flex h-7 w-full items-center gap-2 px-3 text-left text-xs text-gray-700 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/5"
        @dblclick="emit('select', asset)"
        @contextmenu="emit('contextmenu', asset, $event)"
      >
        <UIcon name="i-lucide-monitor" class="size-3.5 shrink-0 text-gray-400" />
        <span class="truncate">{{ asset.name }}</span>
      </button>
    </SideBarCollapsiblePanel>

    <SideBarCollapsiblePanel
      :open="isOpen('recent')"
      :title="t('Menu.RecentConnections')"
      v-bind="panelConfig.recent"
      :max-height="panelMaxHeight('recent')"
      @toggle="togglePanel('recent')"
    >
      <UEmpty icon="i-lucide-history" size="sm" variant="naked" :title="t('RecentConnections.Empty')" />
    </SideBarCollapsiblePanel>

    <SideBarCollapsiblePanel
      :open="isOpen('snippets')"
      :title="t('Menu.Snippets')"
      v-bind="panelConfig.snippets"
      :max-height="panelMaxHeight('snippets')"
      @toggle="togglePanel('snippets')"
    >
      <UEmpty icon="i-lucide-braces" size="sm" variant="naked" :title="t('Snippets.Empty')" />
    </SideBarCollapsiblePanel>
  </div>
</template>
