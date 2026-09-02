<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from "@nuxt/ui";
import type { ComponentPublicInstance } from "vue";
import type { SidebarSectionKey } from "~/types";

import { SIDEBAR_SECTION_KEYS } from "~/composables/useSidebarSections";
import { useUserInfoStore } from "~/store/modules/userInfo";

const { t } = useI18n();
const localePath = useLocalePath();
const { collapse, sidebarSections, setSidebarSections, modernIsland } = useSettingManager();
const { hoverPreviewOpen } = useSidebarLayout();
const visuallyCollapsed = computed(() => collapse.value && !hoverPreviewOpen.value);
const { activeWorkspaceMode } = useWorkspaceMode();
const showTools = computed(() => isDesktopRuntime());
const {
  handleAssetConnect,
  handleOpenMultipleAssets,
  handleFavoriteMultipleAssets,
  handleAssetContextMenu,
  assetContextMenuItems,
  contextMenuVisible,
  contextMenuPosition,
  renameModalOpen,
  renameAsset,
  renameValue,
  renameDisabled,
  submitAssetRename,
  updateRenameModal
} = useSidebarAssetActions();

const isLoading = ref(false);
const sidebarSearch = ref("");
const showAssetSearch = ref(false);
const assetSearchInputRef = ref<ComponentPublicInstance | null>(null);
const assetTreeOpen = ref(true);
const islandAccordionValue = ref<string[]>(["assets"]);
const sidebarSectionLabels = computed<Record<SidebarSectionKey, string>>(() => ({
  assets: t("Menu.AuthorizedTree"),
  favorites: t("Menu.Favorite"),
  snippets: t("Menu.Snippets")
}));
const sidebarSectionIcons: Record<SidebarSectionKey, string> = {
  assets: "i-lucide-folder-tree",
  favorites: "i-lucide-star",
  snippets: "i-lucide-scroll-text"
};
const userInfoStore = useUserInfoStore();
const { loggedIn, currentUser } = storeToRefs(userInfoStore);
const commandExecutionEnabled = computed(() => currentUser.value?.commandExecutionEnabled === true);

watch(showAssetSearch, (open) => {
  if (!open) sidebarSearch.value = "";
});

