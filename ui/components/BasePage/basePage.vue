<script setup lang="ts">
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { layoutsType } from "~/store/modules/userSetting";

import type { AssetItem, SettingResponse } from "~/types/index";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { useUserSettingStore } from "~/store/modules/userSetting";

type AssetType = "linux" | "windows" | "database" | "device" | "favorite";

const props = defineProps<{
  type: AssetType;
  iconName: string;
  platform?: string;
}>();

const providerClearSelection = inject<(cb: () => void) => void>("providerClearSelection");

const { t } = useI18n();
const { handleAssetConnection, handleAssetFavorite } = useAssetAction();
const { getAssetDetail, displayUser, displayProtocol } = useAssetAction();

const editModalOpen = ref(false);
const suppressNextEditModal = ref(false);
const draftRememberSecret = ref<boolean>(false);
const draftAccount = ref<string>("");
const draftProtocol = ref<string>("");
const draftManualUsername = ref<string>("");
const draftManualPassword = ref<string>("");
const draftDynamicPassword = ref<string>("");
const scrollRef = ref<HTMLElement | null>(null);
const selectedCardIndex = ref<number | null>(null);
const currentSelectedCardInfo = ref<AssetItem | null>(null);
const subscribeSettingEvent = ref<UnlistenFn | null>(null);

// 上下文菜单相关状态
const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const contextMenuAsset = ref<AssetItem | null>(null);

const userInfoStore = useUserInfoStore();
const userSettingStore = useUserSettingStore();
const assetManager = useAssetFetcher(props.type, scrollRef);

const { layouts } = storeToRefs(userSettingStore);
const { loggedIn, currentSite, currentUser } = storeToRefs(userInfoStore);
const {
  getDetail,
  assetsData,
  isAppending,
  fetchNextPage,
  scrollbarStyles,
  isInitialLoading,
  appendSkeletonCount,
  lastDetailAssetId
} = assetManager;

const visibleAssets = computed(() => {
  if (!props.platform || props.platform === "all") return assetsData.value;
  return assetsData.value.filter((item: AssetItem) => item.platform === props.platform);
});

const modalTitle = computed(() => {
  return `${t("EditModal.ModifyConnectionInfo")} - ${currentSelectedCardInfo.value?.name}`;
});

watch([editModalOpen, currentSelectedCardInfo], ([open, info]: [boolean, AssetItem | null]) => {
  if (open && info) initDraft();
});

watch(
  () => loggedIn.value,
  (nv: boolean) => {
    if (nv) {
      getSettings();
      fetchNextPage();
    }
  },
  { immediate: true }
);

watch(
  () => layouts.value,
  (nv: layoutsType) => {
    if (nv) {
      useEventBus().emit("loaded", undefined);
    }
  }
);

watch(
  () => getDetail.value,
  (nv: boolean) => {
    if (!nv) return;

    if (selectedCardIndex.value !== null) {
      const idx = selectedCardIndex.value;

      if (visibleAssets.value[idx]) {
        currentSelectedCardInfo.value = visibleAssets.value[idx]!;
      }
    } else if (currentSelectedCardInfo.value) {
      const updated = visibleAssets.value.find((a) => a.id === currentSelectedCardInfo.value!.id);
      if (updated) currentSelectedCardInfo.value = updated;
    } else if (lastDetailAssetId?.value) {
      const target = visibleAssets.value.find((a) => a.id === lastDetailAssetId.value);
      if (target) currentSelectedCardInfo.value = target;
    }

    initDraft();

    // 若为右键菜单触发的详情更新，则不弹出编辑弹窗
    if (!suppressNextEditModal.value) {
      editModalOpen.value = true;
    }

    suppressNextEditModal.value = false;
    getDetail.value = false;
  }
);

/**
 * @description 初始化展示信息
 */
function initDraft() {
  const asset = currentSelectedCardInfo.value;
  if (!asset) return;

  const saved = userInfoStore.getConnectionInfoForAsset(asset.id);

  draftProtocol.value = displayProtocol(asset.id, asset.permedProtocols!);
  draftAccount.value = displayUser(asset.id, asset.permedAccounts!);

  draftManualUsername.value = saved?.manualUsername || "";
  draftManualPassword.value = saved?.manualPassword || "";
  draftDynamicPassword.value = saved?.dynamicPassword || "";
  draftRememberSecret.value = saved?.rememberSecret || false;
}

