<script setup lang="ts">
import { useInfiniteScroll } from '@vueuse/core';
import { useAssetManager } from '~/composables/useAssetManager';
import { useUserSettingStore } from '~/store/modules/userSetting';

const { t } = useI18n();

const editModalOpen = ref(false);
const selectedCardIndex = ref<number | null>(null);

const scrollRef = ref<HTMLElement | null>(null);
const sentinelRef = ref<HTMLElement | null>(null);

const providerClearSelection = inject<(cb: () => void) => void>(
  'providerClearSelection'
);

const { componentsConfig } = useAppConfig();
const userSettingStore = useUserSettingStore();

const { layouts } = storeToRefs(userSettingStore);

const assetManager = useAssetManager('database', scrollRef);
const { isLoading, hasMore, assetsData, scrollbarStyles, fetchNextPage } =
  assetManager;

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

onMounted(() => {
  providerClearSelection?.(clearSelectedCard);
});
</script>

<template>
  <div class="relative h-full min-h-0 flex flex-col">
    <div
      ref="scrollRef"
      class="flex-1 min-h-0 overflow-auto p-2 container-scrollbar"
      :style="scrollbarStyles"
    >
      <div
        class="grid gap-2 p-2 grid-cols-[repeat(auto-fit,minmax(360px,_1fr))]"
      >
        <template v-if="layouts === 'grid'">
          <GridCard
            v-for="(item, index) in assetsData"
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

      <div
        class="absolute bottom-8 left-0 flex py-3 w-full justify-center text-xs text-zinc-400 select-none"
      >
        <span v-if="isLoading">{{ t('Loading.Loading') }}</span>
        <span v-else-if="!hasMore">{{ t('Loading.NoMore') }}</span>
        <span v-else>{{ t('Loading.ScrollToLoadMore') }}</span>
      </div>

      <div ref="sentinelRef" style="height: 1px" />
    </div>

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
