<script setup lang="ts">
import type { UnlistenFn } from '@tauri-apps/api/event';
import type { layoutsType } from '~/store/modules/userSetting';

import type { AssetItem, SettingResponse } from '~/types/index';
import { useUserInfoStore } from '~/store/modules/userInfo';
import { useUserSettingStore } from '~/store/modules/userSetting';

type AssetType = 'linux' | 'windows' | 'database' | 'device' | 'favorite';

const props = defineProps<{
  type: AssetType;
  iconName: string;
  platform?: string;
}>();

const providerClearSelection = inject<(cb: () => void) => void>(
  'providerClearSelection'
);

const { t } = useI18n();

const editModalOpen = ref(false);
const draftAccount = ref<string>('');
const draftProtocol = ref<string>('');
const scrollRef = ref<HTMLElement | null>(null);
const selectedCardIndex = ref<number | null>(null);
const currentSelectedCardInfo = ref<AssetItem | null>(null);
const subscribeSettingEvent = ref<UnlistenFn | null>(null);

const userInfoStore = useUserInfoStore();
const userSettingStore = useUserSettingStore();
const assetManager = useAssetFetcher(props.type, scrollRef);

const { layouts } = storeToRefs(userSettingStore);
const { loggedIn, currentSite, currentUser } = storeToRefs(userInfoStore);
const {
  assetsData,
  isAppending,
  fetchNextPage,
  scrollbarStyles,
  isInitialLoading,
  appendSkeletonCount,
} = assetManager;

const visibleAssets = computed(() => {
  if (!props.platform || props.platform === 'all') return assetsData.value;
  return assetsData.value.filter(
    (item: AssetItem) => item.platform === props.platform
  );
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
      useEventBus().emit('loaded', undefined);
    }
  }
);

function initDraft() {
  const asset = currentSelectedCardInfo.value;
  if (!asset) return;

  const saved = userInfoStore.getConnectionInfoForAsset(asset.id);

  draftProtocol.value =
    saved?.protocol ?? asset.permed_protocols?.[0]?.name ?? '';
  draftAccount.value =
    saved?.username ?? asset.permed_accounts?.[0]?.username ?? '';
}

async function getSettings() {
  await useTauriCoreInvoke('get_setting', {
    site: currentSite.value,
    cookieHeader: currentUser.value!.headerJson,
  });
}

const handleCardClick = (index: number, e: MouseEvent) => {
  e.stopPropagation();
  selectedCardIndex.value = index;
  currentSelectedCardInfo.value = visibleAssets.value[index]!;
};

const clearSelectedCard = () => {
  selectedCardIndex.value = null;
};

const handleConfirm = () => {
  const asset = currentSelectedCardInfo.value;
  if (!asset) return;

  userInfoStore.setConnectionInfoForAsset(asset.id, {
    protocol: draftProtocol.value || '',
    username: draftAccount.value || '',
  });

  editModalOpen.value = false;
};

const listenTauriEvent = async () => {
  interface eventPayloadType {
    data: string;
    status: number;
  }

  subscribeSettingEvent.value = await useTauriEventListen(
    'get-setting-success',
    (event) => {
      const payload = event.payload as eventPayloadType;
      const settingConfig = JSON.parse(payload.data) as SettingResponse;

      userInfoStore.setRdpClientOption(settingConfig.graphics);
    }
  );
};

const modalTitle = computed(() => {
  return `${t('EditModal.ModifyConnectionInfo')} - ${
    currentSelectedCardInfo.value?.assetName
  }`;
});

onMounted(() => {
  listenTauriEvent();
  providerClearSelection?.(clearSelectedCard);
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
      class="w-full overflow-y-auto container-scrollbar h-[calc(100vh-7.5rem)]"
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
        <span class="text-sm"> {{ t('Common.NoData') }} </span>
      </div>

      <div
        v-else
        class="grid grid-cols-[repeat(auto-fit,minmax(360px,_1fr))] gap-4 p-2"
      >
        <CardGridCard
          v-for="(item, index) in visibleAssets"
          :key="item.id"
          :zone="item.zone"
          :asset-id="item.id"
          :icon-name="iconName"
          :address="item.address"
          :is-active="item.isActive"
          :asset-name="item.assetName"
          :accounts="item.permed_accounts || []"
          :protocols="item.permed_protocols || []"
          :protocol="item.permed_protocols?.[0]?.name || ''"
          :user="item.permed_accounts?.[0]?.username || ''"
          :highlight="selectedCardIndex === index"
          @open-edit-modal="editModalOpen = true"
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
          @open-edit-modal="(asset: AssetItem) => { currentSelectedCardInfo.value = asset; editModalOpen.value = true }"
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
        :accounts="currentSelectedCardInfo.permed_accounts!"
        :protocols="currentSelectedCardInfo.permed_protocols!"
      />
    </Modal>
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
