import type { UnlistenFn } from '@tauri-apps/api/event';
import type { AssetsResponse, RawAssetData } from '~/types';

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

  const totalCount = ref(0);
  const currentOrder = ref('');
  const currentSearch = ref('');

  let stopScrollListener: (() => void) | null = null;

  const assetsData = computed(() => {
    return transformAssetsData(rawAssetsList.value);
  });

  const isAppending = computed(
    () => isLoading.value && rawAssetsList.value.length > 0
  );

  const isInitialLoading = computed(
    () => isLoading.value && rawAssetsList.value.length === 0
  );

  const appendSkeletonCount = computed(() => {
    if (!(isLoading.value && rawAssetsList.value.length > 0)) return 0;

    const remaining = Math.max(
      0,
      (totalCount.value || 0) - rawAssetsList.value.length
    );

    const expected = totalCount.value ? Math.min(LIMIT, remaining) : LIMIT;
    return expected || LIMIT;
  });

  const scrollbarStyles = computed(() => {
    const isDark = colorMode.value === 'dark';
    return {
      '--scrollbar-width': '8px',
      '--scrollbar-track-color': isDark ? '#333' : '#f1f1f1',
      '--scrollbar-thumb-color': isDark
        ? componentsConfig.pages.scrollBarDarkThumbColor
        : componentsConfig.pages.scrollBarLightThumbColor,
      '--scrollbar-thumb-hover-color': isDark
        ? componentsConfig.pages.scrollBarDarkHoverColor
        : componentsConfig.pages.scrollBarLightHoverColor,
    };
  });

  watchEffect((onCleanup) => {
    if (hasMore.value && scrollRef?.value) {
      ensureScrollListener();
    } else {
      stopScrollListener?.();
      stopScrollListener = null;
    }

    onCleanup(() => {
      stopScrollListener?.();
      stopScrollListener = null;
    });
  });

  function ensureScrollListener() {
    if (!scrollRef?.value) return;
    if (stopScrollListener) return;

    const el = scrollRef.value!;
    const onScroll = () => {
      if (!hasMore.value || isLoading.value) return;

      const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;

      if (distanceToBottom <= 50) {
        fetchNextPage();
      }
    };

    el.addEventListener('scroll', onScroll, { passive: true });

    stopScrollListener = () => {
      el.removeEventListener('scroll', onScroll);
      stopScrollListener = null;
    };
  }

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
        favorite: assetType === 'favorite' ? true : false,
        query: {
          type: assetType === 'favorite' ? undefined : assetType,
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
    stopScrollListener?.();
    stopScrollListener = null;

    const searchParam = search !== undefined ? search : currentSearch.value;
    const orderParam = order !== undefined ? order : currentOrder.value;

    rawAssetsList.value = [];
    offset.value = 0;
    hasMore.value = true;
    totalCount.value = 0;
    await fetchNextPage(searchParam, orderParam);
  }

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
        let pageData = resp.data.results ?? [];

        // 若返回超过 LIMIT，仅取前 LIMIT 条
        if (pageData.length > LIMIT) pageData = pageData.slice(0, LIMIT);

        // 追加到列表
        rawAssetsList.value.push(...pageData);

        // 更新偏移量
        offset.value += pageData.length;

        // 根据返回的总数更新 hasMore（若没有提供 count，则退化为当前长度）
        // prettier-ignore
        totalCount.value = (resp.data.count ?? rawAssetsList.value.length) as number;
        hasMore.value = rawAssetsList.value.length < totalCount.value;
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

  let unsubscribeSearch: (() => void) | null = null;
  let unsubscribeSetSort: (() => void) | null = null;
  let unsubscribeRefresh: (() => void) | null = null;
  let unsubscribeClearAssets: (() => void) | null = null;

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

    unsubscribeClearAssets = on('clearAssets', () => {
      hasMore.value = true;

      offset.value = 0;
      totalCount.value = 0;
      rawAssetsList.value = [];

      stopScrollListener?.();
      stopScrollListener = null;
    });
  };

  const unListenEventBusEvent = () => {
    unsubscribeSearch?.();
    unsubscribeSetSort?.();
    unsubscribeRefresh?.();
    unsubscribeClearAssets?.();
  };

  onMounted(async () => {
    listenEventBusEvent();
    await listenTauriEvent();
  });

  onBeforeUnmount(() => {
    unListenTauriEvent();
    unListenEventBusEvent();
    stopScrollListener?.();
    stopScrollListener = null;
  });

  return {
    hasMore,
    isLoading,

    assetsData,
    isAppending,
    rawAssetsList,
    scrollbarStyles,
    isInitialLoading,
    appendSkeletonCount,

    fetchNextPage,
    refreshAssets,
  };
};
