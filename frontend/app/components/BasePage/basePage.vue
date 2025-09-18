<script setup lang="ts">
import { useUserSettingStore } from '~/store/modules/userSetting';

type AssetType = 'linux' | 'windows' | 'database' | 'device';

const props = defineProps<{
  type: AssetType;
}>();

const providerClearSelection = inject<(cb: () => void) => void>(
  'providerClearSelection'
);

const { t } = useI18n();
const { componentsConfig } = useAppConfig();

const editModalOpen = ref(false);
const selectedCardIndex = ref<number | null>(null);
const scrollRef = ref<HTMLElement | null>(null);
const sentinelRef = ref<HTMLElement | null>(null);

const assetManager = useAssetManager(props.type, scrollRef);
const userSettingStore = useUserSettingStore();

const { layouts } = storeToRefs(userSettingStore);
const { assetsData, isLoading, hasMore, fetchNextPage, scrollbarStyles } =
  assetManager;

const handleCardClick = (index: number, e: MouseEvent) => {
  e.stopPropagation();
  selectedCardIndex.value = index;
};

const clearSelectedCard = () => {
  selectedCardIndex.value = null;
};

onMounted(() => {
  console.log(props);
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
        v-if="assetsData && assetsData.length > 0"
        class="grid grid-cols-[repeat(auto-fit,minmax(360px,_1fr))] gap-2 p-2"
      >
        <template v-if="layouts === 'grid'">
          <GridCard
            v-for="(item, index) in assetsData"
            :key="item.id"
            :user="item.user"
            :address="item.address"
            :asset-name="item.assetName"
            :protocol="item.protocol"
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

      <div
        v-else
        class="w-full h-full flex flex-col items-center justify-center text-gray-500"
      >
        <UIcon name="mingcute:inbox-line" class="size-10" />

        <span class="text-sm"> No Data </span>
      </div>
    </section>

    <!-- <div
      class="absolute bottom-0 left-0 flex py-3 w-full justify-center text-xs text-zinc-400 select-none"
    >
      <span v-if="isLoading">{{ t('Loading.Loading') }}</span>
      <span v-else-if="!hasMore">{{ t('Loading.NoMore') }}</span>
      <span v-else>{{ t('Loading.ScrollToLoadMore') }}</span>
    </div> -->

    <div ref="sentinelRef" style="height: 1px" />

    <Modal :open="editModalOpen" @update:open="editModalOpen = $event" />
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