/**
 * 获取 Setting 信息
 */
async function getSettings() {
  await useTauriCoreInvoke("get_setting", {
    site: currentSite.value,
    cookieHeader: currentUser.value!.headerJson
  });
}

/**
 * @description 处理卡片点击
 * @param index
 * @param e
 */
const handleCardClick = (index: number, e: MouseEvent) => {
  e.stopPropagation();
  selectedCardIndex.value = index;
  currentSelectedCardInfo.value = visibleAssets.value[index]!;
};

/**
 * @description 清除选中卡片
 */
const clearSelectedCard = () => {
  selectedCardIndex.value = null;
};

/**
 * @description Modal 确认处理,现在点击确认后,会触发连接操作
 */
const handleConfirm = () => {
  const asset = currentSelectedCardInfo.value;
  if (!asset) return;

  let accountMode: "hosted" | "dynamic" | "manual" = "hosted";
  let normalizedAccount = draftAccount.value || "";

  const v = draftAccount.value || "";

  if (v === "手动输入" || v === "Manual input") accountMode = "manual";
  if (v.includes("同名账号") || v.includes("Dynamic user")) {
    accountMode = "dynamic";

    const accs = currentSelectedCardInfo.value?.permedAccounts || [];
    const dynamicAcc = accs.find((a) => a.alias === "@USER");

    if (dynamicAcc) normalizedAccount = dynamicAcc.name;
    else normalizedAccount = v.replace(/\(.+\)/, "");
  }

  // 保存连接信息
  userInfoStore.setConnectionInfoForAsset(asset.id, {
    protocol: draftProtocol.value || "",
    username: normalizedAccount,
    accountMode,
    manualUsername: draftRememberSecret.value ? draftManualUsername.value || "" : "",
    manualPassword: draftRememberSecret.value ? draftManualPassword.value || "" : "",
    dynamicPassword: draftRememberSecret.value ? draftDynamicPassword.value || "" : "",
    rememberSecret: !!draftRememberSecret.value
  });

  // 获取 ConnectToken
  handleAssetConnection(
    normalizedAccount,
    asset.id,
    draftProtocol.value,
    asset.permedAccounts!,
    undefined,
    {
      accountMode,
      manualUsername: draftManualUsername.value || "",
      manualPassword: draftManualPassword.value || "",
      dynamicPassword: draftDynamicPassword.value || ""
    }
  );

  nextTick(() => {
    editModalOpen.value = false;
  });
};

/**
 * @description 右键出现 context 时，记录当前卡片并抑制弹窗
 */
const handleContextTrigger = (asset: AssetItem, event?: MouseEvent) => {
  suppressNextEditModal.value = true;
  currentSelectedCardInfo.value = asset;
  contextMenuAsset.value = asset;

  const idx = visibleAssets.value.findIndex((a) => a.id === asset.id);

  if (idx !== -1) {
    selectedCardIndex.value = idx;
  }

  // 如果有事件对象，设置菜单位置
  if (event) {
    const menuWidth = 200; // 菜单宽度
    const menuHeight = 200; // 菜单高度
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let x = event.clientX;
    let y = event.clientY;
    
    // 检查是否来自表格按钮（通过检查目标元素）
    const target = event.target as HTMLElement;
    const isTableButton = target?.hasAttribute('data-table-context-button') || 
                         target?.closest('[data-table-context-button]') ||
                         target?.closest('.UTable');
    
    // 如果是表格按钮，优先显示在左侧
    if (isTableButton) {
      x = event.clientX - menuWidth;
      // 如果左侧空间不够，则显示在右侧
      if (x < 10) {
        x = event.clientX;
      }
    } else {
      // 对于其他情况（如右键菜单），如果菜单会超出右边界，则显示在左侧
      if (x + menuWidth > viewportWidth) {
        x = event.clientX - menuWidth;
      }
    }
    
    // 如果菜单会超出下边界，则向上调整
    if (y + menuHeight > viewportHeight) {
      y = event.clientY - menuHeight;
    }
    
    // 确保不超出左边界和上边界
    x = Math.max(10, x);
    y = Math.max(10, y);
    
    contextMenuPosition.value = { x, y };
  }

  contextMenuVisible.value = true;
};