const contentBackgroundColor = "var(--app-sidebar-bg)";
const availableSidebarSectionKeys = computed(() =>
  SIDEBAR_SECTION_KEYS.filter((key) => key !== "snippets" || commandExecutionEnabled.value)
);
const effectiveSidebarSections = computed(() => {
  const sections = {
    assets: sidebarSections.value.assets,
    favorites: sidebarSections.value.favorites,
    snippets: sidebarSections.value.snippets && commandExecutionEnabled.value
  };

  if (!Object.values(sections).some(Boolean)) sections.assets = true;
  return sections;
});
const visibleSectionCount = computed(
  () => availableSidebarSectionKeys.value.filter((key) => effectiveSidebarSections.value[key]).length
);
const showAssetSection = computed(() => effectiveSidebarSections.value.assets);
const visibleShelfPanels = computed(() => ({
  favorites: effectiveSidebarSections.value.favorites,
  snippets: effectiveSidebarSections.value.snippets
}));
const hasVisibleShelfPanel = computed(() => Object.values(visibleShelfPanels.value).some(Boolean));
const islandAccordionItems = computed(() => {
  const items: Array<{ label: string; value: string; slot: string; class?: string }> = [];

  if (showAssetSection.value) {
    items.push({
      label: sidebarSectionLabels.value.assets,
      value: "assets",
      slot: "assets",
      class: "workspace-island-accordion__assets"
    });
  }
  if (visibleShelfPanels.value.snippets) {
    items.push({
      label: sidebarSectionLabels.value.snippets,
      value: "snippets",
      slot: "snippets"
    });
  }
  if (visibleShelfPanels.value.favorites) {
    items.push({
      label: sidebarSectionLabels.value.favorites,
      value: "favorites",
      slot: "favorites",
      class: "workspace-island-accordion__favorites"
    });
  }

  return items;
});
const islandAssetTreeRef = shallowRef<{
  loading: boolean;
  refresh: () => void | Promise<void>;
  switchTreeKind: () => void;
  activeTreeKind: "authorization" | "type";
  treeSwitchLabel: string;
  batchMenuItems: DropdownMenuItem[][];
} | null>(null);
const islandFavoritePanelRef = shallowRef<{
  favoriteLoading: boolean;
  openCreateFolder: (parentId?: string | null) => void;
  refreshFavorites: () => unknown;
} | null>(null);
const islandSnippetPanelRef = shallowRef<{
  snippetLoading: boolean;
  snippetCreateItems: DropdownMenuItem[];
  refreshSnippets: () => unknown;
} | null>(null);
const islandAccordionUi = {
  root: "workspace-island-accordion",
  item: "border-0 py-0 md:py-0 last:border-0",
  header: "shrink-0 p-0",
  trigger:
    "relative h-8 min-w-0 rounded-none px-2.5 py-0 text-sm font-medium text-[var(--app-text-secondary)] hover:bg-[var(--app-hover-soft)] hover:text-[var(--app-fg)]",
  leadingIcon: "sidebar-icon",
  label: "min-w-0 flex-1 truncate text-start",
  trailingIcon: "hidden",
  content: "min-h-0 p-0 overflow-hidden animate-none data-[state=open]:animate-none data-[state=closed]:animate-none",
  body: "flex min-h-0 flex-1 flex-col p-0"
};
const showOrganizationMenu = computed(() => loggedIn.value && activeWorkspaceMode.value === "assets");
const showSidebarSearchButton = computed(() => showOrganizationMenu.value && showAssetSection.value);

const shouldShowOrganizationSelector = computed(() => {
  if (!loggedIn.value) return false;

  return currentUser.value?.xpackLicenseValid !== false;
});

function updateSidebarSection(section: SidebarSectionKey, visible: boolean) {
  if (!visible && visibleSectionCount.value <= 1) {
    useToast().add({
      title: t("Sidebar.AtLeastOneSection"),
      color: "warning",
      icon: "i-lucide-circle-alert"
    });
    return;
  }

  setSidebarSections({
    [section]: visible
  });
}

const organizationMenuItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: t("Sidebar.ManageSections"),
      type: "label" as const
    },
    ...availableSidebarSectionKeys.value.map((key) => ({
      label: sidebarSectionLabels.value[key],
      icon: sidebarSectionIcons[key],
      type: "checkbox" as const,
      checked: effectiveSidebarSections.value[key],
      disabled: effectiveSidebarSections.value[key] && visibleSectionCount.value <= 1,
      onUpdateChecked: (checked: boolean) => {
        if (checked === sidebarSections.value[key]) return;
        updateSidebarSection(key, checked);
      }
    }))
  ]
]);

watch(showAssetSection, (visible) => {
  if (!visible) showAssetSearch.value = false;
});

const sideBarItems = computed<NavigationMenuItem[]>(() => {
  return [
    {
      label: t("Menu.Tool"),
      type: "label"
    },
    {
      label: t("Menu.Player"),
      icon: "lucide:clapperboard",
      to: localePath("videoplayer"),
      disabled: isLoading.value
    },
    {
      label: t("Menu.Transcode"),
      icon: "lucide:repeat-2",
      to: localePath({ path: "/transcode" }),
      disabled: isLoading.value
    }
  ];
});

const handleWorkspaceQuickSearch = async () => {
  showAssetSearch.value = true;
  await nextTick();
  const input = assetSearchInputRef.value?.$el?.querySelector("input") as HTMLInputElement | undefined;
  input?.focus();
};

useEventBus().on("workspaceQuickSearch", handleWorkspaceQuickSearch);
</script>

