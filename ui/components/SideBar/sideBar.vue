<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from "@nuxt/ui";
import type { AssetItem, AssetPageType } from "~/types";

import ConnectionEditor from "~/components/ConnectionEditor/connectionEditor.vue";
import { getConfiguredAppName } from "~/composables/useAppName";
import SidebarFlipIcon from "~/icons/SidebarFlipIcon.vue";
import { useUserInfoStore } from "~/store/modules/userInfo";
import Profile from "./profile.vue";

const localePath = useLocalePath();
const route = useRoute();

const { t } = useI18n();
const { isMacOS } = usePlatform();
// const isMacOS = false;
const { collapse, setCollapse } = useSettingManager();
const { activeWorkspaceMode, setWorkspaceMode } = useWorkspaceMode();
const { confirmConnection, saveConnectionInfo } = useAssetConnection();
const { openSession } = useWorkspaceTabs();
const {
  displayUser,
  handleAssetConnection,
  handleAssetFavorite,
  handleAssetRename,
  handleAssetUnfavorite
} = useAssetAction();

const appName = ref(getConfiguredAppName());
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
const { assetsData, isInitialLoading, refreshAssets, scrollbarStyles } = assetFetcher;
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

const handleCollapse = () => {
  setCollapse(!collapse.value);
};

const handleWindowDrag = async (event: MouseEvent) => {
  const target = event.target as HTMLElement;
  if (
    target.closest("button")
    || target.closest('[role="button"]')
    || target.closest("input")
    || target.closest("select")
  ) {
    return;
  }

  if (event.button !== 0) return;

  try {
    const windows = await useTauriWindowGetAllWindows();
    windows.find((window) => window.label === "main")?.startDragging();
  } catch (error) {
    console.error(error);
  }
};

const categoryOrder = ["linux", "windows", "windows_ad", "database", "device", "web", "unix", "other"];

const categoryLabel = (asset: AssetItem) => {
  const type = (asset.type || "").toLowerCase();
  const category = (asset.category || "").toLowerCase();
  const value = category === "host" || category === "-" ? type : category || type;

  if (value === "linux") return t("Menu.Linux");
  if (value === "windows" || value === "windows_ad") return t("Menu.Windows");
  if (value === "database") return t("Menu.Database");
  if (value === "device") return t("Menu.Device");
  if (value === "web") return t("Menu.Web");
  return t("Menu.Other");
};

const categoryRank = (asset: AssetItem) => {
  const type = (asset.type || "").toLowerCase();
  const category = (asset.category || "").toLowerCase();
  const value = category === "host" || category === "-" ? type : category || type;
  const normalized = value === "windows_ad" ? "windows" : value;
  const index = categoryOrder.indexOf(normalized);
  return index === -1 ? categoryOrder.length : index;
};

