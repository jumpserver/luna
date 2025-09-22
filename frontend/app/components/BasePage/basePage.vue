<script setup lang="ts">
import type { AssetItem } from '~/types/index';
import { useUserInfoStore } from '~/store/modules/userInfo';
import { useUserSettingStore } from '~/store/modules/userSetting';

type AssetType = 'linux' | 'windows' | 'database' | 'device';

const props = defineProps<{
  type: AssetType;
}>();

const skeletonCount = 12;

const providerClearSelection = inject<(cb: () => void) => void>(
  'providerClearSelection'
);

const { t } = useI18n();
const { componentsConfig } = useAppConfig();

const editModalOpen = ref(false);
const draftAccount = ref<string>('');
const draftProtocol = ref<string>('');
const scrollRef = ref<HTMLElement | null>(null);
const sentinelRef = ref<HTMLElement | null>(null);
const selectedCardIndex = ref<number | null>(null);
const currentSelectedCardInfo = ref<AssetItem | null>(null);

const assetManager = useAssetManager(props.type, scrollRef);
const userSettingStore = useUserSettingStore();
const userInfoStore = useUserInfoStore();

const { layouts } = storeToRefs(userSettingStore);
const { currentUser } = storeToRefs(userInfoStore);
const { assetsData, scrollbarStyles, isLoading, fetchNextPage } = assetManager;

watch(
  [editModalOpen, currentSelectedCardInfo],
  ([open, info]) => {
    if (open && info) initDraft();
  }
);

function initDraft() {
  const asset = currentSelectedCardInfo.value;
  if (!asset) return;

  const saved = userInfoStore.getConnectionInfoForAsset(asset.id);
  
  draftProtocol.value = saved?.protocol
    ?? asset.permed_protocols?.[0]?.name
    ?? '';
  draftAccount.value = saved?.username
    ?? asset.permed_accounts?.[0]?.username
    ?? '';

  console.log(draftProtocol.value, draftAccount.value);
};

const handleCardClick = (index: number, e: MouseEvent) => {
  e.stopPropagation();
  selectedCardIndex.value = index;
  currentSelectedCardInfo.value = assetsData.value[index]!;

  console.log('currentSelectedCardInfo', currentSelectedCardInfo.value);
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

const modalTitle = computed(() => {
  return `${t('EditModal.ModifyConnectionInfo')} - ${
    currentSelectedCardInfo.value?.assetName
  }`;
});

onMounted(() => {
  fetchNextPage();
  providerClearSelection?.(clearSelectedCard);
});
</script>

<template>
  <div class="relative h-full w-full flex min-h-0">
    <section
      class="w-full overflow-y-auto container-scrollbar h-[calc(100vh-7.5rem)]"
      :style="scrollbarStyles"
    >
      <div
        v-if="isLoading"
        class="grid grid-cols-[repeat(auto-fit,minmax(360px,_1fr))] gap-2 p-2"
        aria-busy="true"
      >
        <UCard
          v-for="i in skeletonCount"
          :key="i"
          variant="outline"
          :ui="{ header: 'p-2', body: 'sm:px-4 sm:py-4' }"
          class="hover:cursor-pointer w-full"
        >
          <section class="flex gap-4 flex-nowrap items-center w-full">
            <USkeleton class="h-10 w-10 rounded-md" />

            <div class="flex flex-col flex-1 gap-2 text-xs-plus">
              <div class="flex justify-between">
                <section class="flex items-center gap-2">
                  <USkeleton class="size-2 rounded-full" />
                  <USkeleton class="h-5 w-2/3" />
                </section>
              </div>

              <USeparator orientation="horizontal" size="sm" class="h-1" />

              <div class="flex items-center gap-2">
                <USkeleton class="h-6 w-28 rounded-md" />
                <USeparator orientation="vertical" size="sm" class="h-4" />
                <USkeleton class="h-6 w-16 rounded-md" />
                <USeparator orientation="vertical" size="sm" class="h-4" />
                <USkeleton class="h-6 w-16 rounded-md" />
                <USeparator orientation="vertical" size="sm" class="h-4" />
                <USkeleton class="h-6 w-14 rounded-md" />
              </div>
            </div>

            <USkeleton class="h-8 w-8 rounded-lg" />
          </section>
        </UCard>
      </div>

      <div
        v-else-if="assetsData && assetsData.length === 0"
        class="w-full h-full flex flex-col items-center justify-center text-gray-500"
      >
        <UIcon name="mingcute:inbox-line" class="size-10" />

        <span class="text-sm"> {{ t('Common.NoData') }} </span>
      </div>

      <div
        v-else
        class="grid grid-cols-[repeat(auto-fit,minmax(360px,_1fr))] gap-2 p-2"
      >
        <template v-if="layouts === 'grid'">
          <GridCard
            v-for="(item, index) in assetsData"
            :key="item.id"
            :asset-id="item.id"
            :zone="item.zone"
            :address="item.address"
            :asset-name="item.assetName"
            :protocol="item.permed_protocols?.[0]?.name"
            :user="item.permed_accounts?.[0]?.username"
            icon-name="si:terminal-alt-fill"
            class="border border-solid"
            :style="{
              borderColor:
                selectedCardIndex === index
                  ? componentsConfig.pages.focusColor
                  : 'transparent',
            }"
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
        :accounts="currentSelectedCardInfo?.permed_accounts"
        :protocols="currentSelectedCardInfo?.permed_protocols"
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
