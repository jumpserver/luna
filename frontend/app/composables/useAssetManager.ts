import type { UnlistenFn } from '@tauri-apps/api/event';
import type { AssetsResponse, RawAssetData } from '~/types';
import { useResizeObserver } from '@vueuse/core';

import { useUserInfoStore } from '~/store/modules/userInfo';

const LIMIT = 20;

export const useAssetManager = (
  assetType: string,
  scrollRef?: Ref<HTMLElement | null>
) => {
  const { t } = useI18n();
  const { componentsConfig } = useAppConfig();

  const toast = useToast();
  const colorMode = useColorMode();
  const userInfoStore = useUserInfoStore();

  const { currentSite, currentUser } = storeToRefs(userInfoStore);

  const offset = ref(0);
  const hasMore = ref(true);
  const isLoading = ref(false);
  const rawAssetsList = ref<RawAssetData[]>([]);
  const subscribeGetAssetsEvent = ref<UnlistenFn | null>(null);
  const subscribeGetAssetFailedEvent = ref<UnlistenFn | null>(null);

  const currentSearch = ref('');
  const currentOrder = ref('');

  const assetsData = computed(() => {
    return transformAssetsData(rawAssetsList.value);
  });

  const scrollbarStyles = computed(() => {
    const isDark = colorMode.value === 'dark';
    return {
      '--scrollbar-width': '8px',
      '--scrollbar-track-color': isDark ? '#333' : '#f1f1f1',
      '--scrollbar-thumb-color': isDark ? '#555' : '#ccc',
      '--scrollbar-thumb-hover-color': componentsConfig.pages.focusColor,
    };
  });

  /**
   * @description 获取下一页资产数据
   */
  const fetchNextPage = async (search?: string, order?: string) => {
    if (isLoading.value || !hasMore.value) return;
    if (!currentSite.value || !currentUser.value?.headerJson) return;

    const searchParam = search !== undefined ? search : currentSearch.value;
    const orderParam = order !== undefined ? order : currentOrder.value;

    currentSearch.value = searchParam;
    currentOrder.value = orderParam;

    isLoading.value = true;

    try {
      await useTauriCoreInvoke('get_assets', {
        site: currentSite.value,
        cookieHeader: currentUser.value.headerJson,
        query: {
          type: assetType,
          offset: offset.value,
          limit: LIMIT,
          search: searchParam,
          order: orderParam,
        },
      });
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * @description 刷新资产数据（重置状态并重新获取）
   */
  const refreshAssets = async (search?: string, order?: string) => {
    const searchParam = search !== undefined ? search : currentSearch.value;
    const orderParam = order !== undefined ? order : currentOrder.value;

    rawAssetsList.value = [];
    offset.value = 0;
    hasMore.value = true;
    await fetchNextPage(searchParam, orderParam);
  };

  /**
   * @description 如果内容不够滚动就自动补页（多次）
   */
  const fillIfNotScrollable = async () => {
    if (!scrollRef?.value) return;

    await nextTick();

    const el = scrollRef.value;
    if (!el || !hasMore.value || isLoading.value) return;

    const currentLength = rawAssetsList.value.length;

    if (el.scrollHeight <= el.clientHeight && hasMore.value) {
      await fetchNextPage();

      await new Promise((resolve) => {
        const unwatch = watch(
          () => rawAssetsList.value.length,
          (newLength) => {
            if (newLength > currentLength || !hasMore.value) {
              unwatch();
              resolve(undefined);
            }
          },
          { immediate: true }
        );

        setTimeout(() => {
          unwatch();
          resolve(undefined);
        }, 3000);
      });

      await nextTick();

      if (el.scrollHeight <= el.clientHeight && hasMore.value) {
        fillIfNotScrollable();
      }
    }
  };

  /**
   * @description 监听 Tauri 事件
   */
  const listenTauriEvent = async () => {
    subscribeGetAssetsEvent.value = await useTauriEventListen(
      'get-asset-success',
      (event) => {
        const resp = JSON.parse(event.payload as string) as AssetsResponse;
        const pageData = resp.results ?? [];

        // 追加到列表
        rawAssetsList.value.push(...pageData);

        offset.value += pageData.length;
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

  /**
   * @description 取消监听 Tauri 事件
   */
  const unListenTauriEvent = () => {
    subscribeGetAssetsEvent.value?.();
    subscribeGetAssetFailedEvent.value?.();
  };

  let unsubscribeSetSort: (() => void) | null = null;
  let unsubscribeRefresh: (() => void) | null = null;
  let unsubscribeSearch: (() => void) | null = null;

  const listenEventBusEvent = () => {
    unsubscribeSetSort = useEventBus().on(
      'setSort',
      (sortOrder) => {
        refreshAssets(currentSearch.value, sortOrder);
      },
      false
    );

    unsubscribeRefresh = useEventBus().on(
      'refresh',
      () => {
        refreshAssets();
      },
      false
    );

    unsubscribeSearch = useEventBus().on(
      'search',
      (search) => {
        refreshAssets(search, currentOrder.value);
      },
      false
    );
  };

  const unListenEventBusEvent = () => {
    unsubscribeSetSort?.();
    unsubscribeRefresh?.();
    unsubscribeSearch?.();
  };

  if (scrollRef) {
    useResizeObserver(scrollRef, fillIfNotScrollable);
  }

  onMounted(async () => {
    listenEventBusEvent();
    await listenTauriEvent();
  });

  onBeforeUnmount(() => {
    unListenTauriEvent();
    unListenEventBusEvent();
  });

  return {
    isLoading,
    hasMore,
    assetsData,
    scrollbarStyles,
    rawAssetsList,

    fetchNextPage,
    refreshAssets,
    fillIfNotScrollable,
  };
};
