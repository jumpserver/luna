<script setup lang="ts">
import {
  useIntersectionObserver,
  useResizeObserver,
  useInfiniteScroll,
} from '@vueuse/core';

import { useUserInfoStore } from '~/store/modules/userInfo';
import { useUserSettingStore } from '~/store/modules/userSetting';
import { transformAssetsData } from '~/utils';
import type { UnlistenFn } from '@tauri-apps/api/event';
import type { AssetItem, RawAssetData, AssetsResponse } from '~/types';

const LIMIT = 20;
const offset = ref(0);
const hasMore = ref(true);
const isLoading = ref(false);

const showEmpty = ref(false);
const editModalOpen = ref(false);
const selectedCardIndex = ref<number | null>(null);

const scrollRef = ref<HTMLElement | null>(null);
const sentinelRef = ref<HTMLElement | null>(null);
const subscribeGetAssetsEvent = ref<UnlistenFn | null>(null);
const subscribeGetAssetFailedEvent = ref<UnlistenFn | null>(null);

const rawAssetsList = ref<RawAssetData[]>([]);
const providerClearSelection = inject<(cb: () => void) => void>(
  'providerClearSelection'
);

const { t } = useI18n();
const toast = useToast();
const colorMode = useColorMode();
const { componentsConfig } = useAppConfig();

const userInfoStore = useUserInfoStore();
const userSettingStore = useUserSettingStore();
const { layouts } = storeToRefs(userSettingStore);
const { loggedIn, currentSite, currentUser } = storeToRefs(userInfoStore);

const transformedAssets = computed<AssetItem[]>(() =>
  transformAssetsData(rawAssetsList.value)
);

const scrollbarStyles = computed(() => {
  const isDark = colorMode.value === 'dark';
  return {
    '--scrollbar-width': '8px',
    '--scrollbar-track-color': isDark ? '#333' : '#f1f1f1',
    '--scrollbar-thumb-color': isDark ? '#555' : '#ccc',
    '--scrollbar-thumb-hover-color': componentsConfig.pages.focusColor,
  };
});

const fetchNextPage = async () => {
  if (isLoading.value || !hasMore.value) return;
  if (!currentSite.value || !currentUser.value?.headerJson) return;

  isLoading.value = true;
  try {
    await useTauriCoreInvoke('get_assets', {
      site: currentSite.value,
      cookieHeader: currentUser.value.headerJson,
      query: {
        type: 'linux',
        offset: offset.value,
        limit: LIMIT,
        search: '',
        order: '',
      },
    });
  } finally {
    isLoading.value = false;
  }
};

watch(
  () => loggedIn.value,
  async (login: boolean) => {
    if (!login) {
      showEmpty.value = true;
      return;
    }

    rawAssetsList.value = [];
    offset.value = 0;
    hasMore.value = true;
    await fetchNextPage();
    await fillIfNotScrollable();
  },
  { immediate: true }
);

const listenTauriEvent = async () => {
  subscribeGetAssetsEvent.value = await useTauriEventListen(
    'get-asset-success',
    (event) => {
      const resp = JSON.parse(event.payload as string) as AssetsResponse;
      const pageData = resp.results ?? [];

      // 追加到列表
      rawAssetsList.value.push(...pageData);

      // 推进 offset
      offset.value += LIMIT;
      hasMore.value = pageData.length === LIMIT;
    }
  );

  subscribeGetAssetFailedEvent.value = await useTauriEventListen(
    'get-asset-failure',
    () => {
      toast.add({
        title: t('Asset.GetAssetFailed'),
        color: 'error',
        icon: 'line-md:close-circle',
      });
    }
  );
};

const unListenTauriEvent = () => {
  subscribeGetAssetsEvent.value?.();
  subscribeGetAssetFailedEvent.value?.();
};

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

/**
 * @description 如果内容不够滚动就自动补页（多次）
 */
const fillIfNotScrollable = async () => {
  await nextTick();

  const el = scrollRef.value;
  if (!el || !hasMore.value || isLoading.value) return;

  while (el.scrollHeight <= el.clientHeight && hasMore.value) {
    await fetchNextPage();
    await nextTick();
  }
};

useResizeObserver(scrollRef, fillIfNotScrollable);

useInfiniteScroll(scrollRef, () => fetchNextPage(), {
  distance: 200,
  canLoadMore: () => hasMore.value && !isLoading.value,
});

onMounted(async () => {
  await listenTauriEvent();
  providerClearSelection?.(clearSelectedCard);
});

onBeforeUnmount(unListenTauriEvent);
</script>

<template>
  <div class="relative h-full min-h-0 flex flex-col">
    <div
      ref="scrollRef"
      class="flex-1 min-h-0 overflow-auto p-2 container-scrollbar"
      :style="scrollbarStyles"
    >
      <div
        class="mx-auto max-w-[1200px] grid gap-2 [grid-template-columns:repeat(3,minmax(360px,1fr))]"
      >
        <template v-if="layouts === 'grid'">
          <GridCard
            v-for="(item, index) in transformedAssets"
            :key="item.id"
            :user="item.user"
            :address="item.address"
            :asset-name="item.assetName"
            :protocol="item.protocol"
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

      <div ref="sentinelRef" style="height: 1px"></div>
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