<template>
  <div
    class="flex h-full w-full shrink-0 overflow-hidden flex-col"
    :class="
      visuallyCollapsed || modernIsland
        ? 'border-r-0 shadow-none'
        : 'border-r border-[color:var(--sidebar-divider-light)] dark:border-[color:var(--sidebar-divider-dark)]'
    "
    :style="{
      backgroundColor: modernIsland ? 'transparent' : contentBackgroundColor
    }"
  >
    <div class="flex flex-col w-full">
      <div
        v-show="!visuallyCollapsed && activeWorkspaceMode === 'assets' && loggedIn"
        class="flex h-9 items-center gap-px border-b border-[color:var(--sidebar-divider-light)] px-2.5 dark:border-[color:var(--sidebar-divider-dark)]"
      >
        <div class="min-w-0 flex-1">
          <HeaderOrganizationSelector :selectable="shouldShowOrganizationSelector" />
        </div>

        <div class="flex shrink-0 items-center">
          <UTooltip v-if="showSidebarSearchButton" :text="t('Operation.Search')" :delay-duration="150">
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-search"
              :aria-label="t('Operation.Search')"
              class="sidebar-icon-button size-6 shrink-0 justify-center p-0"
              :class="showAssetSearch ? 'sidebar-icon-button-active' : ''"
              :ui="{ leadingIcon: 'm-0 sidebar-icon' }"
              @click="
                () => {
                  showAssetSearch = !showAssetSearch;
                }
              "
            />
          </UTooltip>

          <UDropdownMenu
            v-if="showOrganizationMenu"
            :items="organizationMenuItems"
            :content="{ align: 'start', side: 'right', sideOffset: 6 }"
            :ui="{ content: 'w-36 p-1' }"
          >
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-ellipsis"
              :aria-label="t('Sidebar.ManageSections')"
              class="sidebar-icon-button size-6 shrink-0 justify-center p-0"
              :ui="{ leadingIcon: 'm-0 sidebar-icon' }"
            />
          </UDropdownMenu>
        </div>
      </div>
    </div>

    <div
      v-if="showTools && activeWorkspaceMode === 'tools'"
      class="px-2.5 py-0 flex-1 overflow-auto menu"
      :style="{
        display: visuallyCollapsed ? 'inline-flex' : '',
        justifyContent: visuallyCollapsed ? 'center' : ''
      }"
    >
      <UNavigationMenu
        orientation="vertical"
        :items="sideBarItems"
        :collapsed="visuallyCollapsed"
        color="neutral"
        :ui="{
          link: 'sidebar-row px-2.5 my-1 rounded-lg menu-item flex items-center light:text-gray-800 dark:text-gray-200',
          linkLeadingIcon: 'sidebar-icon',
          label: 'light:text-gray-500 dark:text-gray-400 pb-0 text-[11px] font-medium uppercase tracking-[0.12em]'
        }"
      />
    </div>

    <div v-else-if="loggedIn" class="relative flex min-h-0 flex-1 flex-col">
      <div v-show="!showAssetSearch" class="flex min-h-0 flex-1 flex-col">
        <UAccordion
          v-if="modernIsland"
          v-model="islandAccordionValue"
          type="multiple"
          :items="islandAccordionItems"
          :unmount-on-hide="false"
          :ui="islandAccordionUi"
        >
          <template #leading="{ open }">
            <UIcon
              name="i-lucide-chevron-right"
              class="sidebar-icon transition-transform duration-150"
              :class="open ? 'rotate-90' : ''"
            />
          </template>
          <template #trailing="{ item }">
            <span
              v-if="item.value === 'favorites'"
              data-workspace-tour="favorites"
              class="pointer-events-none absolute inset-0"
            />
            <div class="relative z-10 ml-auto flex shrink-0 items-center gap-px" @click.stop @pointerdown.stop>
              <template v-if="item.value === 'assets'">
                <UTooltip :text="islandAssetTreeRef?.treeSwitchLabel || t('Tree.SwitchToType')" :delay-duration="150">
                  <UButton
                    as="span"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :icon="
                      islandAssetTreeRef?.activeTreeKind === 'authorization'
                        ? 'i-lucide-shapes'
                        : 'i-lucide-folder-tree'
                    "
                    class="sidebar-icon-button size-6 justify-center p-0"
                    :ui="{ leadingIcon: 'm-0 sidebar-icon' }"
                    :aria-label="islandAssetTreeRef?.treeSwitchLabel || t('Tree.SwitchToType')"
                    @click="islandAssetTreeRef?.switchTreeKind()"
                  />
                </UTooltip>
                <UButton
                  as="span"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-refresh-cw"
                  :loading="islandAssetTreeRef?.loading"
                  class="sidebar-icon-button size-6 justify-center p-0"
                  :ui="{ leadingIcon: 'm-0 sidebar-icon' }"
                  :aria-label="t('ToolTips.Refresh')"
                  @click="islandAssetTreeRef?.refresh()"
                />
                <UDropdownMenu
                  :items="islandAssetTreeRef?.batchMenuItems || []"
                  :content="{ align: 'end', side: 'bottom', sideOffset: 6 }"
                  :ui="{ content: 'w-36 p-1' }"
                >
                  <UButton
                    as="span"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    icon="i-lucide-ellipsis"
                    class="sidebar-icon-button size-6 justify-center p-0"
                    :ui="{ leadingIcon: 'm-0 sidebar-icon' }"
                    :aria-label="t('Tree.BatchActions')"
                  />
                </UDropdownMenu>
              </template>
              <template v-else-if="item.value === 'favorites'">
                <UButton
                  as="span"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-folder-plus"
                  class="sidebar-icon-button size-6 justify-center p-0"
                  :ui="{ leadingIcon: 'm-0 sidebar-icon' }"
                  :aria-label="t('Favorite.CreateFolder')"
                  @click="islandFavoritePanelRef?.openCreateFolder()"
                />
                <UButton
                  as="span"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-refresh-cw"
                  :loading="islandFavoritePanelRef?.favoriteLoading"
                  class="sidebar-icon-button size-6 justify-center p-0"
                  :ui="{ leadingIcon: 'm-0 sidebar-icon' }"
                  :aria-label="t('ToolTips.Refresh')"
                  @click="islandFavoritePanelRef?.refreshFavorites()"
                />
              </template>
              <template v-else-if="item.value === 'snippets'">
                <UDropdownMenu
                  :items="islandSnippetPanelRef?.snippetCreateItems || []"
                  :content="{ align: 'end', side: 'bottom', sideOffset: 6 }"
                >
                  <UButton
                    as="span"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    icon="i-lucide-plus"
                    class="sidebar-icon-button size-6 justify-center p-0"
                    :ui="{ leadingIcon: 'm-0 sidebar-icon' }"
                    :aria-label="t('Snippets.Create')"
                  />
                </UDropdownMenu>
                <UButton
                  as="span"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-refresh-cw"
                  :loading="islandSnippetPanelRef?.snippetLoading"
                  class="sidebar-icon-button size-6 justify-center p-0"
                  :ui="{ leadingIcon: 'm-0 sidebar-icon' }"
                  :aria-label="t('ToolTips.Refresh')"
                  @click="islandSnippetPanelRef?.refreshSnippets()"
                />
              </template>
            </div>
          </template>
          <template #assets>
            <SideBarAssetTree
              v-if="showAssetSection"
              ref="islandAssetTreeRef"
              search=""
              hide-header
              :open="true"
              @select="handleAssetConnect"
              @contextmenu="handleAssetContextMenu"
              @open-multiple="handleOpenMultipleAssets"
              @favorite-multiple="handleFavoriteMultipleAssets"
            />
          </template>
          <template #favorites>
            <SideBarBottomPanels
              ref="islandFavoritePanelRef"
              hide-chrome
              :main-panel-open="true"
              :visible-panels="{ favorites: true, snippets: false }"
              @select="handleAssetConnect"
              @contextmenu="handleAssetContextMenu"
            />
          </template>
          <template #snippets>
            <SideBarBottomPanels
              ref="islandSnippetPanelRef"
              hide-chrome
              :main-panel-open="true"
              :visible-panels="{ favorites: false, snippets: true }"
              @select="handleAssetConnect"
              @contextmenu="handleAssetContextMenu"
            />
          </template>
        </UAccordion>
        <template v-else>
          <SideBarAssetTree
            v-if="showAssetSection"
            search=""
            :open="assetTreeOpen"
            @select="handleAssetConnect"
            @contextmenu="handleAssetContextMenu"
            @toggle="assetTreeOpen = !assetTreeOpen"
            @open-multiple="handleOpenMultipleAssets"
            @favorite-multiple="handleFavoriteMultipleAssets"
          />
          <SideBarBottomPanels
            v-if="hasVisibleShelfPanel"
            :main-panel-open="assetTreeOpen"
            :visible-panels="visibleShelfPanels"
            @select="handleAssetConnect"
            @contextmenu="handleAssetContextMenu"
          />
        </template>
      </div>

      <div
        v-show="showAssetSearch"
        class="absolute inset-0 z-10 flex min-h-0 flex-col"
        :style="{ backgroundColor: contentBackgroundColor }"
      >
        <div :style="{ borderBottom: '1px solid var(--app-border)' }" class="px-2.5 py-1.5">
          <UInput
            ref="assetSearchInputRef"
            v-model="sidebarSearch"
            size="sm"
            autofocus
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
            <template v-if="sidebarSearch?.length" #trailing>
              <UButton
                color="neutral"
                variant="link"
                size="xs"
                icon="i-lucide-circle-x"
                aria-label="Clear input"
                :ui="{ leadingIcon: 'm-0 sidebar-icon' }"
                @click="
                  () => {
                    sidebarSearch = '';
                  }
                "
              />
            </template>
          </UInput>
        </div>

        <div v-if="sidebarSearch.trim()" class="min-h-0 flex-1">
          <SideBarAssetTree
            :search="sidebarSearch"
            :open="true"
            @select="
              (asset) => {
                showAssetSearch = false;
                handleAssetConnect(asset);
              }
            "
            @contextmenu="handleAssetContextMenu"
            @open-multiple="handleOpenMultipleAssets"
            @favorite-multiple="handleFavoriteMultipleAssets"
          />
        </div>

        <div v-else class="grid min-h-0 flex-1 place-items-center px-4 text-[12px] text-[var(--app-muted)]">
          输入名称、地址或关键字搜索资产
        </div>
      </div>
    </div>

    <div v-else class="min-h-0 flex-1" />

    <Modal
      :open="renameModalOpen"
      :title="t('ContextMenu.Rename')"
      :description="renameAsset?.name || ''"
      :disabled="renameDisabled"
      @confirm="submitAssetRename"
      @update:open="updateRenameModal"
    >
      <UInput v-model="renameValue" autofocus class="w-full" :placeholder="t('AssetCard.AssetName')" />
    </Modal>

    <UDropdownMenu
      :open="contextMenuVisible"
      :items="assetContextMenuItems"
      size="sm"
      :content="{ align: 'start', side: 'bottom' }"
      @update:open="contextMenuVisible = $event"
    >
      <div
        class="fixed pointer-events-none"
        :style="{
          left: `${contextMenuPosition.x}px`,
          top: `${contextMenuPosition.y}px`,
          width: '1px',
          height: '1px'
        }"
      />
    </UDropdownMenu>
  </div>
</template>

<style>
/* sidebar styles live in assets/css/sidebar.css */
</style>
