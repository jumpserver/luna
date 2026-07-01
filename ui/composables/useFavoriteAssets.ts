import type { AssetItem, AssetsResponse, RawAssetData } from "~/types";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { transformAssetsData } from "~/utils";

export const useFavoriteAssets = () => {
  const userInfoStore = useUserInfoStore();
  const { loggedIn, orgId } = storeToRefs(userInfoStore);
  const assets = ref<AssetItem[]>([]);
  const loading = ref(false);

  const load = async () => {
    if (!loggedIn.value || loading.value) return;
    loading.value = true;
    try {
      let data: AssetsResponse;
      if (isTauriRuntime()) {
        data = await useTauriCoreInvoke("get_favorite_asset_list", { limit: 50 });
      } else {
        const query = new URLSearchParams({ offset: "0", limit: "50" });
        const response = await fetch(`${withWebSitePrefix("/api/v1/perms/users/self/nodes/favorite/assets/")}?${query}`, {
          credentials: "include",
          headers: getWebApiHeaders()
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        data = await response.json() as AssetsResponse;
      }
      assets.value = transformAssetsData((data.results || []) as RawAssetData[])
        .map((asset) => ({ ...asset, isFavorite: true }));
    } catch {
      assets.value = [];
    } finally {
      loading.value = false;
    }
  };

  watch([loggedIn, orgId], () => {
    assets.value = [];
  });

  const unsubscribeFavorite = useEventBus().on("favoriteChanged", () => load(), false);
  onBeforeUnmount(unsubscribeFavorite);

  return { assets, loading, load };
};
