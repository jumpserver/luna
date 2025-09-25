<script setup lang="ts">
import type { UnlistenFn } from '@tauri-apps/api/event';
import type { AssetItem, SettingResponse } from '~/types/index';

import { useUserInfoStore } from '~/store/modules/userInfo';
import { useUserSettingStore } from '~/store/modules/userSetting';

type AssetType = 'linux' | 'windows' | 'database' | 'device';

const props = defineProps<{
  type: AssetType;
  iconName: string;
}>();

const skeletonCount = 12;

const providerClearSelection = inject<(cb: () => void) => void>(
  'providerClearSelection'
);

const { t, locale } = useI18n();

const editModalOpen = ref(false);
const draftAccount = ref<string>('');
const draftProtocol = ref<string>('');
const scrollRef = ref<HTMLElement | null>(null);
const sentinelRef = ref<HTMLElement | null>(null);
const selectedCardIndex = ref<number | null>(null);
const currentSelectedCardInfo = ref<AssetItem | null>(null);
const subscribeSettingEvent = ref<UnlistenFn | null>(null);

const userInfoStore = useUserInfoStore();
const userSettingStore = useUserSettingStore();
const assetManager = useAssetFetcher(props.type, scrollRef);

const { layouts } = storeToRefs(userSettingStore);
const { loggedIn, currentSite, currentUser } = storeToRefs(userInfoStore);
const { assetsData, scrollbarStyles, isLoading, fetchNextPage } = assetManager;

watch([editModalOpen, currentSelectedCardInfo], ([open, info]) => {
  if (open && info) initDraft();
});

function initDraft() {
  const asset = currentSelectedCardInfo.value;
  if (!asset) return;

  const saved = userInfoStore.getConnectionInfoForAsset(asset.id);

  draftProtocol.value =
    saved?.protocol ?? asset.permed_protocols?.[0]?.name ?? '';
  draftAccount.value =
    saved?.username ?? asset.permed_accounts?.[0]?.username ?? '';
}

const handleCardClick = (index: number, e: MouseEvent) => {
  e.stopPropagation();
  selectedCardIndex.value = index;
  currentSelectedCardInfo.value = assetsData.value[index]!;
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

const getSettings = async () => {
  await useTauriCoreInvoke('get_setting', {
    site: currentSite.value,
    cookieHeader: currentUser.value!.headerJson,
  });
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
  getSettings();
  fetchNextPage();
  listenTauriEvent();
  providerClearSelection?.(clearSelectedCard);
});

onBeforeUnmount(() => {
  if (subscribeSettingEvent.value) {
    subscribeSettingEvent.value();
  }
});

// Keep skeleton label width aligned with GridCard
const labelMinWidth = computed(() =>
  locale.value.startsWith('zh') ? '24px' : '72px'
);

const labelColumnTemplate = computed(
  () => `minmax(${labelMinWidth.value}, max-content) 1fr`
);
</script>

<template>
  <div class="relative h-full w-full flex min-h-0">
    <section
      class="w-full overflow-y-auto container-scrollbar h-[calc(100vh-7.5rem)]"
      :style="scrollbarStyles"
    >
      <div
        v-if="isLoading"
        class="grid grid-cols-[repeat(auto-fit,minmax(360px,_1fr))] gap-4 p-2"
        aria-busy="true"
      >
        <UPageCard
          v-for="i in skeletonCount"
          :key="i"
          variant="subtle"
          :ui="{ body: 'sm:p-2' }"
          class="w-full"
        >
          <section class="flex gap-4 flex-nowrap items-center w-full">
            <div class="flex items-center w-full gap-1">
              <div class="flex flex-col flex-1 gap-1 text-xs-plus min-w-0">
                <div class="flex justify-between">
                  <section class="flex">
                    <div class="flex items-center gap-2">
                      <USkeleton class="h-10 w-10 rounded-md" />
                      <USkeleton class="h-5 w-2/3" />
                    </div>
                  </section>

                  <section class="flex items-center gap-2">
                    <USkeleton class="h-8 w-8 rounded-lg" />
                    <USkeleton class="h-8 w-8 rounded-lg" />
                  </section>
                </div>

                <USeparator orientation="horizontal" size="md" class="h-2" />

                <div class="flex flex-col gap-1 text-xs-plus">
                  <div
                    class="grid items-center gap-x-3 gap-y-1"
                    :style="{ gridTemplateColumns: labelColumnTemplate }"
                  >
                    <span class="text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                      <USkeleton class="h-4 w-16" />
                    </span>
                    <div class="min-w-0">
                      <USkeleton class="h-4 w-3/4" />
                    </div>
                  </div>

                  <div
                    class="grid items-center gap-x-3 gap-y-1"
                    :style="{ gridTemplateColumns: labelColumnTemplate }"
                  >
                    <span class="text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                      <USkeleton class="h-4 w-16" />
                    </span>
                    <div class="min-w-0">
                      <USkeleton class="h-4 w-2/3" />
                    </div>
                  </div>

                  <div
                    class="grid items-center gap-x-3 gap-y-1"
                    :style="{ gridTemplateColumns: labelColumnTemplate }"
                  >
                    <span class="text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                      <USkeleton class="h-4 w-16" />
                    </span>
                    <div class="min-w-0">
                      <USkeleton class="h-4 w-1/2" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </UPageCard>
      </div>

      <div
        v-else-if="assetsData && assetsData.length === 0"
        class="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-500"
      >
        <template v-if="loggedIn">
          <UIcon name="mingcute:inbox-line" class="size-10" />

          <span class="text-sm"> {{ t('Common.NoData') }} </span>
        </template>

        <template v-else>
          <UIcon name="cuida:login-outline" class="size-10" />

          <span class="text-sm"> {{ t('Common.NoDataDescription') }} </span>
        </template>
      </div>

      <div
        v-else
        class="grid grid-cols-[repeat(auto-fit,minmax(360px,_1fr))] gap-4 p-2"
      >
        <template v-if="layouts === 'grid'">
          <GridCard
            v-for="(item, index) in assetsData"
            :key="item.id"
            :zone="item.zone"
            :asset-id="item.id"
            :icon-name="iconName"
            :address="item.address"
            :asset-name="item.assetName"
            :accounts="item.permed_accounts || []"
            :protocols="item.permed_protocols || []"
            :protocol="item.permed_protocols?.[0]?.name || ''"
            :user="item.permed_accounts?.[0]?.username || ''"
            :highlight="selectedCardIndex === index"
            @open-edit-modal="editModalOpen = true"
            @click="handleCardClick(index, $event)"
          />
        </template>
        <template v-else>
          <TableCard />
        </template>
      </div>
    </section>

    <div ref="sentinelRef" style="height: 1px" />

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
