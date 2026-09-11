<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from "@nuxt/ui";
import type { ComponentPublicInstance } from "vue";
import type { SidebarSectionKey } from "~/types";

import { SIDEBAR_SECTION_KEYS } from "~/composables/useSidebarSections";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { ITEM_NAME_MAX_LENGTH } from "~/utils/itemName";

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
  addContextMenuAssetToFavoriteFolder,
  assetContextMenuItems,
  contextMenuVisible,
  contextMenuPosition,
  renameModalOpen,
  renameAsset,
  renameValue,
  renameDisabled,
  renameNameTooLong,
  renameNameDuplicate,
  submitAssetRename,
  updateRenameModal
} = useSidebarAssetActions();

const isLoading = ref(false);
const sidebarSearch = ref("");
const showAssetSearch = ref(false);
const assetSearchInputRef = ref<ComponentPublicInstance | null>(null);
const assetTreeOpen = ref(true);
const workspaceUiAutomationHost = useWorkspaceUiAutomationHost();
const {
  currentCommand: workspaceUiCommand,
  reportSearchQuery: reportWorkspaceSearchQuery,
  resetForContext: resetWorkspaceUiContext,
  searchQuery: workspaceSearchQuery
} = workspaceUiAutomationHost;
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
const { currentAccountId, currentSite, currentUser, loggedIn, orgId } = storeToRefs(userInfoStore);
const commandExecutionEnabled = computed(() => currentUser.value?.commandExecutionEnabled === true);

watch(showAssetSearch, (open) => {
  if (!open) sidebarSearch.value = "";
});

watch(sidebarSearch, (query) => reportWorkspaceSearchQuery(query));

watch(
  [workspaceSearchQuery, workspaceUiCommand],
  async ([query, command]) => {
    if (command?.status !== "pending" || (command.type !== "set-search" && command.type !== "focus-asset")) {
      return;
    }

    assetTreeOpen.value = true;
    showAssetSearch.value = Boolean(query);
    if (sidebarSearch.value !== query) sidebarSearch.value = query;
    await nextTick();

    // Empty search has no tree request to acknowledge it, so the sidebar is
    // the final semantic executor for this command.
    if (command.type === "set-search" && !query) reportWorkspaceSearchQuery("");
  },
  { immediate: true }
);

watch(
  [loggedIn, orgId, currentSite, currentAccountId],
  ([isLoggedIn, currentOrgId, site, accountId], [wasLoggedIn, previousOrgId, previousSite, previousAccountId]) => {
    if (
      isLoggedIn === wasLoggedIn &&
      currentOrgId === previousOrgId &&
      site === previousSite &&
      accountId === previousAccountId
    ) {
      return;
    }
    sidebarSearch.value = "";
    showAssetSearch.value = false;
    resetWorkspaceUiContext({ clearSearch: true });
  }
);

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

const focusAssetSearchInput = async () => {
  await nextTick();
  const input = assetSearchInputRef.value?.$el?.querySelector("input") as HTMLInputElement | undefined;
  input?.focus();
};

const toggleAssetSearch = async () => {
  showAssetSearch.value = !showAssetSearch.value;
  if (showAssetSearch.value) await focusAssetSearchInput();
};

const handleWorkspaceQuickSearch = async () => {
  showAssetSearch.value = true;
  await focusAssetSearchInput();
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
              @click="toggleAssetSearch"
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
          link: 'sidebar-row px-2.5 my-1 menu-item flex items-center light:text-gray-800 dark:text-gray-200',
          linkLeadingIcon: 'sidebar-icon',
          label: 'light:text-gray-500 dark:text-gray-400 pb-0 text-[11px] font-medium uppercase tracking-[0.12em]'
        }"
      />
    </div>

    <div v-else-if="loggedIn" class="relative flex min-h-0 flex-1 flex-col">
      <div v-show="!showAssetSearch" class="flex min-h-0 flex-1 flex-col">
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
      <UFormField
        :error="
          renameNameTooLong
            ? t('AssetCard.NameTooLong', { max: ITEM_NAME_MAX_LENGTH })
            : renameNameDuplicate
              ? t('AssetCard.DuplicateName')
              : undefined
        "
      >
        <UInput
          v-model="renameValue"
          autofocus
          class="w-full"
          :maxlength="ITEM_NAME_MAX_LENGTH"
          :placeholder="t('AssetCard.AssetName')"
        />
      </UFormField>
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
      <template #item-label="{ item }">
        <SideBarFavoriteFolderMenuTree
          v-if="item.favoriteFolderTree"
          :folders="item.favoriteFolders"
          :root-asset-count="item.favoriteRootAssetCount"
          :current-folder-id="item.currentFavoriteFolderId"
          @select="addContextMenuAssetToFavoriteFolder"
        />
        <template v-else>{{ item.label }}</template>
      </template>
    </UDropdownMenu>
  </div>
</template>

<style>
/* sidebar styles live in assets/css/sidebar.css */
.favorite-folder-submenu [data-slot="viewport"] {
  overflow-x: auto;
}

.favorite-folder-submenu [data-slot="viewport"]::-webkit-scrollbar {
  height: 0;
}
</style>