const groupedAssets = computed(() => {
  const groups = new Map<string, AssetItem[]>();
  const sorted = [...visibleAssets.value].sort((left, right) => {
    const rankDiff = categoryRank(left) - categoryRank(right);
    if (rankDiff !== 0) return rankDiff;
    return left.name.localeCompare(right.name);
  });

  for (const asset of sorted) {
    const label = categoryLabel(asset);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(asset);
  }

  return Array.from(groups.entries()).map(([label, assets]) => ({ label, assets }));
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

const setMode = async (mode: "assets" | "tools") => {
  if (mode !== "tools") {
    setWorkspaceMode(mode);
    return;
  }

  const toolPaths = [localePath("videoplayer"), localePath({ path: "/transcode" })];
  if (!toolPaths.includes(route.path)) {
    await navigateTo(localePath("videoplayer"));
  }

  setWorkspaceMode(mode);
};

const searchAssets = (value: string) => {
  refreshAssets(value);
};

const debouncedAssetSearch = useDebounceFn(searchAssets, 200);

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

  return uniqueProtocols.length > 0 ? uniqueProtocols : ["ssh"];
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
    class="flex flex-col bg-white/30 dark:bg-zinc-900/20 backdrop-saturate-150 supports-backdrop-filter:dark:bg-zinc-900/15 border-r border-white/30 dark:border-white/10 shadow-sm"
    :style="{
      width: collapse ? '75px' : '220px'
    }"
  >
    <!-- 顶部区域：折叠按钮和搜索框 -->
    <div class="flex flex-col w-full">
      <!-- 折叠按钮 -->
      <div
        class="flex items-center px-3 h-10"
        :class="
          isMacOS
            ? collapse
              ? 'mt-9 justify-center'
              : 'justify-end'
            : collapse
              ? 'py-2 justify-center mt-2'
              : 'py-2 mt-2 justify-between'
        "
        @mousedown="handleWindowDrag"
      >
        <div v-if="!isMacOS && !collapse" class="flex items-center gap-2">
          <UAvatar size="sm" src="/logo.png" class="bg-transparent" :ui="{ root: 'bg-transparent' }" />
          <span v-if="appName" class="text-sm">{{ appName }}</span>
        </div>

        <UButton
          color="neutral"
          variant="ghost"
          size="md"
          :class="collapse ? 'p-2' : 'p-1'"
          :icon="SidebarFlipIcon"
          @click="handleCollapse"
        />
      </div>

      <div v-show="!collapse" class="px-3 py-1">
        <div class="grid grid-cols-2 gap-0.5 rounded-sm border border-black/10 bg-gray-100/80 p-0.5 dark:border-white/10 dark:bg-white/10">
          <button
            type="button"
            class="h-5 rounded-[3px] text-[11px] font-medium leading-none transition"
            :class="activeWorkspaceMode === 'assets' ? 'bg-white text-gray-900 shadow-sm dark:bg-white/15 dark:text-white' : 'text-gray-500 dark:text-gray-400'"
            @click="setMode('assets')"
          >
            我的资产
          </button>
          <button
            type="button"
            class="h-5 rounded-[3px] text-[11px] font-medium leading-none transition"
            :class="activeWorkspaceMode === 'tools' ? 'bg-white text-gray-900 shadow-sm dark:bg-white/15 dark:text-white' : 'text-gray-500 dark:text-gray-400'"
            @click="setMode('tools')"
          >
            工具集
          </button>
        </div>
      </div>

      <div
        v-show="!collapse && activeWorkspaceMode === 'assets'"
        class="flex items-center gap-1 px-3 pt-1 pb-1"
      >
        <div v-if="shouldShowOrganizationSelector" class="min-w-0 flex-1">
          <HeaderOrganizationSelector />
        </div>

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
      v-if="activeWorkspaceMode === 'tools'"
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
      <div v-if="collapse" class="px-2 py-2 flex flex-col items-center gap-1">
        <UTooltip v-for="group in groupedAssets" :key="group.label" :text="group.label" :delay-duration="150">
          <UButton
            icon="i-lucide-folder"
            color="neutral"
            variant="ghost"
            size="sm"
            class="size-9 justify-center rounded-sm"
          />
        </UTooltip>
      </div>

      <template v-else>
        <div v-if="!loggedIn" class="h-full grid place-items-center px-3 text-xs text-gray-500 dark:text-gray-400">
          请先登录
        </div>

        <div v-else-if="isInitialLoading" class="p-3 space-y-2">
          <USkeleton v-for="idx in 8" :key="idx" class="h-10 w-full" />
        </div>

        <UEmpty
          v-else-if="visibleAssets.length === 0"
          icon="mingcute:inbox-line"
          size="lg"
          variant="naked"
          :title="t('Common.NoData')"
          class="h-full"
        />

        <div v-else class="pb-1">
          <section v-for="group in groupedAssets" :key="group.label" class="mb-2">
            <button
              type="button"
              class="group flex h-7 w-full cursor-pointer items-center gap-1.5 px-3 text-left text-[11px] uppercase text-gray-500 transition hover:bg-white/70 dark:text-gray-400 dark:hover:bg-white/10"
              @click="toggleAssetGroup(group.label)"
            >
              <UIcon
                name="i-lucide-chevron-down"
                class="size-3 shrink-0 transition-transform"
                :class="isAssetGroupCollapsed(group.label) ? '-rotate-90' : ''"
              />
              <span class="min-w-0 flex-1 truncate">{{ group.label }}</span>
              <span
                class="min-w-4 rounded-full px-1.5 py-0.5 text-center text-[10px] leading-none text-gray-400 group-hover:text-gray-500 dark:text-gray-500 dark:group-hover:text-gray-300"
              >
                {{ group.assets.length }}
              </span>
            </button>

            <div v-show="!isAssetGroupCollapsed(group.label)">
              <button
                v-for="asset in group.assets"
                :key="asset.id"
                class="flex w-full cursor-pointer items-center gap-2 px-3 py-[6px] text-left transition-colors hover:bg-white/80 hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)] dark:hover:bg-white/10 dark:hover:shadow-none"
                :class="!asset.isActive ? 'opacity-50' : ''"
                @click="handleAssetConnect(asset)"
                @contextmenu="handleAssetContextMenu(asset, $event)"
              >
                <CardAssetIcon :type="asset.type" size="sm" />
                <div class="min-w-0 flex-1">
                  <div class="text-xs font-medium truncate">
                    {{ asset.name }}
                  </div>
                  <div class="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                    {{ asset.displayAddressLine || asset.address }}
                  </div>
                </div>
                <UIcon name="i-lucide-terminal" class="size-4 text-gray-400 shrink-0" />
              </button>
            </div>
          </section>
        </div>
      </template>
    </div>

    <div class="px-3 pb-3 pt-1 mt-auto">
      <Profile :collapse="collapse" />
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