const listenTauriEvent = async () => {
  interface eventPayloadType {
    data: string;
    status: number;
  }

  subscribeSettingEvent.value = await useTauriEventListen("get-setting-success", (event) => {
    const payload = event.payload as eventPayloadType;
    const settingConfig = JSON.parse(payload.data) as SettingResponse;

    userInfoStore.setRdpClientOption(settingConfig.graphics);
  });
};

const handleOpenEditModal = (asset: AssetItem) => {
  currentSelectedCardInfo.value = asset;
  const idx = visibleAssets.value.findIndex((a) => a.id === asset.id);
  if (idx !== -1) selectedCardIndex.value = idx;

  const noAccounts = !asset.permedAccounts || asset.permedAccounts.length === 0;
  const noProtocols = !asset.permedProtocols || asset.permedProtocols.length === 0;

  if (noAccounts || noProtocols) {
    getDetail.value = false;
    getAssetDetail(asset.id);
    return;
  }

  editModalOpen.value = true;
};

// const contextMenuItems = computed<ContextMenuItem[][]>(() => {
//   const protocols = (props.asset.protocols || []).map((p: PermedProtocol) => p.name);
//   const uniqueProtocols = Array.from(new Set(protocols));

//   const moreConnectChildren: ContextMenuItem[] = uniqueProtocols.map((name: string) => ({
//     label: `${t("ContextMenu.Use")} ${name.toUpperCase()}`,
//     onClick: () => handleConnect(name)
//   }));

//   // 避免处理空数组
//   if (moreConnectChildren.length === 0) {
//     moreConnectChildren.push({
//       label: t("Common.NoData"),
//       disabled: true
//     } as ContextMenuItem);
//   }

//   return [
//     [
//       // {
//       //   label: t("ContextMenu.QuickConnect"),
//       //   icon: "i-lucide-unplug",
//       //   onClick: () => handleConnect(props.assetId)
//       // },
//       {
//         label: t("ContextMenu.Connect"),
//         icon: "i-lucide-plug",
//         children: [moreConnectChildren]
//       },
//       {
//         label: t("ContextMenu.Edit"),
//         icon: "solar:pen-new-square-linear",
//         onClick: () => openEditModal()
//       },
//       {
//         label: t("ContextMenu.Rename"),
//         icon: "i-lucide-pencil"
//       },
//       {
//         label: t("ContextMenu.Favorite"),
//         icon: "i-lucide-star",
//         onClick: () => handleAssetFavorite(props.assetId)
//       }
//     ]
//   ];
// });


onMounted(() => {
  listenTauriEvent();
  providerClearSelection?.(clearSelectedCard);
});

onBeforeUnmount(() => {
  if (subscribeSettingEvent.value) {
    subscribeSettingEvent.value();
  }
});

const handleConnectAsset = (asset: AssetItem) => {
  handleOpenEditModal(asset);
};

// 处理上下文菜单的连接操作
const handleContextConnect = (asset: AssetItem, protocol?: string) => {
  if (protocol) {
    // 如果有指定协议，直接连接
    handleAssetConnection(
      displayUser(asset.id, asset.permedAccounts!),
      asset.id,
      protocol,
      asset.permedAccounts!,
      undefined,
      {
        accountMode: "hosted",
        manualUsername: "",
        manualPassword: "",
        dynamicPassword: ""
      }
    );
  } else {
    // 否则打开编辑模态框
    handleOpenEditModal(asset);
  }
};

// 处理上下文菜单的编辑操作
const handleContextEdit = (asset: AssetItem) => {
  handleOpenEditModal(asset);
};

// 处理上下文菜单的重命名操作
const handleContextRename = (asset: AssetItem) => {
  // TODO: 实现重命名功能
  console.log("Rename asset:", asset);
};

