<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from "@nuxt/ui";
import type { AssetItem, SidebarSectionKey } from "~/types";

import { useConnectMethods, WEB_PROXY_NATIVE_VALUE } from "~/composables/useConnectMethods";
import { SIDEBAR_SECTION_KEYS } from "~/composables/useSidebarSections";
import { useUserInfoStore } from "~/store/modules/userInfo";

const { t } = useI18n();
const toast = useToast();
const isNarrowScreen = useMediaQuery("(max-width: 767px)");
const { addErrorToast } = useErrorToast();
const localePath = useLocalePath();
const { collapse, sidebarSections, setCollapse, setSidebarSections } = useSettingManager();
const { hoverPreviewOpen, closeHoverPreview } = useSidebarLayout();
const visuallyCollapsed = computed(() => collapse.value && !hoverPreviewOpen.value);
const { activeWorkspaceMode } = useWorkspaceMode();
const showTools = computed(() => isDesktopRuntime());
const { confirmConnection } = useAssetConnection();
const { getMethodsForProtocol } = useConnectMethods();
const { configure, launchWithInfo } = useConnectionLauncher();
const { activeTab, canSplitWorkspace, openSession, openSetupSession, splitWorkspace } = useWorkspaceTabs();
const { openAssetInWindow } = useAssetWindowLauncher();
const { handleAssetFavorite, handleAssetRename, handleAssetUnfavorite } = useAssetAction();
const { folders: favoriteFolders, load: loadFavoriteFolders, favoriteToFolder } = useFavoriteFolders();

const isLoading = ref(false);
const sidebarSearch = ref("");
const showAssetSearch = ref(false);
const assetTreeOpen = ref(true);
const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const contextMenuAsset = ref<AssetItem | null>(null);
const renameModalOpen = ref(false);
const renameAsset = ref<AssetItem | null>(null);
const renameValue = ref("");
const renameDisabled = computed(() => {
  const name = renameValue.value.trim();
  return !name || name === renameAsset.value?.name;
});
const sidebarSectionLabels = computed<Record<SidebarSectionKey, string>>(() => ({
  assets: t("Menu.AuthorizedTree"),
  favorites: t("Menu.Favorite"),
  snippets: t("Menu.Snippets")
}));
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
  availableSidebarSectionKeys.value.map((key) => ({
    label: sidebarSectionLabels.value[key],
    type: "checkbox" as const,
    checked: effectiveSidebarSections.value[key],
    disabled: effectiveSidebarSections.value[key] && visibleSectionCount.value <= 1,
    onUpdateChecked: (checked: boolean) => {
      if (checked === sidebarSections.value[key]) return;
      updateSidebarSection(key, checked);
    }
  }))
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

const hasSshProtocol = (asset: AssetItem) => {
  return (asset.permedProtocols || []).some((protocol) => protocol.name === "ssh");
};

const hasReusableSavedConnection = (asset: AssetItem) => {
  const saved = asset.savedConnection;
  if (!saved?.protocol || !saved.username) return false;

  const mode = saved.accountMode || "hosted";
  if (mode === "manual") {
    return !!(saved.rememberSecret && saved.manualUsername && saved.manualPassword);
  }
  if (mode === "dynamic") {
    return !!(saved.rememberSecret && saved.dynamicPassword);
  }

  return true;
};

const hasQuickConnect = (asset: AssetItem) => {
  return hasReusableSavedConnection(asset);
};

const loadAssetConnectionDetails = async (asset: AssetItem) => {
  const detail = await getAssetDetailRequest(asset.id, currentUser.value?.org?.id || "");

  return {
    ...asset,
    permedAccounts: detail.permed_accounts ?? asset.permedAccounts ?? [],
    permedProtocols: (detail.permed_protocols ?? asset.permedProtocols ?? []).filter(
      (protocol: { name?: string }) => protocol?.name !== "winrm"
    )
  };
};

