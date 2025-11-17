import type { UnlistenFn } from "@tauri-apps/api/event";
import type { AssetsResponse, PermedAccount, PermedProtocol, RawAssetData } from "~/types";

import { useUserInfoStore } from "~/store/modules/userInfo";

const LIMIT = 20;

export const useAssetFetcher = (assetType: string, scrollRef?: Ref<HTMLElement | null>) => {
  const { t } = useI18n();
  const { componentsConfig } = useAppConfig();

  const toast = useToast();
  const route = useRoute();
  const colorMode = useColorMode();
  const userInfoStore = useUserInfoStore();

  const { deleteUserData } = userInfoStore;
  const { currentSite, currentUser, orgId } = storeToRefs(userInfoStore);

  const offset = ref(0);
  const hasMore = ref(true);
  const getDetail = ref(false);
  const isLoading = ref(false);
  const rawAssetsList = ref<RawAssetData[]>([]);
  const lastDetailAssetId = ref<string | null>(null);
  const subscribeGetAssetsEvent = ref<UnlistenFn | null>(null);
  const subscribeGetAssetFailedEvent = ref<UnlistenFn | null>(null);
  const subscribeGetFavoriteAssetsEvent = ref<UnlistenFn | null>(null);

  const totalCount = ref(0);
  const currentOrder = ref("");
  const currentSearch = ref("");

  let stopResizeObserver: (() => void) | null = null;
  let stopScrollListener: (() => void) | null = null;

  const favoriteSet = ref<Set<string>>(new Set());

  const assetsData = computed(() => {
    const list = transformAssetsData(rawAssetsList.value);
    return list.map((a) => ({ ...a, isFavorite: favoriteSet.value.has(a.id) }));
  });

  const isAppending = computed(() => isLoading.value && rawAssetsList.value.length > 0);

  const isInitialLoading = computed(() => isLoading.value && rawAssetsList.value.length === 0);

  const appendSkeletonCount = computed(() => {
    return 1;
  });

  const scrollbarStyles = computed(() => {
    const isDark = colorMode.value === "dark";
    return {
      "--scrollbar-width": "8px",
      "--scrollbar-track-color": isDark ? "#333" : "#f1f1f1",
      "--scrollbar-thumb-color": isDark
        ? componentsConfig.pages.scrollBarDarkThumbColor
        : componentsConfig.pages.scrollBarLightThumbColor,
      "--scrollbar-thumb-hover-color": isDark
        ? componentsConfig.pages.scrollBarDarkHoverColor
        : componentsConfig.pages.scrollBarLightHoverColor
    };
  });

  watchEffect((onCleanup) => {
    if (hasMore.value && scrollRef?.value) {
      ensureScrollListener();
      clientResizeObserver();
    } else {
      stopScrollListener?.();
      stopResizeObserver?.();

      stopResizeObserver = null;
      stopScrollListener = null;
    }

    onCleanup(() => {
      stopScrollListener?.();
      stopResizeObserver?.();

      stopResizeObserver = null;
      stopScrollListener = null;
    });
  });

  function prefetchToFill() {
    if (!scrollRef?.value) return;

    const el = scrollRef.value;
    const notScrollable = el.scrollHeight <= el.clientHeight + 1;

    // 如果不可滚动,且还有数据,继续请求下一页
    if (notScrollable && hasMore.value && !isLoading.value) {
      fetchNextPage(currentSearch.value, currentOrder.value);
    }
  }

  function ensureScrollListener() {
    if (!scrollRef?.value) return;
    if (stopScrollListener) return;

    const el = scrollRef.value!;
    const onScroll = () => {
      if (!hasMore.value || isLoading.value) return;

      // 元素内容的总高度 - 元素内容被卷起（向上滚动）的距离 - 元素可视区域的高度
      const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;

      if (distanceToBottom <= 50) {
        fetchNextPage();
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });

    stopScrollListener = () => {
      el.removeEventListener("scroll", onScroll);
      stopScrollListener = null;
    };
  }

  function clientResizeObserver() {
    if (!scrollRef?.value || stopResizeObserver) return;

    const el = scrollRef.value;
    const resizeObserver = new ResizeObserver(() => {
      if (!isLoading.value) prefetchToFill();
    });

    resizeObserver.observe(el);

    stopResizeObserver = () => {
      resizeObserver.disconnect();
      stopResizeObserver = null;
    };
  }

  /**
   * @description 开始加载
   */
  const beginLoading = () => {
    isLoading.value = true;

    try {
      useEventBus().emit("loading", undefined);
    } catch {}
  };

  /**
   * @description 结束加载
   */
  const endLoading = () => {
    isLoading.value = false;
    nextTick(() => {
      try {
        useEventBus().emit("loaded", undefined);
        prefetchToFill();
      } catch {}
    });
  };

  /**
   * @description 判断是否为当前路由
   * @returns
   */
  const isActiveForCurrentRoute = () => {
    const pathLower = route.path.toLowerCase();

    switch (assetType) {
      case "favorite":
        return /\/favorite(?:\/|$)/.test(pathLower);
      case "linux":
        return /\/linux(?:\/|$)/.test(pathLower);
      case "windows":
        return /\/windows(?:\/|$)/.test(pathLower);
      case "database":
        return /\/database(?:\/|$)/.test(pathLower);
      case "device":
        return /\/device(?:\/|$)/.test(pathLower);
      default:
        return true;
    }
  };

  /**
   * @description 根据资产类型过滤结果
   * @param items
   * @returns
   */
  const filterResultsByAssetType = (items: RawAssetData[]) => {
    switch (assetType) {
      case "favorite":
        return items;
      case "linux":
        return items.filter((it) => {
          const typeValue = it.type?.value?.toLowerCase();
          return typeValue === "linux";
        });
      case "windows":
        return items.filter((it) => {
          const typeValue = it.type?.value?.toLowerCase();
          return typeValue === "windows";
        });
      case "database":
        return items.filter((it) => {
          const typeValue = it.category?.value?.toLowerCase();
          return typeValue === "database";
        });
      case "device":
        return items.filter((it) => {
          const typeValue = it.category?.value?.toLowerCase();
          return typeValue === "device";
        });
      default:
        return items;
    }
  };

  /**
   * @description 追加页码数据
   * @param pageData
   * @param count
   */
  const appendPageData = (pageData: RawAssetData[], count?: number | null) => {
    // 如果大于 20 条那么只显示 20 条
    if (pageData.length > LIMIT) pageData = pageData.slice(0, LIMIT);

    rawAssetsList.value.push(...pageData);
    offset.value += pageData.length;
    totalCount.value = (count ?? rawAssetsList.value.length) as number;
    hasMore.value = rawAssetsList.value.length < totalCount.value;
  };

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
      console.error("No organization ID available for asset request", {
        orgId: orgId.value,
        currentUser: currentUser.value
      });
      toast.add({
        title: t("Asset.GetAssetFailed"),
        description: "Organization information is missing",
        color: "error",
        icon: "line-md:close-circle"
      });
      return;
    }

    const searchParam = search !== undefined ? search : currentSearch.value;
    const orderParam = order !== undefined ? order : currentOrder.value;

    currentSearch.value = searchParam;
    currentOrder.value = orderParam;

    beginLoading();

    try {
      await useTauriCoreInvoke("get_assets", {
        site: currentSite.value,
        cookieHeader: currentUser.value.headerJson,
        favorite: assetType === "favorite",
        query: {
          type: assetType === "favorite" ? undefined : assetType,
          offset: offset.value,
          limit: LIMIT,
          search: searchParam,
          order: orderParam,
          oid: orgId.value
        }
      });
    } catch {
      endLoading();
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
    subscribeGetAssetsEvent.value = await useTauriEventListen("get-asset-success", (event) => {
      interface eventPayload {
        status: number;
        data: AssetsResponse;
      }

      if (!isLoading.value) return;
      if (!isActiveForCurrentRoute()) return;

      const resp = event.payload as eventPayload;
      const filtered = filterResultsByAssetType(resp.data.results ?? []);

      appendPageData(filtered, resp.data.count);

      nextTick(() => {
        endLoading();
      });
    });

    subscribeGetAssetFailedEvent.value = await useTauriEventListen("get-asset-failure", (event) => {
      interface eventPayload {
        status: number;
      }

      const payload = event.payload as eventPayload;
      const status = payload.status;

      if (status === 401) {
        toast.add({
          title: t("Login.LoginAuthenticationExpired"),
          description: t("Login.LoginAuthenticationExpiredDescription"),
          color: "error",
          icon: "line-md:close-circle"
        });

        nextTick(() => {
          deleteUserData(currentSite.value);
        });
      }

      nextTick(() => {
        endLoading();
      });
    });

    subscribeGetFavoriteAssetsEvent.value = await useTauriEventListen("get-favorite-assets-success", async (event) => {
      interface payLoadType {
        status: number;
        data: string;
      }

      const payload = event.payload as payLoadType;
      const favoriteAssets = JSON.parse(payload.data as string) as Array<{ asset: string }>;

      try {
        const ids = (favoriteAssets || []).map((x) => x?.asset).filter(Boolean) as string[];
        favoriteSet.value = new Set(ids);
      } catch (e) {
        console.warn("Failed to update favorites", e);
      }
    });
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
  let unsubscribeAssetDetailUpdated: (() => void) | null = null;
  let unsubscribeAssetRenamed: (() => void) | null = null;
  let unsubscribeFavoriteChanged: (() => void) | null = null;

  const listenEventBusEvent = () => {
    const { on } = useEventBus();

    unsubscribeSetSort = on(
      "setSort",
      (sortOrder) => {
        refreshAssets(currentSearch.value, sortOrder as string);
      },
      false
    );

    unsubscribeRefresh = on(
      "refresh",
      () => {
        refreshAssets();
      },
      false
    );

    unsubscribeSearch = on(
      "search",
      (search) => {
        refreshAssets(search, currentOrder.value);
      },
      false
    );

    unsubscribeClearAssets = on("clearAssets", () => {
      hasMore.value = true;

      offset.value = 0;
      totalCount.value = 0;
      rawAssetsList.value = [];

      stopScrollListener?.();
      stopScrollListener = null;
    });

    unsubscribeAssetDetailUpdated = on(
      "assetDetailUpdated",
      (payload: { assetId: string; permedAccounts: PermedAccount[]; permedProtocols: PermedProtocol[] }) => {
        const idx = rawAssetsList.value.findIndex((a) => a.id === payload.assetId);

        if (idx !== -1) {
          rawAssetsList.value[idx] = {
            ...rawAssetsList.value[idx],
            permedAccounts: payload.permedAccounts || [],
            permedProtocols: payload.permedProtocols || []
          } as RawAssetData;
        }

        // 记录 assetID
        lastDetailAssetId.value = payload.assetId;

        nextTick(() => {
          getDetail.value = true;
        });
      },
      false
    );

    unsubscribeAssetRenamed = on(
      "assetRenamed",
      (payload: { assetId: string; name: string }) => {
        const idx = rawAssetsList.value.findIndex((a) => a.id === payload.assetId);

        if (idx !== -1) {
          rawAssetsList.value[idx] = {
            ...rawAssetsList.value[idx],
            name: payload.name
          } as RawAssetData;
        }
      },
      false
    );

    unsubscribeFavoriteChanged = on(
      "favoriteChanged",
      (payload: { assetId: string; favorite: boolean }) => {
        const set = new Set(favoriteSet.value);

        if (payload.favorite) {
          set.add(payload.assetId);
        } else {
          set.delete(payload.assetId);

          if (assetType === "favorite" && isActiveForCurrentRoute()) {
            refreshAssets();
          }
        }

        favoriteSet.value = set;
      },
      false
    );
  };

  const unListenEventBusEvent = () => {
    unsubscribeSearch?.();
    unsubscribeSetSort?.();
    unsubscribeRefresh?.();
    unsubscribeClearAssets?.();
    unsubscribeAssetDetailUpdated?.();
    unsubscribeAssetRenamed?.();
    unsubscribeFavoriteChanged?.();
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
    getDetail,
    isLoading,
    lastDetailAssetId,

    assetsData,
    isAppending,
    rawAssetsList,
    scrollbarStyles,
    isInitialLoading,
    appendSkeletonCount,

    fetchNextPage,
    refreshAssets
  };
};