// 处理上下文菜单的收藏操作
const handleContextFavorite = (asset: AssetItem) => {
  handleAssetFavorite(asset.id);
};


</script>


<template>
  <div class="relative h-full w-full flex min-h-0">
    <section
      v-if="layouts === 'grid'"
      ref="scrollRef"
      class="w-full overflow-y-auto container-scrollbar pr-2"
      :style="scrollbarStyles"
    >
      <div
        v-if="!loggedIn"
        class="w-full h-full flex flex-col items-center justify-center gap-2 p-2"
      >
        <CardLoginCard />
      </div>

      <div
        v-else-if="isInitialLoading"
        class="grid grid-cols-[repeat(auto-fit,minmax(360px,_1fr))] gap-4 p-2"
        aria-busy="true"
      >
        <CardSkeletonCard />
      </div>

      <div
        v-else-if="visibleAssets && visibleAssets.length === 0"
        class="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-500"
      >
        <UIcon name="mingcute:inbox-line" class="size-10" />
        <span class="text-sm">{{ t("Common.NoData") }}</span>
      </div>

      <div v-else class="grid grid-cols-[repeat(auto-fit,minmax(280px,_1fr))] gap-3 p-1">
        <CardGridCard
          v-for="(item, index) in visibleAssets"
          :key="item.id"
          :asset="item"
          @context-trigger="(asset, event) => handleContextTrigger(asset, event)"
          @connect-asset="handleConnectAsset(item)"
          @click="handleCardClick(index, $event)"
        />

        <template v-if="isAppending">
          <CardSkeletonCard :skeleton-count="appendSkeletonCount" />
        </template>
      </div>
    </section>

    <section
      v-else-if="layouts === 'table'"
      class="w-full overflow-y-auto container-scrollbar h-[calc(100vh-7.5rem)]"
      :style="scrollbarStyles"
    >
      <div
        v-if="!loggedIn"
        class="w-full h-full flex flex-col items-center justify-center gap-2 p-2"
      >
        <CardLoginCard />
      </div>

      <div v-else class="p-2">
        <CardTableCard 
          :items="visibleAssets" 
          @connect-asset="handleConnectAsset" 
          @context-trigger="(asset, event) => handleContextTrigger(asset, event)" 
        />
      </div>
    </section>

    <Modal
      :open="editModalOpen"
      :title="modalTitle"
      :description="t('EditModal.Description')"
      @confirm="handleConfirm"
      @update:open="editModalOpen = $event"
    >
      <EditForm
        v-if="currentSelectedCardInfo"
        v-model:protocol="draftProtocol"
        v-model:account="draftAccount"
        v-model:manual-username="draftManualUsername"
        v-model:manual-password="draftManualPassword"
        v-model:dynamic-password="draftDynamicPassword"
        v-model:remember-secret="draftRememberSecret"
        :accounts="currentSelectedCardInfo.permedAccounts!"
        :protocols="currentSelectedCardInfo.permedProtocols!"
      />
    </Modal>

    <!-- 上下文菜单 -->
    <AssetContextMenu
      v-if="contextMenuAsset"
      :asset="contextMenuAsset"
      :visible="contextMenuVisible"
      :x="contextMenuPosition.x"
      :y="contextMenuPosition.y"
      @update:visible="contextMenuVisible = $event"
      @connect="handleContextConnect"
      @edit="handleContextEdit"
      @rename="handleContextRename"
      @favorite="handleContextFavorite"
    />
  </div>
</template>

<style scoped>
.container-scrollbar {
  scrollbar-width: var(--scrollbar-width);
  scrollbar-color: var(--scrollbar-thumb-color) var(--scrollbar-track-color);
}
.container-scrollbar::-webkit-scrollbar {
  width: var(--scrollbar-width);
  height: var(--scrollbar-width);
}
.container-scrollbar::-webkit-scrollbar-track {
  background: var(--scrollbar-track-color);
  border-radius: 4px;
}
.container-scrollbar::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-color);
  border-radius: 4px;
  transition: background-color 0.2s ease;
}
.container-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover-color);
}
.container-scrollbar::-webkit-scrollbar-corner {
  background: var(--scrollbar-track-color);
}
</style>