const savedConnectionIsAvailable = (asset: AssetItem) => {
  const saved = asset.savedConnection;
  if (!saved || !(asset.permedProtocols || []).some((protocol) => protocol.name === saved.protocol)) {
    return false;
  }

  const accounts = asset.permedAccounts || [];
  const mode = saved.accountMode || "hosted";

  if (mode === "manual") return accounts.some((account) => account.alias === "@INPUT");
  if (mode === "dynamic") return accounts.some((account) => account.alias === "@USER");
  if (mode === "anonymous") return accounts.some((account) => account.alias === "@ANON");

  return accounts.some(
    (account) =>
      !(account.alias || "").startsWith("@") &&
      ((saved.accountId && account.id === saved.accountId) ||
        account.name === saved.username ||
        account.username === saved.username ||
        account.alias === saved.username)
  );
};

const connectWithSavedConnection = async (asset: AssetItem) => {
  const remembered = userInfoStore.getConnectionInfoForAsset(asset.id) || asset.savedConnection;
  const rememberedAsset = { ...asset, savedConnection: remembered || undefined };

  if (!remembered || !hasReusableSavedConnection(rememberedAsset)) {
    openSetupSession(rememberedAsset);
    return;
  }

  let connectAsset: AssetItem;
  try {
    connectAsset = await loadAssetConnectionDetails(rememberedAsset);
  } catch (error) {
    addErrorToast({
      title: t("ConnectError.ConnectFailed"),
      description: String(error),
      icon: "line-md:close-circle",
      progress: true,
      duration: 4000
    });
    return;
  }

  if (!savedConnectionIsAvailable(connectAsset)) {
    openSetupSession(connectAsset);
    return;
  }

  const saved = connectAsset.savedConnection!;
  const session = openSession(connectAsset, {
    protocol: saved.protocol,
    account: saved.username,
    connectMethod: saved.connectMethod
  });

  await confirmConnection(connectAsset, {
    protocol: saved.protocol,
    account: saved.username,
    accountId: saved.accountId,
    accountMode: (saved.accountMode as any) || "hosted",
    manualUsername: saved.manualUsername || "",
    manualPassword: saved.manualPassword || "",
    dynamicPassword: saved.dynamicPassword || "",
    rememberSecret: !!saved.rememberSecret,
    rememberSelection: true,
    connectMethod: saved.connectMethod || "",
    connectOptions: saved.connectOptions || {},
    availableProtocols: saved.availableProtocols || [],
    tabId: session.id
  });
};

const isWebsiteAsset = (asset: AssetItem) => {
  const classification = [asset.category, asset.type].map((value) => String(value || "").toLowerCase());
  return (
    classification.some((value) => ["web", "website"].includes(value)) ||
    (asset.permedProtocols || []).some((protocol) => ["http", "https"].includes(protocol.name?.toLowerCase()))
  );
};

const resolveDirectWebsiteAccount = (asset: AssetItem) => {
  const accounts = asset.permedAccounts || [];
  const preferred = userInfoStore.getConnectionPreferenceForAsset(asset.id);
  const hostedAccounts = accounts.filter((account) => !account.alias?.startsWith("@"));

  if (preferred?.accountMode === "hosted") {
    const matched = hostedAccounts.find(
      (account) =>
        (preferred.accountId && account.id === preferred.accountId) ||
        account.name === preferred.username ||
        account.username === preferred.username ||
        account.alias === preferred.username
    );
    if (matched) return { account: matched.name, accountId: matched.id, accountMode: "hosted" as const };
  }
  if (hostedAccounts.length === 1) {
    const account = hostedAccounts[0]!;
    return { account: account.name, accountId: account.id, accountMode: "hosted" as const };
  }
  if (hostedAccounts.length === 0 && accounts.some((account) => account.alias === "@ANON")) {
    return { account: "@ANON", accountId: undefined, accountMode: "anonymous" as const };
  }
  return null;
};

