<script setup lang="ts">
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { layoutsType } from "~/store/modules/userSetting";
import type { AssetItem, SettingResponse } from "~/types/index";

import { useUserInfoStore } from "~/store/modules/userInfo";
import { useUserSettingStore } from "~/store/modules/userSetting";

import SkeletonCard from "~/components/Card/GridCard/skeletonCard.vue";

type AssetType = "linux" | "windows" | "database" | "device" | "favorite";

const props = defineProps<{
  type: AssetType;
  iconName: string;
  platform?: string;
}>();

const providerClearSelection = inject<(cb: () => void) => void>("providerClearSelection");
const { t } = useI18n();

const scrollRef = ref<HTMLElement | null>(null);
const subscribeSettingEvent = ref<UnlistenFn | null>(null);

const { connectAsset, confirmConnection } = useAssetConnection();
const editModal = useEditModal();
const contextMenu = useContextMenu();
const userInfoStore = useUserInfoStore();
const assetManagement = useAssetManagement();
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

// 监听模态框状态变化
watch(
  [editModal.editModalOpen, editModal.currentSelectedCardInfo],
  ([open, info]: [boolean, AssetItem | null]) => {
    if (open && info) editModal.initDraft(info);
  }
);

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

    if (assetManagement.selectedCardIndex.value !== null) {
      const idx = assetManagement.selectedCardIndex.value;

      if (visibleAssets.value[idx]) {
        editModal.currentSelectedCardInfo.value = visibleAssets.value[idx]!;
      }
    } else if (editModal.currentSelectedCardInfo.value) {
      const updated = visibleAssets.value.find(
        (a) => a.id === editModal.currentSelectedCardInfo.value!.id
      );
      if (updated) editModal.currentSelectedCardInfo.value = updated;
    } else if (lastDetailAssetId?.value) {
      const target = visibleAssets.value.find((a) => a.id === lastDetailAssetId.value);
      if (target) editModal.currentSelectedCardInfo.value = target;
    }

    if (editModal.currentSelectedCardInfo.value) {
      editModal.initDraft(editModal.currentSelectedCardInfo.value);
    }

    // 若为右键菜单触发的详情更新，则不弹出编辑弹窗
    if (!editModal.shouldSuppressModal()) {
      editModal.editModalOpen.value = true;
    }

    editModal.resetSuppressModal();
    getDetail.value = false;
  }
);

/**
 * 获取 Setting 信息
 */
async function getSettings() {
  await useTauriCoreInvoke("get_setting", {
    site: currentSite.value,
    cookieHeader: currentUser.value!.header_json
  });
}

/**
 * @description 处理上下文菜单触发
 */
const handleContextTrigger = (asset: AssetItem, event?: MouseEvent) => {
  editModal.setSuppressNextModal(true);
  editModal.currentSelectedCardInfo.value = asset;
  assetManagement.setCurrentAsset(asset);

  const idx = visibleAssets.value.findIndex((a) => a.id === asset.id);
  if (idx !== -1) {
    assetManagement.selectedCardIndex.value = idx;
  }

  contextMenu.showContextMenu(asset, event);
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

/**
 * @description 处理资产连接
 */
const handleConnectAsset = (asset: AssetItem) => {
  const result = connectAsset(asset);
  if (result?.needsModal) {
    editModal.openEditModal(asset);
  }
};

/**
 * @description 处理模态框确认
 */
const handleModalConfirm = () => {
  if (editModal.currentSelectedCardInfo.value) {
    editModal.handleConfirm((connectionInfo) => {
      confirmConnection(editModal.currentSelectedCardInfo.value!, connectionInfo);
    });
  }
};

onMounted(() => {
  listenTauriEvent();
  providerClearSelection?.(assetManagement.clearSelectedCard);
});

onBeforeUnmount(() => {
  if (subscribeSettingEvent.value) {
    subscribeSettingEvent.value();
  }
});
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
        <SkeletonCard />
      </div>

      <div
        v-else-if="visibleAssets && visibleAssets.length === 0"
        class="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-500"
      >
        <UIcon name="mingcute:inbox-line" class="size-10" />
        <span class="text-sm">{{ t("Common.NoData") }}</span>
      </div>

      <CardGridCard
        v-else
        :visible-assets="visibleAssets"
        :is-appending="isAppending"
        :append-skeleton-count="appendSkeletonCount"
        @connect-asset="handleConnectAsset"
        @context-trigger="handleContextTrigger"
      />
    </section>

    <section
      v-else-if="layouts === 'table'"
      class="w-full overflow-y-auto container-scrollbar h-[calc(100vh-5rem)]"
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
          @context-trigger="handleContextTrigger"
        />
      </div>
    </section>

    <Modal
      :open="editModal.editModalOpen.value"
      :title="editModal.modalTitle.value"
      :description="t('EditModal.Description')"
      @confirm="handleModalConfirm"
      @update:open="editModal.editModalOpen.value = $event"
    >
      <EditForm
        v-if="editModal.currentSelectedCardInfo.value"
        v-model:protocol="editModal.draftProtocol.value"
        v-model:account="editModal.draftAccount.value"
        v-model:manual-username="editModal.draftManualUsername.value"
        v-model:manual-password="editModal.draftManualPassword.value"
        v-model:dynamic-password="editModal.draftDynamicPassword.value"
        v-model:remember-secret="editModal.draftRememberSecret.value"
        :accounts="editModal.currentSelectedCardInfo.value.permed_accounts!"
        :protocols="editModal.currentSelectedCardInfo.value.permed_protocols!"
      />
    </Modal>

    <!-- Context menu 现在集成到各个组件中 -->
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
