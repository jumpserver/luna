<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import type { AssetItem } from '~/types/index';

import { useInfiniteScroll } from '@vueuse/core';
import { useUserSettingStore } from '~/store/modules/userSetting';

const { t } = useI18n();
const { componentsConfig } = useAppConfig();
const userSettingStore = useUserSettingStore();
const { layouts } = storeToRefs(userSettingStore);

const editModalOpen = ref(false);
const selectedCardIndex = ref<number | null>(null);

const scrollRef = ref<HTMLElement | null>(null);
const sentinelRef = ref<HTMLElement | null>(null);

const providerClearSelection = inject<(cb: () => void) => void>(
  'providerClearSelection'
);

const assetManager = useAssetFetcher('database', scrollRef);
const { isLoading, hasMore, assetsData, fetchNextPage, scrollbarStyles } =
  assetManager;

const tabItems = computed(() => {
  if (!assetsData.value || assetsData.value.length === 0) {
    return [
      {
        label: '全部',
        value: 'all',
      },
    ];
  }

  const uniquePlatforms = new Set<string>();
  assetsData.value.forEach((item: AssetItem) => {
    const platformName = item.platform;
    if (platformName) {
      uniquePlatforms.add(platformName);
    }
  });

  // 转换为 tab 项目格式，添加"全部"选项
  const tabs = [
    {
      label: '全部',
      value: 'all',
    },
  ];

  Array.from(uniquePlatforms).forEach((platformName) => {
    tabs.push({
      label: platformName,
      value: platformName,
    });
  });

  return tabs;
});
const currentTab = ref('all');

const filteredAssetsData = computed(() => {
  if (currentTab.value === 'all' || !currentTab.value) {
    return assetsData.value;
  }

  return assetsData.value.filter((item: AssetItem) => {
    return item.platform === currentTab.value;
  });
});

console.log('筛选后的数据:', filteredAssetsData.value);

const handleCardClick = (index: number, e: MouseEvent) => {
  e.stopPropagation();
  selectedCardIndex.value = index;
};

const clearSelectedCard = () => {
  selectedCardIndex.value = null;
};

/**
 * @description 哨兵进入视口：预取下一页
 */
useIntersectionObserver(
  sentinelRef,
  ([entry]) => {
    if (entry!.isIntersecting && hasMore.value && !isLoading.value) {
      fetchNextPage();
    }
  },
  { root: scrollRef, rootMargin: '200px', threshold: 0 }
);

useInfiniteScroll(scrollRef, () => fetchNextPage(), {
  distance: 200,
  canLoadMore: () => hasMore.value && !isLoading.value,
});

onMounted(async () => {
  fetchNextPage();
  providerClearSelection?.(clearSelectedCard);
});
</script>

<template>
  <div class="relative h-full flex min-h-0">
    <UTabs
      v-model="currentTab"
      orientation="vertical"
      variant="link"
      :items="tabItems"
      class="w-full h-full items-start"
    >
      <template #content>
        <div
          class="overflow-y-auto container-scrollbar h-[calc(100vh-7.5rem)]"
          :style="scrollbarStyles"
        >
          <div
            class="grid grid-cols-[repeat(auto-fit,minmax(360px,_1fr))] gap-2 p-2"
          >
            <template v-if="layouts === 'grid'">
              <GridCard
                v-for="(item, index) in filteredAssetsData"
                :key="item.id"
                :user="item.user"
                :address="item.address"
                :asset-name="item.assetName"
                :protocol="item.protocol"
                icon-name="lets-icons:database-fill"
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
        </div>
      </template>
    </UTabs>

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