const connectWebsiteDirectly = async (asset: AssetItem) => {
  if (!isDesktopRuntime() || !isWebsiteAsset(asset)) return false;

  try {
    const connectAsset = await loadAssetConnectionDetails(asset);
    const protocols: string[] = [];
    for (const item of connectAsset.permedProtocols || []) {
      const protocol = String(item.name || "")
        .trim()
        .toLowerCase();
      if (["http", "https"].includes(protocol) && !protocols.includes(protocol)) protocols.push(protocol);
    }
    if (protocols.length !== 1) return false;

    const protocol = protocols[0]!;
    const methods = await getMethodsForProtocol(protocol);
    if (!methods.some((method) => method.value === WEB_PROXY_NATIVE_VALUE)) return false;

    const selectedAccount = resolveDirectWebsiteAccount(connectAsset);
    if (!selectedAccount) return false;

    const session = openSession(connectAsset, {
      protocol,
      account: selectedAccount.account,
      connectMethod: WEB_PROXY_NATIVE_VALUE
    });
    await confirmConnection(connectAsset, {
      protocol,
      account: selectedAccount.account,
      accountId: selectedAccount.accountId,
      accountMode: selectedAccount.accountMode,
      manualUsername: "",
      manualPassword: "",
      dynamicPassword: "",
      rememberSecret: false,
      rememberSelection: false,
      connectMethod: WEB_PROXY_NATIVE_VALUE,
      connectOptions: {},
      availableProtocols: protocols,
      tabId: session.id
    });
    return true;
  } catch (error) {
    addErrorToast({
      title: t("ConnectError.ConnectFailed"),
      description: String(error),
      icon: "i-lucide-circle-alert",
      duration: 4000
    });
    return true;
  }
};

const handleOpenMultipleAssets = async (assets: AssetItem[]) => {
  const selected = assets.map((asset) => ({
    ...asset,
    savedConnection: userInfoStore.getConnectionInfoForAsset(asset.id) || asset.savedConnection
  }));
  const details = await Promise.allSettled(selected.map((asset) => loadAssetConnectionDetails(asset)));
  const sshAssets = details.flatMap((result) => {
    if (result.status !== "fulfilled") return [];

    const asset = result.value;
    return hasSshProtocol(asset) ? [asset] : [];
  });

  if (sshAssets.length === 0) {
    const failed = details.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") {
      addErrorToast({
        title: t("ConnectError.ConnectFailed"),
        description: String(failed.reason),
        icon: "i-lucide-circle-alert",
        duration: 4000
      });
      return;
    }

    toast.add({
      title: t("Tree.MultiOpenNoConnectable"),
      color: "warning",
      icon: "i-lucide-circle-alert",
      duration: 3000
    });
    return;
  }

  const configured = [];
  for (const [index, asset] of sshAssets.entries()) {
    const info = await configure(asset, {
      protocol: "ssh",
      position: index + 1,
      total: sshAssets.length
    });
    if (!info) return;
    configured.push({ asset, info });
  }

  const aclBatchId =
    configured.length > 1 ? globalThis.crypto?.randomUUID?.() || `batch-${Date.now()}-${Math.random()}` : undefined;
  void Promise.all(configured.map(({ asset, info }) => launchWithInfo(asset, info, { aclBatchId })));

  const skipped = assets.length - sshAssets.length;
  if (skipped > 0) {
    toast.add({
      title: t("Tree.MultiOpenSkipped", { count: skipped }),
      color: "warning",
      icon: "i-lucide-circle-alert",
      duration: 3500
    });
  }
};

const handleFavoriteMultipleAssets = async (assets: AssetItem[]) => {
  const results = await Promise.allSettled(assets.map((asset) => favoriteAsset(asset.id)));
  const successCount = results.filter((result) => result.status === "fulfilled").length;
  const failedCount = results.length - successCount;

  if (successCount > 0) {
    const firstSuccessIndex = results.findIndex((result) => result.status === "fulfilled");
    useEventBus().emit("favoriteChanged", { assetId: assets[firstSuccessIndex]!.id, favorite: true });
  }

  if (failedCount === 0) {
    toast.add({
      title: t("Tree.MultiFavoriteSuccess", { count: successCount }),
      color: "success",
      icon: "i-lucide-star",
      duration: 2500
    });
    return;
  }

  if (successCount > 0) {
    toast.add({
      title: t("Tree.MultiFavoritePartial", { success: successCount, failed: failedCount }),
      color: "warning",
      icon: "i-lucide-circle-alert",
      duration: 4000
    });
    return;
  }

  const firstFailure = results.find((result) => result.status === "rejected");
  addErrorToast({
    title: t("Tree.MultiFavoriteFailed"),
    description: firstFailure?.status === "rejected" ? String(firstFailure.reason) : undefined,
    icon: "i-lucide-circle-alert",
    duration: 4000
  });
};

