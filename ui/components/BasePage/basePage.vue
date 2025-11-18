<script setup lang="ts">
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { AssetItem, SettingResponse, LayoutsType, CharsetType, ResolutionType } from "~/types/index";

import { useUserInfoStore } from "~/store/modules/userInfo";

import SkeletonCard from "~/components/Card/GridCard/skeletonCard.vue";
import ConnectionEditor from "~/components/ConnectionEditor/connectionEditor.vue";

type AssetType = "linux" | "windows" | "database" | "device" | "favorite";

const props = defineProps<{
  type: AssetType;
  iconName: string;
  platform?: string;
}>();

const providerClearSelection = inject<(cb: () => void) => void>("providerClearSelection");

const scrollRef = ref<HTMLElement | null>(null);
const subscribeSettingEvent = ref<UnlistenFn | null>(null);

const { t } = useI18n();
const { confirmConnection, saveConnectionInfo } = useAssetConnection();

const contextMenu = useContextMenu();
const userInfoStore = useUserInfoStore();
const assetManagement = useAssetManagement();
const settingManager = useSettingManager();
const { layouts } = settingManager;
const {
  setCharsetPreference,
  setRdpResolutionPreference,
  setBackspacePreference,
  setKeyboardLayoutPreference,
  setRdpClientOptionPreference,
  setRdpColorQualityPreference,
  setRdpSmartSizePreference
} = settingManager;
const assetManager = useAssetFetcher(props.type, scrollRef);
const connEditorRef = ref<InstanceType<typeof ConnectionEditor> | null>(null);

const { loggedIn, currentSite, currentUser } = storeToRefs(userInfoStore);
const { fetchNextPage, assetsData, isAppending, scrollbarStyles, isInitialLoading, appendSkeletonCount } = assetManager;

const { visibleAssets } = useDisplayAssets(
  assetsData,
  computed(() => props.platform)
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
  (nv: LayoutsType) => {
    if (nv) {
      useEventBus().emit("loaded", undefined);
    }
  }
);

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
 * @description 打开 contextMenu
 */
const handleContextTrigger = (asset: AssetItem, event?: MouseEvent) => {
  assetManagement.setCurrentAsset(asset);

  const idx = visibleAssets.value.findIndex((a) => a.id === asset.id);
  if (idx !== -1) {
    assetManagement.selectedCardIndex.value = idx;
  }

  contextMenu.showContextMenu(asset, event);
};

/**
 * @description 打开编辑弹窗
 */
const handleEditTrigger = async (asset: AssetItem) => {
  try {
    const info = await connEditorRef.value!.open(asset);
    // 仅保存连接配置，不触发连接
    saveConnectionInfo(asset, info);
  } catch {}
};

/**
 * @description 处理资产连接
 */
const handleConnectAsset = async (asset: AssetItem) => {
  const saved = asset.savedConnection;

  const canDirectConnect = (() => {
    if (!saved || !saved.protocol || !saved.username) return false;

    const mode = saved.accountMode || "hosted";
    if (mode === "manual") {
      return !!(saved.rememberSecret && saved.manualUsername && saved.manualPassword);
    }
    if (mode === "dynamic") {
      return !!(saved.rememberSecret && saved.dynamicPassword);
    }

    return true;
  })();

  if (canDirectConnect) {
    return confirmConnection(asset, {
      protocol: saved!.protocol,
      account: saved!.username,
      accountId: (saved as any).accountId,
      accountMode: (saved!.accountMode as any) || "hosted",
      manualUsername: saved!.manualUsername || "",
      manualPassword: saved!.manualPassword || "",
      dynamicPassword: saved!.dynamicPassword || "",
      rememberSecret: !!saved!.rememberSecret,
      availableProtocols: saved!.availableProtocols || []
    });
  }

  try {
    const info = await connEditorRef.value!.open(asset);
    confirmConnection(asset, info);
  } catch (e) {
    console.error(e);
  }
};

/**
 * @description 右键菜单的连接操作
 */
const handleConnectTrigger = (asset: AssetItem) => {
  handleConnectAsset(asset);
};

/**
 * @description 监听 Tauri 事件
 */
const listenTauriEvent = async () => {
  interface eventPayloadType {
    data: string;
    status: number;
  }

  subscribeSettingEvent.value = await useTauriEventListen("get-setting-success", (event) => {
    const payload = event.payload as eventPayloadType;
    const settingConfig = JSON.parse(payload.data) as SettingResponse;

    userInfoStore.setRdpClientOption(settingConfig.graphics);

    setCharsetPreference(
      (settingConfig.command_line?.charset as CharsetType) || "default"
    );
    setBackspacePreference(!!settingConfig.command_line?.is_backspace_as_ctrl_h);
    setRdpResolutionPreference((settingConfig.graphics?.rdp_resolution as ResolutionType) || "auto");
    setKeyboardLayoutPreference(settingConfig.graphics?.keyboard_layout || "en-us-qwerty");
    setRdpClientOptionPreference(settingConfig.graphics?.rdp_client_option || []);
    setRdpColorQualityPreference(settingConfig.graphics?.rdp_color_quality || "32");
    setRdpSmartSizePreference(settingConfig.graphics?.rdp_smart_size || "0");
  });
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
      class="w-full overflow-y-auto container-scrollbar"
      :style="scrollbarStyles"
    >
      <div v-if="!loggedIn" class="w-full h-full flex flex-col items-center justify-center gap-2 p-2">
        <CardLoginCard />
      </div>

      <div
        v-else-if="isInitialLoading"
        class="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] gap-4 p-2"
        aria-busy="true"
      >
        <SkeletonCard />
      </div>

      <div
        v-else-if="visibleAssets && visibleAssets.length === 0"
        class="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-500"
      >
        <UEmpty
          icon="mingcute:inbox-line"
          size="xl"
          variant="naked"
          :ui="{
            avatar: 'bg-transparent size-10'
          }"
          :title="t('Common.NoData')"
          :description="t('Common.EmptyDescription')"
        />
      </div>

      <CardGridCard
        v-else
        :visible-assets="visibleAssets"
        :is-appending="isAppending"
        :append-skeleton-count="appendSkeletonCount"
        @edit-trigger="handleEditTrigger"
        @connect-asset="handleConnectAsset"
        @context-trigger="handleContextTrigger"
        @connect-trigger="handleConnectTrigger"
      />
    </section>

    <section
      v-else-if="layouts === 'table'"
      ref="scrollRef"
      class="w-full overflow-y-auto container-scrollbar h-[calc(100vh-5rem)]"
      :style="scrollbarStyles"
    >
      <div v-if="!loggedIn" class="w-full h-full flex flex-col items-center justify-center gap-2 p-2">
        <CardLoginCard />
      </div>

      <div v-else class="h-full p-2">
        <CardTableCard
          :items="visibleAssets"
          @edit-trigger="handleEditTrigger"
          @connect-asset="handleConnectAsset"
          @context-trigger="handleContextTrigger"
          @connect-trigger="handleConnectTrigger"
        />
      </div>
    </section>

    <ConnectionEditor ref="connEditorRef" />
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
