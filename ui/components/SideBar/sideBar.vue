<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from "@nuxt/ui";
import type { AssetItem, AssetPageType } from "~/types";

import ConnectionEditor from "~/components/ConnectionEditor/connectionEditor.vue";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { sortProtocolNames } from "~/utils";

const { t } = useI18n();
const localePath = useLocalePath();
const { collapse } = useSettingManager();
const { activeWorkspaceMode } = useWorkspaceMode();
const showTools = computed(() => isTauriRuntime());
const { confirmConnection, saveConnectionInfo } = useAssetConnection();
const { openSession } = useWorkspaceTabs();
const {
  displayUser,
  handleAssetConnection,
  handleAssetFavorite,
  handleAssetRename,
  handleAssetUnfavorite
} = useAssetAction();

const isLoading = ref(false);
const sidebarSearch = ref("");
const showAssetSearch = ref(false);
const assetScrollRef = ref<HTMLElement | null>(null);
const connEditorRef = ref<InstanceType<typeof ConnectionEditor> | null>(null);
const collapsedAssetGroups = ref<Set<string>>(new Set());
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
const assetFetcher = useAssetFetcher("assets", assetScrollRef);
const userInfoStore = useUserInfoStore();
const { loggedIn, currentUser } = storeToRefs(userInfoStore);
const { assetsData, isInitialLoading, isLoading: isAssetLoading, refreshAssets, scrollbarStyles } = assetFetcher;
const { visibleAssets } = useDisplayAssets(assetsData, undefined, computed<AssetPageType>(() => "assets"));

