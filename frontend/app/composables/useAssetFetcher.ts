import type { UnlistenFn } from '@tauri-apps/api/event';
import type { AssetsResponse, RawAssetData } from '~/types';

import { useResizeObserver } from '@vueuse/core';
import { useUserInfoStore } from '~/store/modules/userInfo';

const LIMIT = 20;

export const useAssetFetcher = (
  assetType: string,
  scrollRef?: Ref<HTMLElement | null>
) => {
  const { t } = useI18n();
  const { componentsConfig } = useAppConfig();

  const toast = useToast();
  const colorMode = useColorMode();
  const userInfoStore = useUserInfoStore();

  const { setUserLoggedIn, deleteUserData } = userInfoStore;
  const { currentSite, currentUser, orgId } = storeToRefs(userInfoStore);

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
   * @param search
   * @param order
   * @returns
   */
  async function fetchNextPage(search?: string, order?: string) {
    if (isLoading.value || !hasMore.value) return;
    if (!currentSite.value || !currentUser.value?.headerJson) return;
    if (!orgId.value) {
      console.error('No organization ID available for asset request', {
        orgId: orgId.value,
        currentUser: currentUser.value,
      });
      toast.add({
        title: t('Asset.GetAssetFailed'),
        description: 'Organization information is missing',
        color: 'error',
        icon: 'line-md:close-circle',
      });
      return;
    }

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
          org: orgId.value,
        },
      });
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * @description 刷新资产数据（重置状态并重新获取）
   * @param search
   * @param order
   */
  async function refreshAssets(search?: string, order?: string) {
    const searchParam = search !== undefined ? search : currentSearch.value;
    const orderParam = order !== undefined ? order : currentOrder.value;

    rawAssetsList.value = [];
    offset.value = 0;
    hasMore.value = true;
    await fetchNextPage(searchParam, orderParam);
  }

  /**
   * @description 如果内容不够滚动就自动补页（多次）
   */
  const _fillIfNotScrollable = async () => {
    if (!scrollRef?.value) return;

    await nextTick();

    const el = scrollRef.value;
    if (!el || !hasMore.value || isLoading.value) return;

    const currentLength = rawAssetsList.value.length;

    if (el.scrollHeight <= el.clientHeight && hasMore.value) {
      await fetchNextPage();

      await new Promise<void>((resolve) => {
        const unwatch = watch(
          () => rawAssetsList.value.length,
          (newLength: number) => {
            if (newLength > currentLength || !hasMore.value) {
              unwatch();
              resolve();
            }
          },
          { immediate: true }
        );

        setTimeout(() => {
          unwatch();
          resolve();
        }, 3000);
      });

      await nextTick();

      if (el.scrollHeight <= el.clientHeight && hasMore.value) {
        // fillIfNotScrollable();
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
        interface eventPayload {
          status: number;
          data: AssetsResponse;
        }

        const resp = event.payload as eventPayload;
        const pageData = resp.data.results ?? [];

        // 追加到列表
        rawAssetsList.value.push(...pageData);

        offset.value += pageData.length;
        hasMore.value = pageData.length === LIMIT;
      }
    );

    subscribeGetAssetFailedEvent.value = await useTauriEventListen(
      'get-asset-failure',
      (event) => {
        interface eventPayload {
          status: number;
        }

        const payload = event.payload as eventPayload;
        const status = payload.status;

        if (status === 401) {
          toast.add({
            title: t('Login.LoginAuthenticationExpired'),
            color: 'error',
            icon: 'line-md:close-circle',
          });

          nextTick(() => {
            deleteUserData(currentSite.value);
            setUserLoggedIn(false);
          });
        }
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
    const { on } = useEventBus();

    unsubscribeSetSort = on(
      'setSort',
      (sortOrder) => {
        refreshAssets(currentSearch.value, sortOrder as string);
      },
      false
    );

    unsubscribeRefresh = on(
      'refresh',
      () => {
        refreshAssets();
      },
      false
    );

    unsubscribeSearch = on(
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

  // if (scrollRef) {
  //   useResizeObserver(scrollRef, fillIfNotScrollable);
  // }

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
  };
};
