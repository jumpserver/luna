<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from "@nuxt/ui";
import type { AssetItem } from "~/types";

import ConnectionEditor from "~/components/ConnectionEditor/connectionEditor.vue";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { sortProtocolNames } from "~/utils";

const { t } = useI18n();
const localePath = useLocalePath();
const { collapse, theme } = useSettingManager();
const { componentsConfig } = useAppConfig();
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
const connEditorRef = ref<InstanceType<typeof ConnectionEditor> | null>(null);
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
const userInfoStore = useUserInfoStore();
const { loggedIn, currentUser } = storeToRefs(userInfoStore);

const contentBackgroundColor = computed(() =>
  theme.value === "dark"
    ? componentsConfig.pages.mainCardDarkBackgroundColor
    : componentsConfig.pages.mainCardLightBackgroundColor
);

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
</script>

<template>
  <div
    class="flex h-full w-full shrink-0 overflow-hidden flex-col"
    :class="collapse ? 'border-r-0 shadow-none' : 'border-r border-white/30 dark:border-white/10 shadow-sm'"
    :style="{
      backgroundColor: contentBackgroundColor
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

    <div v-else class="flex min-h-0 flex-1 flex-col">
      <SideBarAssetTree
        class="min-h-0 flex-1"
        :search="sidebarSearch"
        @select="handleAssetConnect"
        @contextmenu="handleAssetContextMenu"
      />
      <SideBarSnippetsPanel />
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