const shouldShowOrganizationSelector = computed(() => {
  if (!loggedIn.value) return false;

  return currentUser.value?.xpackLicenseValid !== false;
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

const categoryOrder = ["linux", "windows", "database", "device", "web", "other"] as const;
type AssetCategoryKey = typeof categoryOrder[number];

const categoryKey = (asset: AssetItem): AssetCategoryKey => {
  const type = (asset.type || "").toLowerCase();
  const category = (asset.category || "").toLowerCase();
  const value = category === "host" || category === "-" ? type : category || type;

  if (value === "linux") return "linux";
  if (value === "windows" || value === "windows_ad") return "windows";
  if (value === "database") return "database";
  if (value === "device") return "device";
  if (value === "web") return "web";
  return "other";
};

const categoryLabels = computed<Record<AssetCategoryKey, string>>(() => ({
  linux: t("Menu.Linux"),
  windows: t("Menu.Windows"),
  database: t("Menu.Database"),
  device: t("Menu.Device"),
  web: t("Menu.Web"),
  other: t("Menu.Other")
}));

const resolveTreeAssetIcon = (asset: AssetItem) => {
  const icons: Record<AssetCategoryKey, string> = {
    linux: "i-lucide-terminal",
    windows: "i-lucide-monitor",
    database: "i-lucide-database",
    device: "i-lucide-router",
    web: "i-lucide-globe",
    other: "i-lucide-box"
  };

  return icons[categoryKey(asset)];
};

const isLinuxTreeAsset = (asset: AssetItem) => categoryKey(asset) === "linux";

const groupedAssets = computed(() => {
  const groups = new Map<AssetCategoryKey, AssetItem[]>(categoryOrder.map((key) => [key, []]));
  const sorted = [...visibleAssets.value].sort((left, right) => {
    const rankDiff = categoryOrder.indexOf(categoryKey(left)) - categoryOrder.indexOf(categoryKey(right));
    if (rankDiff !== 0) return rankDiff;
    return left.name.localeCompare(right.name);
  });

  for (const asset of sorted) {
    groups.get(categoryKey(asset))!.push(asset);
  }

  return Array.from(groups.entries()).map(([key, assets]) => ({ key, label: categoryLabels.value[key], assets }));
});

const isAssetGroupCollapsed = (label: string) => collapsedAssetGroups.value.has(label);

const toggleAssetGroup = (label: string) => {
  const next = new Set(collapsedAssetGroups.value);

  if (next.has(label)) {
    next.delete(label);
  } else {
    next.add(label);
  }

  collapsedAssetGroups.value = next;
};

const searchAssets = (value: string) => {
  refreshAssets(value);
};

const debouncedAssetSearch = useDebounceFn(searchAssets, 200);

const handleRefreshAuthorizedAssets = () => {
  if (!loggedIn.value || isAssetLoading.value) return;

  refreshAssets(sidebarSearch.value);
};

const hasSshProtocol = (asset: AssetItem) => {
  return (asset.permedProtocols || []).some((protocol) => protocol.name === "ssh");
};

const connectWithBuiltinSsh = (asset: AssetItem, info: any) => {
  const protocol = info.protocol || asset.savedConnection?.protocol || "ssh";
  const availableProtocols = info.availableProtocols || asset.savedConnection?.availableProtocols || [];

  if (protocol !== "ssh") {
    useToast().add({
      title: "暂不支持该协议",
      description: "内置连接目前只支持 SSH。",
      color: "warning",
      icon: "i-lucide-circle-alert",
      duration: 3000
    });
    return;
  }

  if (availableProtocols.length > 0 && !availableProtocols.includes("ssh")) {
    useToast().add({
      title: "暂不支持该资产",
      description: "内置连接目前只支持 SSH 资产。",
      color: "warning",
      icon: "i-lucide-circle-alert",
      duration: 3000
    });
    return;
  }

  const builtinInfo = {
    ...info,
    protocol: "ssh",
    connectMethod: "builtin_client"
  };
  saveConnectionInfo(asset, builtinInfo);

  const session = openSession(
    {
      ...asset,
      savedConnection: {
        ...(asset.savedConnection || {}),
        protocol: "ssh",
        username: builtinInfo.account,
        connectMethod: "builtin_client"
      }
    },
    {
      protocol: "ssh",
      account: builtinInfo.account
    }
  );

  confirmConnection(asset, {
    ...builtinInfo,
    connectMethod: "builtin_client",
    tabId: session.id
  });
};

const handleAssetConnect = async (asset: AssetItem) => {
  if (!hasSshProtocol(asset) && asset.permedProtocols && asset.permedProtocols.length > 0) {
    useToast().add({
      title: "暂不支持该资产",
      description: "内置连接目前只支持 SSH 资产。",
      color: "warning",
      icon: "i-lucide-circle-alert",
      duration: 3000
    });
    return;
  }

  const saved = asset.savedConnection;
  const canDirectConnect = saved?.protocol === "ssh" && saved.username;

  if (canDirectConnect) {
    connectWithBuiltinSsh(asset, {
      protocol: "ssh",
      account: saved.username,
      accountId: saved.accountId,
      accountMode: (saved.accountMode as any) || "hosted",
      manualUsername: saved.manualUsername || "",
      manualPassword: saved.manualPassword || "",
      dynamicPassword: saved.dynamicPassword || "",
      rememberSecret: !!saved.rememberSecret,
      connectMethod: "builtin_client",
      availableProtocols: saved.availableProtocols || []
    });
    return;
  }

  try {
    const info = await connEditorRef.value!.open(asset);
    connectWithBuiltinSsh(asset, {
      ...info,
      protocol: "ssh"
    });
  } catch {}
};

const handleAssetEdit = async (asset: AssetItem) => {
  try {
    const info = await connEditorRef.value!.open(asset);
    saveConnectionInfo(asset, info);
  } catch {}
};

const resolveAssetProtocols = (asset: AssetItem) => {
  const protocols = [
    ...(asset.permedProtocols || []).map((protocol) => protocol?.name),
    ...(asset.savedConnection?.availableProtocols || []),
    asset.savedConnection?.protocol
  ];

  const uniqueProtocols = Array.from(
    new Set(protocols.filter((protocol): protocol is string => !!protocol))
  );

  return uniqueProtocols.length > 0 ? sortProtocolNames(uniqueProtocols) : ["ssh"];
};

const handleProtocolConnect = async (asset: AssetItem, protocol: string) => {
  contextMenuVisible.value = false;

  if (protocol === "ssh") {
    const saved = asset.savedConnection;
    if (saved?.username) {
      connectWithBuiltinSsh(asset, {
        ...saved,
        protocol: "ssh",
        account: saved.username
      });
      return;
    }

    try {
      const info = await connEditorRef.value!.open(asset);
      connectWithBuiltinSsh(asset, { ...info, protocol: "ssh" });
    } catch {}
    return;
  }

  handleAssetConnection(
    displayUser(asset.id, asset.permedAccounts || []),
    asset.id,
    protocol,
    asset.permedAccounts || [],
    protocol
  );
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

  const protocolItems: DropdownMenuItem[] = resolveAssetProtocols(asset).map((protocol) => ({
    label: `${t("ContextMenu.Use")} ${protocol.toUpperCase()}`,
    icon: "i-lucide-plug",
    onSelect: () => handleProtocolConnect(asset, protocol)
  }));

  return [
    {
      label: t("ContextMenu.Connect"),
      icon: "i-lucide-plug",
      onSelect: () => {
        contextMenuVisible.value = false;
        handleAssetConnect(asset);
      }
    },
    {
      label: t("ContextMenu.MoreConnect"),
      icon: "i-lucide-ellipsis",
      children: protocolItems
    },
    {
      label: t("ContextMenu.Edit"),
      icon: "solar:pen-new-square-linear",
      onSelect: () => {
        contextMenuVisible.value = false;
        handleAssetEdit(asset);
      }
    },
    {
      label: t("ContextMenu.Rename"),
      icon: "i-lucide-pencil",
      onSelect: () => openRenameModal(asset)
    },
    {
      label: isFavorited ? t("ContextMenu.Unfavorite") : t("ContextMenu.Favorite"),
      icon: isFavorited ? "lucide:star-off" : "lucide:star",
      onSelect: () => {
        contextMenuVisible.value = false;
        toggleAssetFavorite(asset, !isFavorited);
      }
    }
  ];
});

watch(
  () => loggedIn.value,
  async (nv) => {
    if (nv && activeWorkspaceMode.value === "assets") {
      await nextTick();
      refreshAssets();
    }
  }
);

watch(
  () => activeWorkspaceMode.value,
  async (mode) => {
    if (mode === "assets" && loggedIn.value && assetsData.value.length === 0) {
      await nextTick();
      refreshAssets(sidebarSearch.value);
    }
  },
  { immediate: true }
);
</script>

<template>
  <!-- backdrop-blur-lg 如果加上这个属性会导致在拖动窗口的时候，左侧背景一直在变化 -->
  <div
    class="flex shrink-0 overflow-hidden flex-col bg-white/30 dark:bg-zinc-900/20 backdrop-saturate-150 supports-backdrop-filter:dark:bg-zinc-900/15 transition-[width] duration-200"
    :class="collapse ? 'border-r-0 shadow-none' : 'border-r border-white/30 dark:border-white/10 shadow-sm'"
    :style="{
      width: collapse ? '0px' : '220px'
    }"
  >
    <div class="flex flex-col w-full">
      <div
        v-show="!collapse && activeWorkspaceMode === 'assets'"
        class="flex items-center gap-1 border-b border-gray-200 px-3 py-1 dark:border-white/10"
      >
        <div v-if="shouldShowOrganizationSelector" class="min-w-0 flex-1">
          <HeaderOrganizationSelector />
        </div>

        <UTooltip :text="t('ToolTips.Refresh')" :delay-duration="150">
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-refresh-cw"
            :aria-label="t('ToolTips.Refresh')"
            :disabled="!loggedIn || isAssetLoading"
            :loading="isAssetLoading"
            class="size-7 shrink-0 justify-center rounded-sm p-0 text-gray-500 dark:text-gray-400"
            @click="handleRefreshAuthorizedAssets"
          />
        </UTooltip>

        <UTooltip :text="t('Operation.Search')" :delay-duration="150">
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-search"
            :aria-label="t('Operation.Search')"
            class="size-7 shrink-0 justify-center rounded-sm p-0"
            :class="showAssetSearch || sidebarSearch ? 'bg-black/5 text-gray-900 dark:bg-white/10 dark:text-white' : 'text-gray-500 dark:text-gray-400'"
            @click="showAssetSearch = !showAssetSearch"
          />
        </UTooltip>
      </div>

      <!-- 搜索框区域 -->
      <div v-if="!collapse && activeWorkspaceMode === 'assets' && showAssetSearch" class="px-3 py-1">
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
          class="search-input rounded-sm w-full"
          :ui="{
            base: 'bg-white/40 dark:bg-white/5 ring-1 ring-inset ring-black/5 dark:ring-white/10 focus-visible:ring-primary/40 placeholder:text-gray-400 dark:placeholder:text-gray-500'
          }"
          @update:model-value="debouncedAssetSearch"
        >
          <template v-if="sidebarSearch?.length" #trailing>
            <UButton
              color="neutral"
              variant="link"
              size="sm"
              icon="i-lucide-circle-x"
              aria-label="Clear input"
              @click="
                () => {
                  sidebarSearch = '';
                  searchAssets('');
                }
              "
            />
          </template>
        </UInput>
      </div>
    </div>

    <div
      v-if="showTools && activeWorkspaceMode === 'tools'"
      class="px-3 py-0 flex-1 overflow-auto menu"
      :style="{
        ...scrollbarStyles,
        display: collapse ? 'inline-flex' : '',
        justifyContent: collapse ? 'center' : ''
      }"
    >
      <UNavigationMenu
        orientation="vertical"
        :items="sideBarItems"
        :collapsed="collapse"
        color="neutral"
        :ui="{
          link: 'px-2 my-1 rounded-sm menu-item flex items-center light:text-gray-800 dark:text-gray-200',
          linkLeadingIcon: 'light:text-gray-800 dark:text-gray-200',
          label: 'light:text-gray-500 dark:text-gray-400 pb-0 text-xs font-light'
        }"
      />
    </div>

    <div
      v-else
      ref="assetScrollRef"
      class="flex-1 min-h-0 overflow-y-auto asset-list"
      :style="scrollbarStyles"
    >
      <div v-if="!loggedIn" class="h-full grid place-items-center px-3 text-xs text-gray-500 dark:text-gray-400">
        请先登录
      </div>

      <div v-else-if="isInitialLoading" class="px-2 pb-2 pt-1 space-y-1">
        <div
          v-for="idx in 8"
          :key="idx"
          class="flex h-7 items-center gap-1.5 rounded-sm px-1"
        >
          <USkeleton class="size-3 shrink-0 rounded-sm" />
          <USkeleton class="h-3 w-24 max-w-[70%]" />
        </div>
      </div>

      <UEmpty
        v-else-if="visibleAssets.length === 0"
        icon="mingcute:inbox-line"
        size="lg"
        variant="naked"
        :title="t('Common.NoData')"
        class="h-full"
      />

      <div v-else class="px-2 pb-2 pt-1" role="tree" :aria-label="t('Menu.Resource')">
        <section v-for="group in groupedAssets" :key="group.key" class="asset-tree-group">
          <button
            type="button"
            role="treeitem"
            :aria-expanded="!isAssetGroupCollapsed(group.key)"
            class="group flex h-7 w-full cursor-pointer items-center gap-1 rounded-sm px-1 text-left text-xs font-medium text-gray-700 transition-colors hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10"
            @click="toggleAssetGroup(group.key)"
          >
            <UIcon
              name="i-lucide-chevron-right"
              class="size-2.5 shrink-0 text-gray-400 transition-transform dark:text-gray-500"
              :class="!isAssetGroupCollapsed(group.key) ? 'rotate-90' : ''"
            />
            <UIcon
              :name="isAssetGroupCollapsed(group.key) ? 'i-lucide-folder' : 'i-lucide-folder-open'"
              class="size-3.5 shrink-0 text-gray-500 dark:text-gray-400"
            />
            <span class="min-w-0 flex-1 truncate">{{ group.label }}</span>
            <span
              class="min-w-4 rounded-full bg-black/5 px-1.5 py-0.5 text-center text-[11px] font-normal leading-none text-gray-400 group-hover:text-gray-500 dark:bg-white/5 dark:text-gray-500 dark:group-hover:text-gray-300"
            >
              {{ group.assets.length }}
            </span>
          </button>

          <div
            v-show="!isAssetGroupCollapsed(group.key)"
            role="group"
            class="asset-tree-children ml-[9px] pl-[12px]"
          >
            <button
              v-for="asset in group.assets"
              :key="asset.id"
              role="treeitem"
              type="button"
              :title="`${asset.name} · ${asset.displayAddressLine || asset.address}`"
              class="asset-tree-leaf group relative flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-sm px-1 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              :class="!asset.isActive ? 'opacity-50' : ''"
              @click="handleAssetConnect(asset)"
              @contextmenu="handleAssetContextMenu(asset, $event)"
            >
              <img
                v-if="isLinuxTreeAsset(asset)"
                src="/icons/linux.png"
                alt=""
                class="size-3 shrink-0 object-contain opacity-70 dark:opacity-80"
              >
              <UIcon v-else :name="resolveTreeAssetIcon(asset)" class="size-3 shrink-0 text-gray-500 dark:text-gray-400" />
              <span class="min-w-0 flex-1 truncate text-xs font-medium">{{ asset.name }}</span>
              <UIcon name="i-lucide-terminal" class="size-3 shrink-0 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          </div>
        </section>
      </div>
    </div>

    <ConnectionEditor ref="connEditorRef" asset-type="assets" />

    <Modal
      :open="renameModalOpen"
      :title="t('ContextMenu.Rename')"
      :description="renameAsset?.name || ''"
      :disabled="renameDisabled"
      @confirm="submitAssetRename"
      @update:open="updateRenameModal"
    >
      <UInput
        v-model="renameValue"
        autofocus
        class="w-full"
        :placeholder="t('AssetCard.AssetName')"
      />
    </Modal>

    <UDropdownMenu
      :open="contextMenuVisible"
      :items="assetContextMenuItems"
      size="sm"
      :content="{ align: 'start', side: 'bottom' }"
      :ui="{ content: 'w-44 p-1' }"
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
      background-color: var(--bg-hover-light);
    }

    /* opacity: 0.8; */
    font-weight: 500;
  }

  &:hover:not([data-active]) {
    background-color: var(--bg-hover-light);
  }
}

.dark .menu .menu-item {
  &[data-active] {
    background-color: transparent;

    &::before {
      background-color: rgba(255, 255, 255, 0.1);
    }

    font-weight: 500;
  }

  &:hover:not([data-active]) {
    background-color: rgba(255, 255, 255, 0.06);
  }
}

/* 配置页左侧为纯色背景，需要比透明侧边栏更明显的高亮 */
.dark .setting-menu .menu-item {
  &[data-active]::before {
    background-color: rgba(255, 255, 255, 0.16);
  }

  &:hover:not([data-active]) {
    background-color: rgba(255, 255, 255, 0.1);
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