const handleAssetConnect = async (asset: AssetItem) => {
  closeHoverPreview();
  if (isNarrowScreen.value) setCollapse(true);
  if (!hasReusableSavedConnection(asset) && (await connectWebsiteDirectly(asset))) return;
  await connectWithSavedConnection(asset);
};

const openAssetInCurrentWorkspace = (asset: AssetItem) => {
  contextMenuVisible.value = false;

  const currentTab = activeTab.value;
  if (!currentTab) {
    openSetupSession(asset);
    return;
  }

  const direction = canSplitWorkspace(currentTab.id, "vertical")
    ? "vertical"
    : canSplitWorkspace(currentTab.id, "horizontal")
      ? "horizontal"
      : null;

  if (!direction) {
    toast.add({
      title: t("WorkspacePane.SplitLimitTitle"),
      description: t("WorkspacePane.SplitLimitDescription"),
      color: "warning",
      icon: "i-lucide-circle-alert"
    });
    return;
  }

  const [pane] = splitWorkspace(currentTab.id, direction);
  if (!pane) return;

  openSetupSession(asset, { paneId: pane.id });
};

const handleAssetQuickConnect = (asset: AssetItem) => {
  closeHoverPreview();
  connectWithSavedConnection(asset);
};

const handleAssetConnectWithSelection = (asset: AssetItem) => {
  closeHoverPreview();
  openSetupSession(asset);
};

useEventBus().on("workspaceConnectAsset", handleAssetConnectWithSelection);

const handleAssetOpenInNewWindow = async (asset: AssetItem) => {
  contextMenuVisible.value = false;
  await openAssetInWindow(asset);
};

const openRenameModal = (asset: AssetItem) => {
  contextMenuVisible.value = false;
  renameAsset.value = asset;
  renameValue.value = asset.name || "";
  renameModalOpen.value = true;
};

const submitAssetRename = () => {
  const asset = renameAsset.value;
  const name = renameValue.value.trim();
  if (!asset || !name || name === asset.name) return;

  handleAssetRename(asset.id, name);
  renameModalOpen.value = false;
  renameAsset.value = null;
};

const updateRenameModal = (open: boolean) => {
  renameModalOpen.value = open;
  if (!open) renameAsset.value = null;
};

const toggleAssetFavorite = (asset: AssetItem, favorite: boolean) => {
  if (favorite) {
    handleAssetFavorite(asset.id);
  } else {
    handleAssetUnfavorite(asset.id);
  }

  useEventBus().emit("favoriteChanged", { assetId: asset.id, favorite });
};

const flattenFavoriteFolders = (folders = favoriteFolders.value): Array<{ id: string; name: string }> =>
  folders.flatMap((folder) => [{ id: folder.id, name: folder.name }, ...flattenFavoriteFolders(folder.children)]);

const addAssetToFavoriteFolder = async (asset: AssetItem, folderId: string) => {
  contextMenuVisible.value = false;
  try {
    await favoriteToFolder(asset.id, folderId);
    toast.add({ title: t("Favorite.AddSuccess"), color: "success", icon: "i-lucide-star" });
  } catch (error) {
    addErrorToast({
      title: t("Favorite.AddFailed"),
      error,
      icon: "i-lucide-circle-alert"
    });
  }
};

const handleAssetContextMenu = (asset: AssetItem, event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();

  contextMenuAsset.value = asset;
  contextMenuPosition.value = { x: event.clientX, y: event.clientY };
  contextMenuVisible.value = true;
};

