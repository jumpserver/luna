import type { Ref } from "vue";
import type { AssetItem, AssetPageType, ConnectionInfo, PermedProtocol } from "~/types/index";
import { computed } from "vue";
import { getConfiguredAppName, isDefaultAppName } from "~/composables/useAppName";
import { useUserInfoStore } from "~/store/modules/userInfo";

const HIDDEN_DATABASE_ASSET_TYPES = new Set(["oracle", "mongodb"]);
const appName = getConfiguredAppName();

export const useDisplayAssets = (
  assets: Ref<AssetItem[]>,
  platform?: Ref<string | undefined>,
  pageType?: Ref<AssetPageType | undefined>
) => {
  const userInfoStore = useUserInfoStore();

  const visibleAssets = computed<AssetItem[]>(() => {
    const platformVal = platform?.value;
    const pageTypeVal = pageType?.value;

    const baseList
      = !platformVal || platformVal === "all"
        ? assets.value
        : assets.value.filter((item: AssetItem) => item.platform === platformVal);

    const list = pageTypeVal === "database" && !isDefaultAppName(appName)
      ? baseList.filter((item: AssetItem) => !HIDDEN_DATABASE_ASSET_TYPES.has((item.type || "").toLowerCase()))
      : baseList;

    const buildDisplayAddressLine = (asset: AssetItem, saved?: ConnectionInfo | null) => {
      const protocol = saved?.protocol;

      if (protocol) {
        const permed = (asset.permedProtocols || []).find((p: PermedProtocol | undefined) => p?.name === protocol);
        const port = permed?.port;
        const addr = asset.address || "";
        const selected = (saved?.username || "").trim();
        const mode = saved?.accountMode;

        let username = "";
        if (mode === "manual" || selected === "手动输入" || selected === "Manual input") {
          username = (saved?.manualUsername || "").trim();
        } else if (mode === "dynamic" || selected.includes("同名账号") || selected.includes("Dynamic user")) {
          username = ""; // dynamic has no fixed username in URI
        } else if (mode === "anonymous" || selected.includes("@ANON")) {
          username = "";
        } else if (selected) {
          username = selected;
        }

        const userPart = username ? `${username}@` : "";
        return `${protocol}://${userPart}${addr}${port ? `:${port}` : ""}`;
      }

      return `${asset.address}`;
    };

    return list.map((a) => {
      const saved = userInfoStore.getConnectionInfoForAsset(a.id);

      return {
        ...a,
        displayAddressLine: buildDisplayAddressLine(a, saved),
        savedConnection: saved
      } as AssetItem;
    });
  });

  return { visibleAssets };
};