const assetContextMenuItems = computed<DropdownMenuItem[]>(() => {
  const asset = contextMenuAsset.value;
  if (!asset) return [];

  const isFavorited = !!asset.isFavorite;
  const folderItems: DropdownMenuItem[] = flattenFavoriteFolders().map((folder) => ({
    label: folder.name,
    icon: "i-lucide-folder",
    onSelect: () => addAssetToFavoriteFolder(asset, folder.id)
  }));

  return [
    ...(hasQuickConnect(asset)
      ? [
          {
            label: t("ContextMenu.QuickConnect"),
            icon: "i-lucide-zap",
            onSelect: () => {
              contextMenuVisible.value = false;
              handleAssetQuickConnect(asset);
            }
          } satisfies DropdownMenuItem
        ]
      : []),
    {
      label: t("ContextMenu.Connect"),
      icon: "i-lucide-plug",
      onSelect: () => {
        contextMenuVisible.value = false;
        handleAssetConnectWithSelection(asset);
      }
    },
    {
      label: t("ContextMenu.OpenInCurrentTab"),
      icon: "i-lucide-panels-top-left",
      onSelect: () => {
        openAssetInCurrentWorkspace(asset);
      }
    },
    {
      label: t("ContextMenu.OpenInNewWindow"),
      icon: "i-lucide-square-arrow-out-up-right",
      onSelect: () => handleAssetOpenInNewWindow(asset)
    },
    {
      label: t("ContextMenu.Rename"),
      icon: "i-lucide-pencil",
      onSelect: () => openRenameModal(asset)
    },
    {
      label: t("Favorite.AddToFolder"),
      icon: "lucide:star",
      children: folderItems.length > 0 ? folderItems : [{ label: t("Favorite.CreateFolderFirst"), disabled: true }]
    },
    ...(isFavorited
      ? [
          {
            label: t("ContextMenu.Unfavorite"),
            icon: "lucide:star-off",
            onSelect: () => {
              contextMenuVisible.value = false;
              toggleAssetFavorite(asset, false);
            }
          } satisfies DropdownMenuItem
        ]
      : [])
  ];
});

watch(
  loggedIn,
  (value) => {
    if (value) loadFavoriteFolders();
  },
  { immediate: true }
);
</script>

<template>
  <div
    class="flex h-full w-full shrink-0 overflow-hidden flex-col"
    :class="
      visuallyCollapsed
        ? 'border-r-0 shadow-none'
        : 'border-r border-[color:var(--sidebar-divider-light)] dark:border-[color:var(--sidebar-divider-dark)]'
    "
    :style="{
      backgroundColor: contentBackgroundColor
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
            :ui="{
              content: 'w-36 p-1',
              item: 'mx-0 px-2 py-1 rounded-md text-[11px] leading-4 transition-colors duration-150',
              itemLeadingIcon: 'sidebar-icon-sm'
            }"
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
.light .menu .menu-item {
  &[data-active] {
    background-color: transparent;

    &::before {
      background-color: var(--bg-selected-light);
    }

    font-weight: 600;
  }

  &:hover:not([data-active]) {
    background-color: var(--bg-hover-light);
  }
}

.dark .menu .menu-item {
  &[data-active] {
    background-color: transparent;

    &::before {
      background-color: var(--bg-selected-dark);
    }

    font-weight: 600;
  }

  &:hover:not([data-active]) {
    background-color: var(--bg-hover-dark);
  }
}

.menu nav[data-collapsed="true"] {
  width: 38px;
}

.asset-list,
.menu {
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb-color) var(--scrollbar-track-color);
}

.asset-list::-webkit-scrollbar,
.menu::-webkit-scrollbar {
  width: var(--scrollbar-width);
  height: var(--scrollbar-width);
}

.asset-list::-webkit-scrollbar-track,
.menu::-webkit-scrollbar-track {
  background: var(--scrollbar-track-color);
}

.asset-list::-webkit-scrollbar-thumb,
.menu::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-color);
  border-radius: 4px;
}

.asset-list::-webkit-scrollbar-thumb:hover,
.menu::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover-color);
}
</style>
